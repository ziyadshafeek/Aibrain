/**
 * Server-side PDF builder: question paper + fully rendered study notes.
 *
 * Layout contract (user spec):
 *   - Times ("Times New Roman") 12 pt body text
 *   - 1.5 line spacing
 *   - rendered markdown (headings, bullets, tables, bold/italic)
 *   - fenced ASCII diagrams drawn as boxed monospace figures (Courier)
 *   - LaTeX converted to readable plain text (WinAnsi-safe)
 */
import { jsPDF } from "jspdf";
import type { BankQuestion, NoteRef, NotesBank } from "./bank";

type Run = { text: string; bold?: boolean; italic?: boolean; mono?: boolean };

const PAGE_W = 595.28; // A4 in pt
const PAGE_H = 841.89;
const MARGIN_X = 54;
const MARGIN_TOP = 56;
const MARGIN_BOTTOM = 56;
const BODY = PAGE_W - 2 * MARGIN_X; // ~487 pt
const FS = 12;
const LH = 1.5;

/** Characters jsPDF's built-in (WinAnsi) fonts cannot encode. */
const UNI_FALLBACK: Record<string, string> = {
  "≥": ">=", "≤": "<=", "→": "->", "←": "<-", "↔": "<->", "Ω": "ohm", "ω": "omega",
  "α": "alpha", "β": "beta", "γ": "gamma", "δ": "delta", "θ": "theta", "λ": "lambda",
  "π": "pi", "σ": "sigma", "φ": "phi", "ψ": "psi", "∑": "Sum", "∞": "inf",
  "√": "sqrt", "≈": "~=", "≠": "!=", "⇒": "=>",
};
// WinAnsi extends Latin-1 with these (positions 0x80-0x9F)
const WINANSI_EXTRA = new Set(
  "€‚ƒ„…†‡ˆ‰Š‹ŒŽ''\"\"•–—˜™š›œžŸ".split(""),
);
function uni(s: string): string {
  // eslint-disable-next-line no-control-regex -- WinAnsi range check
  return s.replace(/[^\u0000-\u00ff]/g, (ch) => (WINANSI_EXTRA.has(ch) ? ch : UNI_FALLBACK[ch] ?? ""));
}

const GREEK: Record<string, string> = {
  alpha: "alpha", beta: "beta", gamma: "gamma", delta: "delta", epsilon: "epsilon",
  varepsilon: "epsilon", zeta: "zeta", eta: "eta", theta: "theta", vartheta: "theta",
  iota: "iota", kappa: "kappa", lambda: "lambda", mu: "mu", nu: "nu", xi: "xi",
  pi: "pi", rho: "rho", sigma: "sigma", tau: "tau", upsilon: "upsilon", phi: "phi",
  varphi: "phi", chi: "chi", psi: "psi", omega: "omega", Gamma: "Gamma", Delta: "Delta",
  Theta: "Theta", Lambda: "Lambda", Xi: "Xi", Pi: "Pi", Sigma: "Sigma", Phi: "Phi",
  Psi: "Psi", Omega: "Omega",
};

/** Convert a LaTeX snippet to readable plain text. */
export function mathToText(tex: string): string {
  let t = tex.trim();
  for (let i = 0; i < 3; i++) {
    t = t.replace(/\\(?:text|mathrm|mathbf|mbox|operatorname)\{([^{}]*)\}/g, "$1");
  }
  t = t.replace(/(\d)\s*\\frac/g, "$1 \\frac");
  t = t.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, (_m, a: string, b: string) =>
    (a.length > 1 ? `(${a})` : a) + "/" + (b.length > 1 ? `(${b})` : b));
  t = t.replace(/\\times/g, "×").replace(/\\cdot/g, ".");
  t = t.replace(/\\pm/g, "+/-").replace(/\\mp/g, "-/+");
  t = t.replace(/\\leq?/g, "<=").replace(/\\geq?/g, ">=").replace(/\\neq?/g, "!=").replace(/\\approx/g, "~=");
  t = t.replace(/\\to\b/g, "->").replace(/\\rightarrow\b/g, "->").replace(/\\leftarrow\b/g, "<-");
  t = t.replace(/\\infty/g, "inf").replace(/\\partial/g, "d").replace(/\\circ/g, "°").replace(/\\degree\b/g, "°");
  t = t.replace(/\\%/g, "%").replace(/\\\$/g, "$").replace(/\\[,;!]/g, " ");
  t = t.replace(/\\(alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|vartheta|iota|kappa|lambda|mu|nu|xi|pi|rho|sigma|tau|upsilon|phi|varphi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Phi|Psi|Omega)\b/g, (_m, g: string) => GREEK[g] ?? g);
  t = t.replace(/\^\{([^{}]*)\}/g, "^($1)").replace(/_\{([^{}]*)\}/g, "_($1)");
  t = t.replace(/\\\\/g, ", ").replace(/[{}]/g, "");
  return t;
}

/* ---------------- inline runs (bold / italic / code / links) ---------------- */

export function inlineRuns(s: string): Run[] {
  const runs: Run[] = [];
  const re = /(\*\*|__)(.+?)\1|(\*|_)(?!\s)(.+?)\3|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const push = (text: string, style: Partial<Run> = {}) => {
    if (text) runs.push({ text, ...style });
  };
  while ((m = re.exec(s))) {
    push(s.slice(last, m.index));
    if (m[2] !== undefined) push(m[2], { bold: true });
    else if (m[4] !== undefined) push(m[4], { italic: true });
    else if (m[5] !== undefined) push(m[5], { mono: true });
    else if (m[6] !== undefined) push(m[6], { italic: true });
    last = re.lastIndex;
  }
  push(s.slice(last));
  return runs;
}

/* ---------------- markdown structure ---------------- */

export type Block =
  | { t: "heading"; level: number; text: string }
  | { t: "para"; text: string }
  | { t: "list"; items: { text: string; depth: number; marker: string }[] }
  | { t: "code"; code: string }
  | { t: "table"; head: string[]; rows: string[][] }
  | { t: "quote"; text: string }
  | { t: "hr" };

const REF_MARKER = /\[\[KUHS-QUESTION:(\d{6}):Q(\d{1,2})\]\]/g;
const BARE_CITATION_LIST = /(?<!\[)\[(\d{6}:Q\d{1,2}(?:\s*,\s*\d{6}:Q\d{1,2})*)\](?!\])/g;

export type PdfRef = { text: string; url: string };

/** Parse note markdown into blocks; cross-refs become inline "→ See …" pointers. */
export function parseNote(content: string, refs?: NoteRef[], refLinks?: PdfRef[]): Block[] {
  const codeBoxes: string[] = [];
  let text = content.replace(/```[a-zA-Z]*\r?\n([\s\S]*?)```/g, (_m, code: string) => {
    codeBoxes.push(String(code).replace(/\s+$/, ""));
    return `\u0001CB${codeBoxes.length - 1}\u0001`;
  });
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex: string) => mathToText(tex));
  text = text.replace(/\$([^$\n]+?)\$/g, (_m, tex: string) => mathToText(tex));
  const refText = (code: string, qnum: number): string => {
    const nn = String(qnum).padStart(2, "0");
    const hit = refs?.find((r) => r.code === code && r.qnum === qnum && r.id);
    if (hit) {
      const paperId = hit.id!.split("__")[0];
      const title = hit.label.split("—").slice(1).join("—").trim();
      refLinks?.push({ text: `${code} Q${nn} — ${title}`, url: `/paper/${paperId}?q=${hit.id}` });
      return `→ See ${code} Q${nn} (${title})`;
    }
    return `→ See ${code} Q${nn}`;
  };
  text = text.replace(/`(\[\[KUHS-QUESTION:\d{6}:Q\d{1,2}\]\])`/g, "$1");
  text = text.replace(REF_MARKER, (_m, code: string, qn: string) => refText(code, Number(qn)));
  text = text.replace(BARE_CITATION_LIST, (_m, inner: string) =>
    inner
      .split(/\s*,\s*/)
      .map((el) => refText(el.slice(0, 6), Number(el.split(":Q")[1])))
      .join(", "),
  );
  text = text.replace(/<br\s*\/?>/gi, "\n");

  const lines = text.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }
    // eslint-disable-next-line no-control-regex
    const cb = trimmed.match(/^\u0001CB(\d+)\u0001$/);
    if (cb) {
      blocks.push({ t: "code", code: codeBoxes[Number(cb[1])] });
      i++;
      continue;
    }
    const h = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      blocks.push({ t: "heading", level: h[1].length, text: h[2].replace(/[*`]/g, "") });
      i++;
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ t: "hr" });
      i++;
      continue;
    }
    if (trimmed.startsWith(">")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        buf.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ t: "quote", text: buf.join(" ") });
      continue;
    }
    if (/^\|.*\|/.test(trimmed) && i + 1 < lines.length && /^\|[\s:|-]+\|?$/.test(lines[i + 1].trim())) {
      const cells = (l: string) =>
        l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = cells(lines[i]);
      i += 2;
      const rows: string[][] = [];
      let lastRowClosed = true; // did the last consumed row line end with `|`?
      while (i < lines.length && /^\|/.test(lines[i].trim()) && !/^\|[\s:|-]+\|?$/.test(lines[i].trim())) {
        const raw = lines[i].trim();
        rows.push(cells(raw));
        lastRowClosed = /\|$/.test(raw);
        i++;
        // continuation lines: a <br> inside a cell split the row across lines.
        // Only continue while the row was left open, or the piece closes it with `|`.
        while (
          rows.length &&
          i < lines.length &&
          lines[i].trim() &&
          (!lastRowClosed || /^\|/.test(lines[i].trim()) || /\|$/.test(lines[i].trim())) &&
          !/^(\||#{1,6}\s|[-*+]\s|\d{1,2}[.)]\s|>|(-{3,}|\*{3,}|_{3,})$)/.test(lines[i].trim()) &&
          // eslint-disable-next-line no-control-regex -- placeholder token check
      !/^\u0001CB\d+\u0001$/.test(lines[i].trim())
        ) {
          const piece = lines[i].trim().replace(/^\|/, "").replace(/\|$/, "");
          const r = rows[rows.length - 1];
          if (r && r.length) r[r.length - 1] += (r[r.length - 1].endsWith(" ") ? "" : " ") + piece;
          lastRowClosed = /\|$/.test(lines[i].trim());
          i++;
        }
      }
      blocks.push({ t: "table", head, rows });
      continue;
    }
    const li = trimmed.match(/^([-*+]|\d{1,2}[.)])\s+(.*)$/);
    if (li) {
      const items: { text: string; depth: number; marker: string }[] = [];
      while (i < lines.length) {
        const l = lines[i];
        const t2 = l.trim();
        if (!t2) {
          if (i + 1 < lines.length && /^\s*([-*+]|\d{1,2}[.)])\s+/.test(lines[i + 1])) {
            i++;
            continue;
          }
          break;
        }
        const mm = t2.match(/^([-*+]|\d{1,2}[.)])\s+(.*)$/);
        if (!mm) {
          if (/^(#{1,6}\s|\||>)/.test(t2)) break;
          if (items.length) items[items.length - 1].text += " " + t2;
          else break;
        } else {
          const indent = Math.floor((l.match(/^\s*/)?.[0].length ?? 0) / 2);
          items.push({
            marker: /^\d/.test(mm[1]) ? mm[1].replace(/[.)]/, "") : "•",
            text: mm[2],
            depth: Math.min(3, indent),
          });
        }
        i++;
      }
      blocks.push({ t: "list", items });
      continue;
    }
    const buf: string[] = [];
    while (i < lines.length) {
      const t3 = lines[i].trim();
      if (!t3) break;
      // stop at structural lines — but always consume at least one line so the
      // outer loop always makes progress
      if (buf.length > 0 && /^(#{1,6}\s|[-*+]\s|\d{1,2}[.)]\s|>|\||(-{3,}|\*{3,}|_{3,})$)/.test(t3)) break;
      // eslint-disable-next-line no-control-regex -- placeholder token check
      if (/^\u0001CB\d+\u0001$/.test(t3)) break;
      buf.push(t3);
      i++;
    }
    blocks.push({ t: "para", text: buf.join(" ") });
  }
  return blocks;
}

/* ---------------- the document ---------------- */

export type PdfMeta = {
  title: string;
  subtitle?: string;
  code?: string;
  origin?: string; // absolute site origin, enables clickable cross-refs
  coverNote?: string;
};

export class StudyPdf {
  doc: jsPDF;
  y = MARGIN_TOP;
  pageNo = 1;
  meta: PdfMeta;
  linkQueue: { url: string; x: number; y: number; w: number; h: number; page: number }[] = [];
  refsOut: { text: string; url: string }[] = [];

  constructor(meta: PdfMeta) {
    this.doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
    this.meta = meta;
    this.doc.setFont("times", "normal");
    this.doc.setLineHeightFactor(LH);
  }

  get bottom() {
    return PAGE_H - MARGIN_BOTTOM;
  }

  get right() {
    return PAGE_W - MARGIN_X;
  }

  newPage() {
    this.doc.addPage();
    this.pageNo++;
    this.y = MARGIN_TOP;
  }

  ensure(h: number) {
    if (this.y + h > this.bottom) this.newPage();
  }

  private setFont(run: Run, size: number) {
    const style = run.bold && run.italic ? "bolditalic" : run.bold ? "bold" : run.italic ? "italic" : "normal";
    this.doc.setFont(run.mono ? "courier" : "times", style);
    this.doc.setFontSize(size);
  }

  /** Draw word-wrapped styled runs at current y. */
  drawWrapped(runs: Run[], opts: { x?: number; size?: number; lh?: number; width?: number } = {}) {
    const size = opts.size ?? FS;
    const lh = (opts.lh ?? LH) * size;
    const x0 = opts.x ?? MARGIN_X;
    const width = opts.width ?? this.right - x0;
    // flatten to word tokens with measured widths
    const toks: { run: Run; word: string; w: number }[] = [];
    for (const run of runs) {
      this.setFont(run, size);
      for (const word of uni(run.text).split(/(\s+)/)) {
        if (!word) continue;
        toks.push({ run, word, w: this.doc.getTextWidth(word) });
      }
    }
    let line: { run: Run; word: string; w: number }[] = [];
    let lineW = 0;
    const flush = () => {
      if (!line.length) return;
      this.ensure(lh);
      let cx = x0;
      const yy = this.y + size * 0.82;
      for (const tok of line) {
        this.setFont(tok.run, size);
        this.doc.text(tok.word, cx, yy);
        cx += tok.w;
      }
      this.y += lh;
      line = [];
      lineW = 0;
    };
    for (const tok of toks) {
      if (lineW + tok.w > width && line.length) flush();
      if (tok.w > width && !/\s/.test(tok.word)) {
        // pathological long token: hard character wrap
        this.setFont(tok.run, size);
        let piece = "";
        for (const ch of tok.word) {
          if (this.doc.getTextWidth(piece + ch) > width) {
            this.ensure(lh);
            this.doc.text(piece, x0, this.y + size * 0.82);
            this.y += lh;
            piece = ch;
          } else piece += ch;
        }
        if (piece) {
          line.push({ run: tok.run, word: piece, w: this.doc.getTextWidth(piece) });
          lineW += this.doc.getTextWidth(piece);
        }
        continue;
      }
      line.push(tok);
      lineW += tok.w;
    }
    flush();
  }

  /** Boxed ASCII-art figure in Courier, fitted to the page width. */
  drawCodeBox(code: string) {
    const lines = code.split("\n");
    const maxLen = Math.max(1, ...lines.map((l) => l.length));
    const avail = BODY - 20;
    const fs = Math.min(9, avail / (0.6004 * maxLen));
    const lh = fs * 1.22;
    const boxH = lines.length * lh + 12;
    const boxW = Math.min(BODY, maxLen * 0.6004 * fs + 18);
    if (this.y + boxH > this.bottom) this.newPage();
    const x = MARGIN_X + (BODY - boxW) / 2;
    this.doc.setDrawColor(130);
    this.doc.setLineWidth(0.8);
    this.doc.setFillColor(252, 252, 250);
    this.doc.roundedRect(x, this.y, boxW, boxH, 4, 4, "FD");
    this.doc.setFont("courier", "normal");
    this.doc.setFontSize(fs);
    let yy = this.y + 7 + fs;
    for (const l of lines) {
      this.doc.text(l, x + 9, yy);
      yy += lh;
    }
    this.y += boxH + 10;
  }

  /** GFM table with proportional columns. */
  drawTable(head: string[], rows: string[][]) {
    const size = 10.5;
    const lh = size * 1.35;
    const nCols = Math.max(head.length, ...rows.map((r) => r.length));
    const norm = (r: string[]) => {
      const out = [...r];
      while (out.length < nCols) out.push("");
      return out.slice(0, nCols);
    };
    const all = [norm(head), ...rows.map(norm)];
    const maxChars = new Array(nCols).fill(3);
    for (const r of all) r.forEach((c, j) => (maxChars[j] = Math.max(maxChars[j], c.length)));
    const totalUnits = maxChars.reduce((a, b) => a + b, 0);
    const weights = maxChars.map((c) => Math.max(c / totalUnits, 0.08));
    const wSum = weights.reduce((a, b) => a + b, 0);
    const widths = weights.map((w) => (w / wSum) * BODY);

    const drawRow = (cells: string[], bold: boolean) => {
      const cellLines = cells.map((c, j) => {
        this.doc.setFont("times", bold ? "bold" : "normal");
        this.doc.setFontSize(size);
        const plain = c.replace(/\*\*|__|`/g, "").replace(/\*+/g, "").replace(/_{2,}/g, "");
        return this.doc.splitTextToSize(uni(plain), widths[j] - 8) as string[];
      });
      const rowLines = Math.max(...cellLines.map((c) => c.length));
      this.ensure(rowLines * lh + 6);
      const top = this.y;
      let x = MARGIN_X;
      for (let j = 0; j < nCols; j++) {
        let yy = top + size * 0.85;
        for (const cl of cellLines[j]) {
          this.doc.setFont("times", bold ? "bold" : "normal");
          this.doc.setFontSize(size);
          this.doc.text(cl, x + 4, yy);
          yy += lh;
        }
        x += widths[j];
      }
      this.y = top + rowLines * lh + 3;
      this.doc.setDrawColor(190);
      this.doc.setLineWidth(0.4);
      this.doc.line(MARGIN_X, this.y, MARGIN_X + BODY, this.y);
    };

    this.ensure(lh * 2 + 10);
    this.doc.setDrawColor(190);
    this.doc.setLineWidth(0.4);
    this.doc.line(MARGIN_X, this.y, MARGIN_X + BODY, this.y);
    drawRow(norm(head), true);
    for (const r of rows) drawRow(norm(r), false);
    this.y += 8;
  }

  /** Render parsed note blocks starting at column x. */
  drawNoteBlocks(blocks: Block[], x = MARGIN_X) {
    for (const b of blocks) {
      switch (b.t) {
        case "heading": {
          const sizes: Record<number, number> = { 1: 14, 2: 13, 3: 12.5, 4: 12, 5: 12, 6: 12 };
          const size = sizes[b.level] ?? 12;
          this.ensure(size * 1.6 + 4);
          this.y += 3;
          this.drawWrapped([{ text: b.text, bold: b.level <= 3 }], { x, size, lh: LH, width: this.right - x });
          if (b.level <= 2) {
            this.doc.setDrawColor(140);
            this.doc.setLineWidth(0.5);
            this.doc.line(x, this.y - 3, x + 80, this.y - 3);
          }
          this.y += 3;
          break;
        }
        case "para":
          this.drawWrapped(inlineRuns(b.text), { x, width: this.right - x });
          this.y += 5;
          break;
        case "list":
          for (const item of b.items) {
            const ix = x + item.depth * 14 + 12;
            this.drawWrapped(
              [{ text: `${item.marker}  ` }].concat(inlineRuns(item.text)),
              { x: ix, width: this.right - ix },
            );
          }
          this.y += 3;
          break;
        case "code":
          this.drawCodeBox(b.code);
          break;
        case "table":
          this.drawTable(b.head, b.rows);
          break;
        case "quote": {
          this.ensure(20);
          const startY = this.y;
          this.doc.setDrawColor(110);
          this.doc.setLineWidth(1.4);
          this.drawWrapped(inlineRuns(b.text), { x: x + 14, width: this.right - x - 14 });
          this.doc.line(x + 3, startY + 3, x + 3, Math.max(startY + 8, this.y - 6));
          this.y += 4;
          break;
        }
        case "hr":
          this.y += 4;
          this.doc.setDrawColor(170);
          this.doc.setLineWidth(0.5);
          this.doc.line(x, this.y, this.right, this.y);
          this.y += 9;
          break;
      }
    }
  }

  /** One question: official text + its full note. */
  drawQuestion(q: BankQuestion) {
    const doc = this.doc;
    this.ensure(52);
    this.y += 12;
    doc.setFont("times", "bold");
    doc.setFontSize(12.5);
    const head = `Q${q.qnum}.  ${q.section}`;
    doc.text(head, MARGIN_X, this.y + 10);
    this.y += 18;
    if (q.officialText) {
      this.drawWrapped([{ text: q.officialText }], { x: MARGIN_X + 10, width: BODY - 10 });
      this.y += 4;
    }
    if (q.hasNote && q.note) {
      this.ensure(30);
      doc.setFont("times", "bolditalic");
      doc.setFontSize(11);
      doc.setTextColor(58, 84, 72);
      const label = "Study Notes";
      doc.text(label, MARGIN_X + 10, this.y + 9);
      doc.setTextColor(0);
      this.y += 18;
      const blocks = parseNote(q.note.content, q.note.refs, this.refsOut);
      this.drawNoteBlocks(blocks, MARGIN_X + 10);
    }
  }

  finish() {
    // footers on every page
    for (let p = 1; p <= this.pageNo; p++) {
      doc_pageFooter(this, p);
    }
    const origin = this.meta.origin ?? "";
    for (const l of this.linkQueue) {
      if (!origin) break;
      try {
        this.doc.setPage(l.page);
        this.doc.link(l.x, l.y, l.w, l.h, { url: origin + l.url });
      } catch {
        /* best-effort */
      }
    }
    return this.doc.output("arraybuffer");
  }
}

function doc_pageFooter(pdf: StudyPdf, page: number) {
  const doc = pdf.doc;
  doc.setPage(page);
  doc.setFont("times", "italic");
  doc.setFontSize(9);
  doc.setTextColor(110);
  const foot = uni(pdf.meta.title).slice(0, 90);
  doc.text(foot, MARGIN_X, PAGE_H - 30);
  doc.text(`Page ${page}`, PAGE_W - MARGIN_X - 40, PAGE_H - 30);
  doc.setTextColor(0);
}

export type PaperPdfInput = {
  bank: NotesBank;
  questions: BankQuestion[];
  meta: PdfMeta;
};

const SECTION_ORDER = ["Long Essay", "Short Essay", "Short Note", "Short Answer", "Draw Diagram", "Multiple Choice", "Question"];

export function buildPaperPdf(input: PaperPdfInput): ArrayBuffer {
  const { bank, questions, meta } = input;
  const pdf = new StudyPdf(meta);

  // cover
  const doc = pdf.doc;
  doc.setFont("times", "bold");
  doc.setFontSize(19);
  doc.text("Kerala University of Health Sciences", PAGE_W / 2, 150, { align: "center" });
  doc.setFont("times", "normal");
  doc.setFontSize(12);
  doc.text("MBBS Professional Examination — Question Paper with Study Notes", PAGE_W / 2, 176, { align: "center" });
  doc.setDrawColor(60);
  doc.setLineWidth(1.2);
  doc.line(MARGIN_X + 60, 196, PAGE_W - MARGIN_X - 60, 196);
  doc.setFont("times", "bold");
  doc.setFontSize(16);
  let y = 250;
  for (const l of doc.splitTextToSize(meta.title, BODY - 40) as string[]) {
    doc.text(l, PAGE_W / 2, y, { align: "center" });
    y += 24;
  }
  doc.setFont("times", "italic");
  doc.setFontSize(13);
  if (meta.subtitle) {
    for (const l of doc.splitTextToSize(meta.subtitle, BODY - 40) as string[]) {
      doc.text(l, PAGE_W / 2, y, { align: "center" });
      y += 20;
    }
  }
  doc.setFont("times", "normal");
  y += 10;
  if (meta.code) {
    doc.text(`Question paper code: ${meta.code}`, PAGE_W / 2, y, { align: "center" });
    y += 20;
  }
  if (meta.coverNote) {
    doc.setTextColor(90);
    for (const l of doc.splitTextToSize(meta.coverNote, BODY - 60) as string[]) {
      doc.text(l, PAGE_W / 2, y, { align: "center" });
      y += 18;
    }
    doc.setTextColor(0);
  } else {
    doc.setTextColor(90);
    doc.text(`${bank.stats.withNotes} questions with study notes`, PAGE_W / 2, y, { align: "center" });
    doc.setTextColor(0);
  }
  pdf.y = 340;

  // sections
  const groups = new Map<string, BankQuestion[]>();
  for (const q of questions) {
    const key = q.section || "Question";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(q);
  }
  const keys = [...groups.keys()].sort((a, b) => {
    const ia = SECTION_ORDER.indexOf(a);
    const ib = SECTION_ORDER.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.localeCompare(b);
  });

  for (const key of keys) {
    const qs = groups.get(key)!;
    pdf.ensure(64);
    pdf.y += 8;
    doc.setFont("times", "bold");
    doc.setFontSize(13);
    doc.setFillColor(238, 241, 236);
    const label = `${key.toUpperCase()} — ${qs.length} question${qs.length > 1 ? "s" : ""}`;
    doc.rect(MARGIN_X, pdf.y - 4, BODY, 21, "F");
    doc.text(label, MARGIN_X + 8, pdf.y + 10.5);
    pdf.y += 32;
    for (const q of qs) pdf.drawQuestion(q);
  }

  // cross-reference appendix (clickable links)
  const uniqueRefs = [...new Map(pdf.refsOut.map((r) => [r.text, r])).values()];
  if (uniqueRefs.length) {
    pdf.newPage();
    doc.setFont("times", "bold");
    doc.setFontSize(13);
    doc.text("Cross-references used in these notes", MARGIN_X, pdf.y + 8);
    pdf.y += 26;
    doc.setFontSize(11);
    doc.setFont("times", "normal");
    for (const r of uniqueRefs) {
      const w = doc.getTextWidth(r.text);
      pdf.ensure(16);
      doc.text(r.text, MARGIN_X + 6, pdf.y + 9);
      pdf.linkQueue.push({ url: r.url, x: MARGIN_X + 6, y: pdf.y, w: Math.min(w, BODY), h: 12, page: pdf.pageNo });
      pdf.y += 16;
    }
  }

  return pdf.finish();
}
