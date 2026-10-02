import { pdfProxy, sessionLabel, type Paper, type PaperText, type Question } from "@/lib/papers";
import { downloadBlob, slugify } from "@/lib/utils";

export type DownloadFormat = "text" | "pdf" | "originals";

export type DownloadProgress = {
  done: number;
  total: number;
  label: string;
};

function ascii(value: string) {
  return value
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2022|\uf0b7/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function packName(scope: string, format: DownloadFormat) {
  const slug = slugify(scope) || "papers";
  if (format === "text") return `KUHS-MBBS-${slug}.txt`;
  if (format === "pdf") return `KUHS-MBBS-${slug}.pdf`;
  return `KUHS-MBBS-${slug}-pdfs.zip`;
}

export function paperToText(paper: Paper, text?: PaperText): string {
  const lines: string[] = [];
  lines.push(paper.title);
  lines.push(sessionLabel(paper));
  if (paper.exam) lines.push(paper.exam);
  lines.push(`Q.P. Code: ${paper.code}  ·  ${paper.scheme === "unknown" ? "scheme n/a" : paper.scheme + " scheme"}`);
  lines.push("");
  if (text?.questions.length) {
    let section = "";
    for (const q of text.questions) {
      if (q.section !== section) {
        section = q.section;
        lines.push(section.toUpperCase());
        lines.push("");
      }
      lines.push(`${q.number}. ${q.text}`);
      lines.push("");
    }
  } else if (text?.text) {
    lines.push(text.text);
  } else {
    lines.push("(No extracted text — open the original PDF.)");
  }
  return lines.join("\n");
}

export function combinedText(papers: Paper[], texts: Record<string, PaperText>, scope: string): string {
  const parts = [
    `KUHS MBBS previous year papers`,
    scope,
    `${papers.length} paper${papers.length === 1 ? "" : "s"}`,
    `Source: Kerala University of Health Sciences`,
    "",
    "=".repeat(72),
    "",
  ];
  for (const paper of papers) {
    parts.push(paperToText(paper, texts[paper.id]));
    parts.push("");
    parts.push("-".repeat(72));
    parts.push("");
  }
  return parts.join("\n");
}

export function downloadTextPack(papers: Paper[], texts: Record<string, PaperText>, scope: string) {
  const body = combinedText(papers, texts, scope);
  downloadBlob(new Blob([body], { type: "text/plain;charset=utf-8" }), packName(scope, "text"));
}

function writeQuestions(
  doc: {
    setFont: (n: string, s: string) => void;
    setFontSize: (n: number) => void;
    text: (t: string | string[], x: number, y: number) => void;
    splitTextToSize: (t: string, w: number) => string[];
    addPage: () => void;
  },
  questions: Question[],
  y: number,
  pageHeight: number,
): number {
  let section = "";
  for (const q of questions) {
    if (q.section !== section) {
      section = q.section;
      if (y > pageHeight - 28) {
        doc.addPage();
        y = 22;
      }
      doc.setFont("times", "bold");
      doc.setFontSize(12);
      doc.text(ascii(section), 18, y);
      y += 8;
    }
    const body = ascii(`${q.number}. ${q.text}`);
    doc.setFont("times", "normal");
    doc.setFontSize(10.5);
    const wrapped = doc.splitTextToSize(body, 174);
    const need = wrapped.length * 5 + 4;
    if (y + need > pageHeight - 16) {
      doc.addPage();
      y = 22;
    }
    doc.text(wrapped, 18, y);
    y += need;
  }
  return y;
}

export async function downloadStudyPdf(papers: Paper[], texts: Record<string, PaperText>, scope: string) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageHeight = 297;
  doc.setFont("times", "bold");
  doc.setFontSize(18);
  doc.text("KUHS MBBS question papers", 18, 24);
  doc.setFont("times", "normal");
  doc.setFontSize(11);
  doc.text(ascii(scope), 18, 32);
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(`${papers.length} papers  ·  extracted from official KUHS PDFs`, 18, 38);
  doc.setTextColor(0);

  let y = 50;
  let first = true;
  for (const paper of papers) {
    if (!first) {
      doc.addPage();
      y = 22;
    }
    first = false;
    doc.setFont("times", "bold");
    doc.setFontSize(14);
    doc.text(ascii(paper.title), 18, y);
    y += 7;
    doc.setFont("times", "normal");
    doc.setFontSize(10);
    doc.setTextColor(80);
    const meta = ascii(
      [sessionLabel(paper), paper.phaseLabel, paper.code, paper.scheme !== "unknown" ? `${paper.scheme} scheme` : null]
        .filter(Boolean)
        .join("  ·  "),
    );
    doc.text(meta, 18, y);
    y += 6;
    if (paper.exam) {
      const examLines = doc.splitTextToSize(ascii(paper.exam), 174);
      doc.text(examLines, 18, y);
      y += examLines.length * 5 + 3;
    }
    doc.setTextColor(0);
    const text = texts[paper.id];
    if (text?.questions.length) {
      y = writeQuestions(doc, text.questions, y + 2, pageHeight);
    } else if (text?.text) {
      doc.setFontSize(10);
      const paras = doc.splitTextToSize(ascii(text.text.slice(0, 12000)), 174);
      for (const line of paras) {
        if (y > pageHeight - 16) {
          doc.addPage();
          y = 22;
        }
        doc.text(line, 18, y);
        y += 5;
      }
    } else {
      doc.setFontSize(10);
      doc.setTextColor(110);
      doc.text("No extracted text. Use the original PDF pack.", 18, y);
      doc.setTextColor(0);
    }
  }

  doc.save(packName(scope, "pdf"));
}

async function fetchOriginal(paper: Paper): Promise<{ name: string; data: ArrayBuffer } | null> {
  const res = await fetch(pdfProxy(paper.path));
  if (!res.ok) return null;
  const data = await res.arrayBuffer();
  const safe = `${paper.year ?? "session"}-${(paper.month ?? "").slice(0, 3)}-${slugify(paper.subject ?? "paper")}-${slugify(paper.paper ?? paper.code)}.pdf`;
  const folder = slugify(paper.subject ?? "other");
  return { name: `${folder}/${safe}`, data };
}

export async function downloadOriginalZip(
  papers: Paper[],
  scope: string,
  onProgress?: (p: DownloadProgress) => void,
) {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  let done = 0;
  let failed = 0;
  const queue = [...papers];
  const workers = 3;

  async function worker() {
    while (queue.length) {
      const paper = queue.shift();
      if (!paper) return;
      onProgress?.({
        done,
        total: papers.length,
        label: paper.title,
      });
      try {
        const file = await fetchOriginal(paper);
        if (file) zip.file(file.name, file.data);
        else failed += 1;
      } catch {
        failed += 1;
      }
      done += 1;
      onProgress?.({ done, total: papers.length, label: paper.title });
    }
  }

  await Promise.all(Array.from({ length: Math.min(workers, papers.length) }, () => worker()));
  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, packName(scope, "originals"));
  return { done, failed };
}
