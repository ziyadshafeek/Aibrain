import { useEffect, useMemo, useRef, useState } from "react";
import type { NoteRef } from "@/lib/notes";

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderRef(code: string, qcode: string, refs: NoteRef[]) {
  const qnum = Number(qcode.replace(/^Q/i, ""));
  const hit =
    refs.find((r) => r.code === code && (r.sourceQnum ?? r.qnum) === qnum) ??
    refs.find((r) => (r.sourceQnum ?? r.qnum) === qnum && (!r.code || !code));
  const label = hit?.label ?? `Q${qnum}`;
  if (hit?.noteId) {
    return `<a class="note-ref" href="#note-${escapeHtml(hit.noteId)}" data-note-id="${escapeHtml(hit.noteId)}" data-note-subject="${escapeHtml(hit.subject)}" data-note-session="${escapeHtml(hit.session)}" data-note-q="${hit.qnum}" data-note-paper="${escapeHtml(hit.paperId ?? "")}">${escapeHtml(label)}</a>`;
  }
  return `<span class="note-ref note-ref-missing" title="That question is not in the notes bank">${escapeHtml(label)}</span>`;
}

function inline(s: string, refs: NoteRef[]) {
  const protectedParts: string[] = [];
  const protect = (value: string) => {
    const key = `@@PROTECTED${protectedParts.length}@@`;
    protectedParts.push(value);
    return key;
  };

  let shielded = s.replace(
    /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]|<br\s*\/?>)/gi,
    protect,
  );

  const markers: string[] = [];
  shielded = shielded.replace(/\[\[KUHS-QUESTION:(\d+):(Q\d+)\]\]/g, (_, code, qcode) => {
    const key = `@@MARK${markers.length}@@`;
    markers.push(renderRef(code, qcode, refs));
    return key;
  });

  const markdownLinks: string[] = [];
  shielded = shielded.replace(/!?(\[[^\]]+\]\()(https?:\/\/[^\s)]+)(\))/g, (m) => {
    const key = `@@LINK${markdownLinks.length}@@`;
    markdownLinks.push(m);
    return key;
  });

  let x = escapeHtml(shielded);
  x = x.replace(/`([^`]+)`/g, "<code>$1</code>");
  x = x.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  x = x.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  x = x.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  x = x.replace(/_([^_]+)_/g, "<em>$1</em>");
  x = x.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_, label, url) => `<a href="${url}" target="_blank" rel="noreferrer">${label}</a>`,
  );
  x = x.replace(/\bhttps?:\/\/[^\s<]+/g, (url) => {
    const trimmed = url.replace(/[),.;:!?]+$/, "");
    const suffix = url.slice(trimmed.length);
    return `<a href="${trimmed}" target="_blank" rel="noreferrer">${trimmed}</a>${suffix}`;
  });

  markdownLinks.forEach((m, i) => {
    const parsed = m.match(/^!?(?:\[([^\]]+)\]\()(https?:\/\/[^\s)]+)(\))$/);
    if (!parsed) return;
    const [, label, url] = parsed;
    const rendered = `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`;
    x = x.replace(`@@LINK${i}@@`, () => rendered);
  });

  markers.forEach((html, i) => {
    x = x.replace(`@@MARK${i}@@`, () => html);
  });

  protectedParts.forEach((m, i) => {
    const rendered = /^<br\s*\/?>$/i.test(m) ? "<br/>" : escapeHtml(m);
    x = x.replace(`@@PROTECTED${i}@@`, () => rendered);
  });
  return x;
}

type ListNode = {
  ordered: boolean;
  text: string;
  indent: number;
  children: ListNode[];
};

function parseListBlock(lines: string[], start: number) {
  const first = lines[start].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
  if (!first) return null;
  const nodes: ListNode[] = [];
  const stack: { node: ListNode; indent: number }[] = [];
  let i = start;

  while (i < lines.length) {
    const match = lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
    if (!match) break;
    const indent = match[1].replace(/\t/g, "  ").length;
    const ordered = /^\d/.test(match[2]);
    const node: ListNode = { ordered, text: match[3], indent, children: [] };

    while (stack.length && indent <= stack[stack.length - 1].indent) stack.pop();
    if (!stack.length) nodes.push(node);
    else stack[stack.length - 1].node.children.push(node);
    stack.push({ node, indent });
    i++;
  }

  const renderNodes = (items: ListNode[], refs: NoteRef[]) => {
    if (!items.length) return "";
    let out = "";
    let j = 0;
    while (j < items.length) {
      const ordered = items[j].ordered;
      let k = j;
      while (k < items.length && items[k].ordered === ordered) k++;
      const tag = ordered ? "ol" : "ul";
      out += `<${tag}>`;
      for (const item of items.slice(j, k)) {
        out += `<li>${inline(item.text, refs)}${item.children.length ? renderNodes(item.children, refs) : ""}</li>`;
      }
      out += `</${tag}>`;
      j = k;
    }
    return out;
  };

  return { nodes, next: i, render: (refs: NoteRef[]) => renderNodes(nodes, refs) };
}

function renderMarkdown(source: string, refs: NoteRef[]) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*\[\[KUHS-QUESTION:[^\]]+\]\]\s*$/.test(line)) {
      i++;
      continue;
    }

    if (/^```/.test(line.trim())) {
      const lang = line.trim().slice(3).trim();
      i++;
      const buf: string[] = [];
      while (i < lines.length && !/^```\s*$/.test(lines[i].trim())) {
        buf.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      out.push(
        `<div class="note-code-wrap"><div class="note-code-bar"><span>${escapeHtml(
          lang || "Figure",
        )}</span><button type="button" data-copy-code="${encodeURIComponent(
          buf.join("\n"),
        )}">Copy</button></div><pre class="note-code"><code>${escapeHtml(
          buf.join("\n"),
        )}</code></pre></div>`,
      );
      continue;
    }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = Math.min(h[1].length + 1, 6);
      out.push(`<h${level}>${inline(h[2], refs)}</h${level}>`);
      i++;
      continue;
    }

    if (/^\s*---+\s*$/.test(line)) {
      out.push("<hr/>");
      i++;
      continue;
    }

    if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(line)) {
      const list = parseListBlock(lines, i);
      if (list) {
        const html = list.render(refs);
        const refer = /refer to/i.test(lines.slice(i, list.next).join("\n"));
        out.push(refer ? `<div class="note-refer">${html}</div>` : html);
        i = list.next;
        continue;
      }
    }

    if (
      /^\s*\|/.test(line) &&
      i + 1 < lines.length &&
      /^\s*\|?\s*:?-+:?\s*(\||$)/.test(lines[i + 1])
    ) {
      const rows: string[][] = [];
      const cells = (value: string) => {
        const trimmed = value.trim();
        const raw = trimmed.replace(/^\|/, "").replace(/\|$/, "");
        return raw.split("|").map((x) => x.trim());
      };
      rows.push(cells(line));
      i += 2;
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        rows.push(cells(lines[i]));
        i++;
      }
      const head = rows.shift() ?? [];
      out.push(
        `<div class="note-table-scroll"><table><thead><tr>${head
          .map((c) => `<th>${inline(c, refs)}</th>`)
          .join("")}</tr></thead><tbody>${rows
          .map(
            (r) =>
              `<tr>${head
                .map((_, j) => `<td>${inline(r[j] ?? "", refs)}</td>`)
                .join("")}</tr>`,
          )
          .join("")}</tbody></table></div>`,
      );
      continue;
    }

    if (!line.trim()) {
      i++;
      continue;
    }

    const para: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !/^```/.test(lines[i].trim()) &&
      !/^\s*(?:[-*+]|\d+[.)])\s+/.test(lines[i]) &&
      !/^\s*\|/.test(lines[i]) &&
      !/^\s*---+\s*$/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    const joined = para.map((p) => inline(p, refs)).join("<br/>");
    const refer = /refer to/i.test(para.join("\n")) || /data-note-id/.test(joined);
    out.push(refer ? `<p class="note-refer">${joined}</p>` : `<p>${joined}</p>`);
  }

  return out.join("\n");
}

export function MarkdownNote({
  content,
  refs = [],
  zoom = 100,
  onOpenNote,
}: {
  content: string;
  refs?: NoteRef[];
  zoom?: number;
  onOpenNote?: (noteId: string, subject: string, session: string, qnum: number, paperId?: string) => void;
}) {
  const rootRef = useRef<HTMLElement>(null);
  const [html, setHtml] = useState("");
  const rendered = useMemo(() => renderMarkdown(content, refs), [content, refs]);

  useEffect(() => {
    setHtml(rendered);
    const typeset = () => {
      const root = rootRef.current;
      if (!root) return;
      const mj = (
        window as unknown as {
          MathJax?: { typesetPromise?: (els?: Element[]) => Promise<void> };
        }
      ).MathJax;
      if (mj?.typesetPromise) void mj.typesetPromise([root]).catch(() => undefined);
    };
    const id = window.setTimeout(typeset, 40);
    window.addEventListener("mathjax-ready", typeset);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("mathjax-ready", typeset);
    };
  }, [rendered]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.querySelectorAll<HTMLButtonElement>("[data-copy-code]").forEach((btn) => {
      btn.onclick = async () => {
        try {
          await navigator.clipboard.writeText(decodeURIComponent(btn.dataset.copyCode || ""));
          btn.textContent = "Copied";
          window.setTimeout(() => {
            btn.textContent = "Copy";
          }, 1000);
        } catch {
          /* clipboard may be blocked in preview */
        }
      };
    });
  }, [html]);

  return (
    <article
      ref={rootRef}
      className="note-reader"
      style={{ fontSize: `${zoom}%` }}
      onClick={(e) => {
        const a = (e.target as HTMLElement).closest<HTMLAnchorElement>("a[data-note-id]");
        if (!a) return;
        e.preventDefault();
        const id = a.dataset.noteId;
        if (!id) return;
        onOpenNote?.(id, a.dataset.noteSubject ?? "", a.dataset.noteSession ?? "", Number(a.dataset.noteQ ?? 0), a.dataset.notePaper || undefined);
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
