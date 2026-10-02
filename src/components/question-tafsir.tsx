import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowUpRight, BookOpen, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MarkdownNote } from "@/components/markdown-note";
import {
  displaySubject,
  noteAnchor,
  sittingLabel,
  type StudyNote,
} from "@/lib/notes";
import { cn } from "@/lib/utils";

export function QuestionTafsir({
  note,
  compact = false,
  highlight,
}: {
  note: StudyNote;
  compact?: boolean;
  highlight?: string;
}) {
  const navigate = useNavigate();

  function openNote(
    noteId: string,
    subject: string,
    session: string,
    qnum: number,
    paperId?: string | null,
  ) {
    const el = document.getElementById(noteAnchor(noteId));
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.classList.add("tafsir-flash");
      window.setTimeout(() => el.classList.remove("tafsir-flash"), 1400);
      return;
    }

    void navigate({
      to: "/notes/$subject",
      params: { subject: displaySubject(subject) },
      search: {
        session,
        q: String(qnum),
        paperId: paperId ?? undefined,
      },
      hash: noteAnchor(noteId),
    });
  }

  const question = note.questionText ?? note.title;

  return (
    <article
      id={noteAnchor(note.id)}
      className={cn(
        "tafsir-card",
        compact && "tafsir-compact",
        note.kind === "missing" && "tafsir-missing",
      )}
    >
      <header className="tafsir-meta">
        <span className="tafsir-num">Q{note.qnum}</span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="accent">{note.section}</Badge>
            <span className="text-xs text-muted-foreground">{sittingLabel(note)}</span>
            {note.kind === "refer" ? <Badge variant="outline">See also</Badge> : null}
            {note.kind === "missing" ? (
              <Badge variant="outline">No mapped note</Badge>
            ) : null}
          </div>
          <p className="mt-1 font-mono text-[11px] tabular-nums text-muted-foreground">
            {note.code} · {note.qcode}
          </p>
        </div>
      </header>

      <div className="tafsir-question-block">
        <p className="tafsir-question-label">Official KUHS question</p>
        <h2 className="tafsir-title">
          {highlight ? emphasize(question, highlight) : question}
        </h2>
      </div>

      {note.kind === "missing" ? (
        <div className="tafsir-empty">
          <BookOpen className="size-4" />
          <div>
            <strong>No study note was confidently mapped to this question.</strong>
            <p>
              The question remains here so the notes reader never silently hides a paper
              question or attaches a note to the wrong question.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="tafsir-divider">
            <BookOpen className="size-3.5" />
            <span>Study note</span>
          </div>

          <div className="tafsir-body">
            <div className="tafsir-note-heading">
              <span>Source note</span>
              <strong>{note.title}</strong>
            </div>
            <MarkdownNote
              content={note.content}
              refs={note.refs}
              onOpenNote={openNote}
            />
          </div>
        </>
      )}

      {note.refs.length ? (
        <div className="tafsir-see">
          <p>Cross-references</p>
          <div className="flex flex-wrap gap-2">
            {note.refs.map((ref) =>
              ref.noteId ? (
                <button
                  key={`${ref.noteId}-${ref.qnum}-${ref.session}`}
                  type="button"
                  className="note-ref-chip"
                  onClick={() =>
                    openNote(
                      ref.noteId!,
                      ref.subject,
                      ref.session,
                      ref.qnum,
                      ref.paperId,
                    )
                  }
                >
                  <span>{ref.label}</span>
                  {ref.title ? <span>{ref.title}</span> : null}
                </button>
              ) : (
                <span
                  key={`${ref.code}-${ref.qnum}-${ref.session}`}
                  className="note-ref-chip is-missing"
                >
                  <span>{ref.label}</span>
                  <span>Reference could not be verified</span>
                </span>
              ),
            )}
          </div>
        </div>
      ) : null}

      <div className="tafsir-foot">
        <Link
          to="/paper/$id"
          params={{ id: note.paperId }}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          Open original paper
          <ArrowUpRight className="size-3.5" />
        </Link>
        {note.kind === "refer" ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <ExternalLink className="size-3.5" />
            Reference note
          </span>
        ) : null}
      </div>
    </article>
  );
}

function emphasize(text: string, q: string) {
  const needle = q.trim();
  if (!needle) return text;
  const parts = text.split(new RegExp(`(${escapeReg(needle)})`, "ig"));
  return parts.map((part, i) =>
    part.toLowerCase() === needle.toLowerCase() ? (
      <mark key={i} className="rounded-sm bg-accent px-0.5 text-accent-foreground">
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function escapeReg(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
