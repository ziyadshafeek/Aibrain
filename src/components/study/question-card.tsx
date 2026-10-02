import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, StickyNote } from "lucide-react";
import type { BankQuestion } from "@/lib/bank";
import { NoteMarkdown } from "./note-markdown";
import { cn } from "@/lib/utils";

/**
 * One question of a paper: official text on top, +/- collapsible study notes.
 */
export function QuestionCard({
  q,
  defaultOpen = false,
  highlight = false,
}: {
  q: BankQuestion;
  defaultOpen?: boolean;
  highlight?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpen(defaultOpen);
  }, [defaultOpen]);

  useEffect(() => {
    if (highlight && ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [highlight]);

  const referOnly = q.note?.kind === "refer";

  return (
    <div
      ref={ref}
      id={`q-${q.id}`}
      className={cn(
        "group rounded-xl border border-rule/60 bg-paper-card transition-colors",
        highlight && "ring-2 ring-moss",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-4 py-3.5 text-left sm:px-5"
      >
        <span
          className={cn(
            "mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-lg border font-mono text-xs font-semibold tabular-nums",
            open
              ? "border-transparent bg-moss text-ink-on-accent"
              : "border-rule/60 bg-surface-muted text-fg-muted",
          )}
          aria-hidden
        >
          {q.qnum}
        </span>
        <span className="min-w-0 flex-1">
          <span className="mb-1 flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-fg-muted">
              {q.section}
            </span>
            {referOnly ? (
              <span className="rounded-md bg-amber-glow/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-glow">
                linked note
              </span>
            ) : null}
            {q.topic ? (
              <span className="max-w-full truncate text-[11px] italic text-fg-soft" title={q.topic}>
                {q.topic}
              </span>
            ) : null}
          </span>
          <span className="block text-[13.5px] leading-relaxed text-fg sm:text-sm">
            {q.officialText ?? (
              <em className="text-fg-soft">Question text unavailable — see the original paper.</em>
            )}
          </span>
        </span>
        <span
          className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-lg border border-rule/60 bg-surface-muted px-2 py-1 text-[11px] font-medium text-fg-muted transition-colors group-hover:border-moss group-hover:text-moss"
          title={open ? "Hide study notes" : "Show study notes"}
        >
          <StickyNote className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">{open ? "Hide" : "Notes"}</span>
          {open ? <ChevronDown className="size-3.5" aria-hidden /> : <ChevronRight className="size-3.5" aria-hidden />}
        </span>
      </button>

      {open && q.note ? (
        <div className="border-t border-rule/60 px-4 pb-5 pt-4 sm:px-6">
          <p className="mb-3 font-display text-base font-semibold text-fg">{q.note.title}</p>
          <NoteMarkdown content={q.note.content} refs={q.note.refs} />
        </div>
      ) : null}
      {open && !q.note ? (
        <div className="border-t border-rule/60 px-4 pb-5 pt-4 text-sm text-fg-soft sm:px-6">
          No separate note — this question's answer is part of the merged MCQ key or the original paper.
        </div>
      ) : null}
    </div>
  );
}
