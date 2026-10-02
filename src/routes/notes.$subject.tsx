import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, FileText, Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useBank } from "@/components/study/bank-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { sessionPretty, subjectSlug } from "@/lib/bank";

export const Route = createFileRoute("/notes/$subject")({
  component: SubjectNotes,
});

function SubjectNotes() {
  const { subject } = Route.useParams();
  const { idx, error } = useBank();
  const [query, setQuery] = useState("");

  const subjectData = useMemo(() => {
    if (!idx) return null;
    const s = idx.bank.subjects.find((x) => subjectSlug(x.subject) === subject);
    if (!s) return null;
    const topics = (idx.topicsBySubject.get(s.subject) ?? []).slice(); // sorted by count
    const papers = idx.bank.papers
      .filter((p) => p.subject === s.subject)
      .sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || (b.session ?? "").localeCompare(a.session ?? ""));
    return { s, topics, papers };
  }, [idx, subject]);

  if (idx && !subjectData) {
    throw notFound();
  }

  const filteredTopics = useMemo(() => {
    if (!subjectData) return [];
    const q = query.trim().toLowerCase();
    if (!q) return subjectData.topics;
    return subjectData.topics.filter(
      (t) => t.display.toLowerCase().includes(q) || t.key.includes(q),
    );
  }, [subjectData, query]);

  return (
    <AppShell dense>
      <div className="mb-5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Link to="/notes" className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="size-3.5" />
          Study notes
        </Link>
        <span>/</span>
        <span className="text-foreground">{subjectData?.s.display ?? "…"}</span>
      </div>

      {error ? (
        <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
      ) : null}

      {!idx ? (
        <div className="space-y-4">
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-11 w-full" />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="h-11 rounded-xl" />
            ))}
          </div>
        </div>
      ) : null}

      {subjectData ? (
        <>
          <header className="mb-6">
            <h1 className="font-display text-3xl font-medium tracking-tight">{subjectData.s.display}</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {subjectData.s.papers} papers · {subjectData.s.questions.toLocaleString()} questions ·{" "}
              {subjectData.s.topics} topics
              {subjectData.s.years.length
                ? ` · ${subjectData.s.years[subjectData.s.years.length - 1]}–${subjectData.s.years[0]}`
                : ""}
            </p>
          </header>

          <section className="mb-10">
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="font-display text-xl font-medium tracking-tight">Topics</h2>
              <label className="relative block sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter topics…"
                  className="h-10 w-full rounded-xl border border-input bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
                />
              </label>
            </div>
            {filteredTopics.length === 0 ? (
              <p className="text-sm text-muted-foreground">No topics match “{query}”.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {filteredTopics.map((t) => (
                  <Link
                    key={t.key}
                    to="/topics/$key"
                    params={{ key: t.key }}
                    className="group flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-card px-3.5 py-2.5 text-sm shadow-card transition-[box-shadow] hover:shadow-card-hover"
                  >
                    <span className="min-w-0 truncate text-foreground group-hover:text-primary">{t.display}</span>
                    <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs tabular-nums text-muted-foreground">
                      {t.count}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 font-display text-xl font-medium tracking-tight">Papers</h2>
            <div className="grid gap-2">
              {subjectData.papers.map((p) => (
                <Link
                  key={p.id}
                  to="/paper/$id"
                  params={{ id: p.id }}
                  className="group flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card px-4 py-3 shadow-card transition-[box-shadow] hover:shadow-card-hover"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <FileText className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {p.paper ? `${p.paper} — ` : ""}
                        {sessionPretty(p.session)}
                      </span>
                      <span className="block font-mono text-xs text-muted-foreground">
                        {p.code} · {p.scheme === "unknown" ? "scheme n/a" : `${p.scheme} scheme`} ·{" "}
                        {p.questions} questions
                      </span>
                    </span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </AppShell>
  );
}
