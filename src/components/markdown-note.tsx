import { useEffect, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inline(s: string) {
  // Keep TeX, <br>, and markdown links out of the emphasis/url passes so we
  // never rewrite URLs inside href attributes or break formulas.
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
    const safeLabel = escapeHtml(label);
    const safeUrl = escapeHtml(url);
    const rendered = `<a href="${safeUrl}" target="_blank" rel="noreferrer">${safeLabel}</a>`;
    x = x.replace(`@@LINK${i}@@`, () => rendered);
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
  const stack: { node: ListNode; indent: number; list: ListNode[] }[] = [];
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
    stack.push({ node, indent, list: stack.length ? stack[stack.length - 1].list : nodes });
    i++;
  }

  const renderNodes = (items: ListNode[]) => {
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
        out += `<li>${inline(item.text)}${item.children.length ? renderNodes(item.children) : ""}</li>`;
      }
      out += `</${tag}>`;
      j = k;
    }
    return out;
  };

  return { html: renderNodes(nodes), next: i };
}

function renderMarkdown(source: string) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*\[\[KUHS-QUESTION:[^\]]+\]\s*$/.test(line)) {
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
          lang || "ASCII / code",
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
      const level = h[1].length;
      const id = h[2]
        .replace(/<[^>]+>/g, "")
        .replace(/[^\p{L}\p{N}]+/gu, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase();
      out.push(`<h${level} id="note-${id}">${inline(h[2])}</h${level}>`);
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
        out.push(list.html);
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
          .map((c) => `<th>${inline(c)}</th>`)
          .join("")}</tr></thead><tbody>${rows
          .map(
            (r) =>
              `<tr>${head
                .map((_, j) => `<td>${inline(r[j] ?? "")}</td>`)
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
    out.push(`<p>${para.map(inline).join("<br/>")}</p>`);
  }

  return out.join("\n");
}

export function MarkdownNote({ content, zoom = 100 }: { content: string; zoom?: number }) {
  const [html, setHtml] = useState("");
  const rendered = useMemo(() => renderMarkdown(content), [content]);

  useEffect(() => {
    setHtml(rendered);

    const typeset = () => {
      const root = document.getElementById("note-render-root");
      if (!root) return;
      const mj = (
        window as unknown as {
          MathJax?: { typesetPromise?: (els?: Element[]) => Promise<void> };
        }
      ).MathJax;
      if (mj?.typesetPromise) void mj.typesetPromise([root]).catch(() => undefined);
    };

    const id = window.setTimeout(typeset, 0);
    window.addEventListener("mathjax-ready", typeset);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("mathjax-ready", typeset);
    };
  }, [rendered]);

  useEffect(() => {
    const root = document.getElementById("note-render-root");
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
          // Clipboard access may be unavailable in a restricted preview.
        }
      };
    });
  }, [html]);

  return (
    <article
      id="note-render-root"
      className="note-reader"
      style={{ fontSize: `${zoom}%` }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function ExternalFigureLink({ href }: { href: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="note-figure-link">
      <ExternalLink className="size-3.5" /> Open figure
    </a>
  );
}
