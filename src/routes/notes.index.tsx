import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BookOpenCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useBank } from "@/components/study/bank-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { subjectSlug } from "@/lib/bank";

export const Route = createFileRoute("/notes/")({
  component: NotesHub,
});

function NotesHub() {
  const { idx, error } = useBank();

  return (
    <AppShell>
      <section className="mb-8">
        <p className="text-xs font-medium uppercase tracking-widest text-primary">Study notes</p>
        <h1 className="mt-2 font-display text-3xl font-medium tracking-tight sm:text-4xl">
          Every question, answered in depth.
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
          Structured notes for each question of every covered paper — with diagrams, formulas,
          tables and cross-links to related answers across subjects and years.
        </p>
        {idx ? (
          <dl className="mt-5 flex flex-wrap gap-6 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Subjects</dt>
              <dd className="font-display text-2xl font-medium tabular-nums">{idx.bank.subjects.length}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Questions with notes</dt>
              <dd className="font-display text-2xl font-medium tabular-nums">
                {idx.bank.stats.withNotes.toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Topics</dt>
              <dd className="font-display text-2xl font-medium tabular-nums">
                {idx.bank.topics.length.toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Diagrams</dt>
              <dd className="font-display text-2xl font-medium tabular-nums">{idx.bank.stats.diagrams}</dd>
            </div>
          </dl>
        ) : null}
      </section>

      {error ? (
        <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
      ) : null}

      {!idx && !error ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : null}

      {idx ? (
        <section className="grid gap-3 sm:grid-cols-2">
          {idx.bank.subjects.map((s) => {
            const years = s.years;
            return (
              <Link
                key={s.subject}
                to="/notes/$subject"
                params={{ subject: subjectSlug(s.subject) }}
                className="group rounded-2xl bg-card p-5 shadow-card transition-[box-shadow] duration-200 hover:shadow-card-hover"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-display text-xl font-medium tracking-tight">{s.display}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {s.papers} papers · {s.questions.toLocaleString()} questions
                      {years.length ? ` · ${years[years.length - 1]}–${years[0]}` : ""}
                    </p>
                  </div>
                  <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                    <BookOpenCheck className="size-4.5" aria-hidden />
                  </span>
                </div>
                <p className="mt-4 inline-flex items-center gap-1.5 font-mono text-sm tabular-nums text-primary">
                  {s.topics} topics
                  <ArrowRight className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden />
                </p>
              </Link>
            );
          })}
        </section>
      ) : null}
    </AppShell>
  );
}
