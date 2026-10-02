import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { renderNote } from "@/lib/markdown";
import type { NoteRef } from "@/lib/bank";

/**
 * Renders a note's markdown to trusted HTML (see lib/markdown.ts for the
 * pipeline) and wires in-app navigation for cross-reference chips.
 */
export function NoteMarkdown({ content, refs, onNavigateRef }: { content: string; refs?: NoteRef[]; onNavigateRef?: () => void }) {
  const { html, unresolvedRefs } = useMemo(() => renderNote(content, refs), [content, refs]);
  const navigate = useNavigate();

  return (
    <div
      className="note-prose"
      // Content is produced by our own pipeline from the curated bank:
      // markdown text is escaped, and every injected tag is generated here.
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={(e) => {
        const a = (e.target as HTMLElement).closest("a.xref");
        if (!a) return;
        const href = a.getAttribute("href");
        if (!href) return;
        e.preventDefault();
        onNavigateRef?.();
        const u = new URL(href, "http://local");
        navigate({
          to: u.pathname as never,
          search: { q: u.searchParams.get("q") ?? undefined } as never,
        });
      }}
      data-unresolved={unresolvedRefs.length || undefined}
    />
  );
}
