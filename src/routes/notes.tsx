import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, ChevronRight, FileQuestion } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { NotesDownloadBar } from "@/components/notes-download-bar";
import { useNotes } from "@/components/notes-provider";
import { displaySubject } from "@/lib/notes";

export const Route = createFileRoute("/notes")({ component: NotesHome });

function NotesHome() {
  const { bank, notes, loading, error } = useNotes();
  const subjects = bank?.subjects ?? [];

  return (
    <AppShell>
      <section className="notes-hero">
        <div>
          <p className="eyebrow">Study notes</p>
          <h1>Question-by-question study commentary.</h1>
          <p>
            Every note is mapped against the official KUHS question it belongs to. Grouped MCQs
            are deliberately left out rather than guessed. If a question has no reliable note,
            it stays visible as a question with a clear “No note” status.
          </p>
        </div>
        <div className="notes-stat-grid">
          <Stat label="Questions indexed" value={bank?.stats.questions ?? "—"} />
          <Stat label="With notes" value={bank?.stats.withNotes ?? "—"} />
          <Stat label="Papers" value={bank?.stats.papers ?? "—"} />
        </div>
      </section>

      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
      {loading ? <p className="notes-loading">Loading the question index…</p> : null}

      {!loading ? (
        <>
          <div className="notes-page-intro">
            <div>
              <p className="eyebrow">Choose a subject</p>
              <h2>Open a question set</h2>
            </div>
            <p>
              Choose a subject, then a year and sitting. The reader follows the same order as the
              official question paper.
            </p>
          </div>

          <div className="note-set-grid">
            {subjects.map((s) => (
              <Link
                key={s.subject}
                to="/notes/$subject"
                params={{ subject: displaySubject(s.subject) }}
                className="note-set-card"
              >
                <div className="note-card-top">
                  <span className="font-mono text-xs tabular-nums">{s.papers} papers</span>
                  <span>{s.years.length ? `${s.years[s.years.length - 1]}–${s.years[0]}` : ""}</span>
                </div>
                <h2>{displaySubject(s.display)}</h2>
                <div className="note-card-metrics">
                  <span><FileQuestion className="size-3.5" /> {s.questions} questions</span>
                  <span><BookOpen className="size-3.5" /> {s.withNotes} with notes</span>
                  {s.missing ? <span className="muted">{s.missing} without a mapped note</span> : null}
                </div>
                <div className="note-card-bottom">
                  <span>{s.years.map(String).join(" · ")}</span>
                  <ChevronRight className="size-4" />
                </div>
              </Link>
            ))}
          </div>

          {notes.length ? <NotesDownloadBar notes={notes} /> : null}

          {bank?.stats.skippedGroupedMcq ? (
            <div className="notes-integrity-note">
              <strong>{bank.stats.skippedGroupedMcq} grouped MCQ blocks skipped.</strong>
              They are excluded from the question-to-note mapping because splitting individual
              MCQ items reliably would require guessing.
            </div>
          ) : null}

          {!subjects.length ? (
            <div className="notes-empty">
              <BookOpen />
              <h2>No notes loaded</h2>
              <p>The notes index could not be read.</p>
            </div>
          ) : null}
        </>
      ) : null}
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{typeof value === "number" ? value.toLocaleString() : value}</strong>
    </div>
  );
}
