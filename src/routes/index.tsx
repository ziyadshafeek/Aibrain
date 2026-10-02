import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowUpRight, Bookmark, BookOpenCheck, Layers3 } from "lucide-react";
import { useMemo } from "react";
import { AppShell } from "@/components/app-shell";
import { PaperCard } from "@/components/paper-card";
import { usePapers } from "@/components/papers-provider";
import { useBank } from "@/components/study/bank-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PHASES,
  SUBJECT_ORDER,
  countBy,
  filterPapers,
  searchInText,
  snippet,
  uniqueSorted,
  type SearchFilters,
} from "@/lib/papers";
import { useLibrary } from "@/lib/store";
import { cn } from "@/lib/utils";

type HomeSearch = SearchFilters;

export const Route = createFileRoute("/")({
  validateSearch: (s: Record<string, unknown>): HomeSearch => ({
    q: typeof s.q === "string" ? s.q : undefined,
    phase: typeof s.phase === "string" ? s.phase : undefined,
    subject: typeof s.subject === "string" ? s.subject : undefined,
    year: typeof s.year === "string" ? s.year : undefined,
    scheme: typeof s.scheme === "string" ? s.scheme : undefined,
    saved: typeof s.saved === "string" ? s.saved : undefined,
  }),
  component: Home,
});

function Home() {
  const filters = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { papers, texts, loading, error, catalog } = usePapers();
  const { idx } = useBank();
  const bookmarks = useLibrary((s) => s.bookmarks);
  const recents = useLibrary((s) => s.recents);

  const hasFilters = Boolean(
    filters.q || filters.phase || filters.subject || filters.year || filters.scheme || filters.saved,
  );

  const filtered = useMemo(() => {
    let list = papers;
    if (filters.saved === "1") {
      const set = new Set(bookmarks);
      list = list.filter((p) => set.has(p.id));
    }
    list = filterPapers(list, filters);
    const q = filters.q?.trim();
    if (q && Object.keys(texts).length) {
      const metaHits = new Set(list.map((p) => p.id));
      const textHits = searchInText(papers, texts, q);
      const extra = textHits.filter((p) => !metaHits.has(p.id));
      const filteredExtra = filterPapers(extra, { ...filters, q: undefined });
      const merged = [...list];
      const seen = new Set(merged.map((p) => p.id));
      for (const p of filteredExtra) {
        if (!seen.has(p.id)) merged.push(p);
      }
      return merged;
    }
    return list;
  }, [papers, texts, filters, bookmarks]);

  const subjectCounts = useMemo(() => countBy(papers, (p) => p.subject), [papers]);
  const yearCounts = useMemo(() => countBy(papers, (p) => (p.year ? String(p.year) : null)), [papers]);
  const years = useMemo(() => uniqueSorted(papers.map((p) => p.year)), [papers]);
  const schemes = useMemo(
    () => uniqueSorted(papers.map((p) => p.scheme).filter((s) => s && s !== "unknown")),
    [papers],
  );

  const recentPapers = useMemo(
    () => recents.map((id) => papers.find((p) => p.id === id)).filter(Boolean),
    [recents, papers],
  );

  function setFilter(patch: Partial<HomeSearch>) {
    void navigate({
      search: (prev) => {
        const next = { ...prev, ...patch };
        for (const key of Object.keys(next) as (keyof HomeSearch)[]) {
          if (!next[key]) delete next[key];
        }
        return next;
      },
    });
  }

  function clearFilters() {
    void navigate({ search: {} });
  }

  return (
    <AppShell>
      {loading ? <HomeSkeleton /> : null}
      {error ? (
        <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
      ) : null}

      {!loading && !hasFilters ? (
        <section className="mb-10">
          <p className="text-xs font-medium uppercase tracking-widest text-primary">
            Medical UG · KUHS
          </p>
          <h1 className="mt-2 max-w-2xl font-display text-4xl font-medium tracking-tight text-foreground sm:text-5xl">
            Every previous year paper — with study notes under every question.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
            Subjects follow the heading printed on each KUHS PDF. Open any paper to read the
            official questions with expandable notes, cross-linked answers, diagrams and
            formulas — then download the whole thing as a single PDF.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              to="/notes"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground shadow-card hover:shadow-card-hover"
            >
              <BookOpenCheck className="size-4 text-primary" />
              Browse study notes
            </Link>
            <Link
              to="/topics"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-medium text-foreground shadow-card hover:shadow-card-hover"
            >
              <Layers3 className="size-4 text-primary" />
              Study by topic
            </Link>
          </div>
          <dl className="mt-6 flex flex-wrap gap-6 text-sm">
            <Stat label="Papers" value={catalog?.count ?? papers.length} />
            <Stat label="Years" value={years.length} />
            <Stat label="Subjects" value={subjectCounts.size} />
            {idx ? <Stat label="Questions with notes" value={idx.bank.stats.withNotes} /> : null}
            {idx ? <Stat label="Topics" value={idx.bank.topics.length} /> : null}
          </dl>
        </section>
      ) : null}

      {!loading && !hasFilters ? (
        <section className="mb-10 grid gap-3 sm:grid-cols-2">
          {PHASES.map((phase) => {
            const n = papers.filter((p) => p.phase === phase.id).length;
            return (
              <Link
                key={phase.id}
                to="/"
                search={{ phase: phase.id }}
                className="group rounded-2xl bg-card p-5 shadow-card transition-[box-shadow] duration-200 hover:shadow-card-hover"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {phase.short}
                    </p>
                    <h2 className="mt-1 font-display text-xl font-medium tracking-tight">
                      {phase.label}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">{phase.subjects}</p>
                  </div>
                  <ArrowUpRight className="size-4 text-muted-foreground transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </div>
                <p className="mt-4 font-mono text-sm tabular-nums text-primary">{n} papers</p>
              </Link>
            );
          })}
        </section>
      ) : null}

      {!loading && !hasFilters ? (
        <section className="mb-10">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-xl font-medium tracking-tight">Subjects</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {SUBJECT_ORDER.filter((s) => subjectCounts.has(s)).map((subject) => (
              <Link
                key={subject}
                to="/subject/$subject"
                params={{ subject }}
                className="inline-flex min-h-11 items-center rounded-full border border-border bg-card px-3.5 text-sm text-foreground shadow-card transition-[box-shadow] duration-150 hover:shadow-card-hover"
              >
                {subject}
                <span className="ml-2 font-mono text-xs tabular-nums text-muted-foreground">
                  {subjectCounts.get(subject)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {!loading && !hasFilters ? (
        <section className="mb-10">
          <h2 className="mb-3 font-display text-xl font-medium tracking-tight">Years</h2>
          <div className="flex flex-wrap gap-2">
            {years.map((year) => (
              <Link
                key={year}
                to="/year/$year"
                params={{ year }}
                className="inline-flex min-h-11 items-center rounded-full border border-border bg-card px-3.5 text-sm text-foreground shadow-card transition-[box-shadow] duration-150 hover:shadow-card-hover"
              >
                {year}
                <span className="ml-2 font-mono text-xs tabular-nums text-muted-foreground">
                  {yearCounts.get(year)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {!loading && !hasFilters && recentPapers.length > 0 ? (
        <section className="mb-10">
          <h2 className="mb-3 font-display text-xl font-medium tracking-tight">Continue reading</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {recentPapers.slice(0, 4).map((p) => (
              <PaperCard key={p!.id} paper={p!} />
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-display text-xl font-medium tracking-tight">
              {filters.saved === "1" ? "Saved papers" : hasFilters ? "Results" : "Latest papers"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {filtered.length.toLocaleString()} {filtered.length === 1 ? "paper" : "papers"}
              {filters.q ? ` matching “${filters.q}”` : ""}
            </p>
          </div>
          {hasFilters ? (
            <Button variant="ghost" onClick={clearFilters}>
              Clear filters
            </Button>
          ) : null}
        </div>

        <div className="mb-5 flex flex-wrap gap-2">
          {PHASES.map((p) => (
            <FilterChip
              key={p.id}
              active={filters.phase === p.id}
              onClick={() => setFilter({ phase: filters.phase === p.id ? undefined : p.id })}
            >
              {p.short}
            </FilterChip>
          ))}
          {schemes.map((s) => (
            <FilterChip
              key={s}
              active={filters.scheme === s}
              onClick={() => setFilter({ scheme: filters.scheme === s ? undefined : s })}
            >
              {s} scheme
            </FilterChip>
          ))}
          {years.slice(0, 8).map((y) => (
            <FilterChip
              key={y}
              active={filters.year === y}
              onClick={() => setFilter({ year: filters.year === y ? undefined : y })}
            >
              {y}
            </FilterChip>
          ))}
          <FilterChip
            active={filters.saved === "1"}
            onClick={() => setFilter({ saved: filters.saved === "1" ? undefined : "1" })}
          >
            <Bookmark className="size-3.5" />
            Saved
          </FilterChip>
        </div>

        {filters.subject ? (
          <div className="mb-4">
            <Badge variant="accent">{filters.subject}</Badge>
          </div>
        ) : null}

        {filtered.length === 0 && !loading ? (
          <EmptyState saved={filters.saved === "1"} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {(hasFilters ? filtered : filtered.slice(0, 12)).map((paper) => (
              <PaperCard
                key={paper.id}
                paper={paper}
                snippetText={
                  filters.q && texts[paper.id] ? snippet(texts[paper.id].text, filters.q) : null
                }
              />
            ))}
          </div>
        )}

        {!hasFilters && filtered.length > 12 ? (
          <div className="mt-6 flex justify-center">
            <Button variant="outline" onClick={() => setFilter({ phase: "first" })}>
              <Layers3 className="size-4" />
              Browse all papers
            </Button>
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors duration-150",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="font-display text-2xl font-medium tabular-nums tracking-tight">
        {value.toLocaleString()}
      </dd>
    </div>
  );
}

function EmptyState({ saved }: { saved: boolean }) {
  return (
    <div className="rounded-xl bg-card px-6 py-12 text-center shadow-card">
      <p className="font-display text-lg font-medium">
        {saved ? "No saved papers yet" : "No papers match those filters"}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {saved
          ? "Open a paper and tap the bookmark to keep it here."
          : "Try a subject name, a year, or a topic like “femoral nerve”."}
      </p>
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-12 w-2/3" />
      <Skeleton className="h-20 w-full max-w-xl" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-32 rounded-2xl" />
      </div>
    </div>
  );
}
