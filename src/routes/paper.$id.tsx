import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { ArrowLeft, ArrowRight, Bookmark, ExternalLink } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { QuestionCard } from "@/components/study/question-card";
import { DownloadPdfButton } from "@/components/study/download-button";
import { useBank } from "@/components/study/bank-provider";
import { usePapers } from "@/components/papers-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { sessionPretty, subjectSlug } from "@/lib/bank";
import { pdfProxy } from "@/lib/papers";
import { useLibrary } from "@/lib/store";
import { cn } from "@/lib/utils";

type PaperSearch = { q?: string };

export const Route = createFileRoute("/paper/$id")({
  validateSearch: (s: Record<string, unknown>): PaperSearch => ({
    q: typeof s.q === "string" ? s.q : undefined,
  }),
  component: PaperPage,
});

const SECTION_ORDER = [
  "Long Essay",
  "Short Essay",
  "Short Note",
  "Short Answer",
  "Draw Diagram",
  "Multiple Choice",
  "Question",
];

function PaperPage() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const { idx, error } = useBank();
  const { papers: catalogPapers } = usePapers();
  const toggle = useLibrary((s) => s.toggleBookmark);
  const bookmarked = useLibrary((s) => s.bookmarks.includes(id));
  const addRecent = useLibrary((s) => s.addRecent);

  const paper = useMemo(() => idx?.bank.papers.find((p) => p.id === id), [idx, id]);
  const questions = useMemo(() => idx?.byPaper.get(id) ?? [], [idx, id]);
  const catPaper = useMemo(() => catalogPapers.find((p) => p.id === id), [catalogPapers, id]);

  useEffect(() => {
    if (paper) addRecent(paper.id);
  }, [paper, addRecent]);

  const siblings = useMemo(() => {
    if (!idx || !paper) return [];
    return idx.bank.papers
      .filter(
        (p) =>
          p.subject === paper.subject &&
          p.paper === paper.paper &&
          (paper.scheme === "unknown" || p.scheme === paper.scheme || p.scheme === "unknown"),
      )
      .sort((a, b) => {
        const ya = a.year ?? 0;
        const yb = b.year ?? 0;
        if (ya !== yb) return ya - yb;
        return (a.session ?? "").localeCompare(b.session ?? "");
      });
  }, [idx, paper]);

  const index = siblings.findIndex((p) => p.id === id);
  const prev = index > 0 ? siblings[index - 1] : undefined;
  const next = index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : undefined;

  const grouped = useMemo(() => {
    const groups = new Map<string, typeof questions>();
    for (const q of questions) {
      const key = q.section || "Question";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(q);
    }
    return [...groups.entries()].sort((a, b) => {
      const ia = SECTION_ORDER.indexOf(a[0]);
      const ib = SECTION_ORDER.indexOf(b[0]);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      return a[0].localeCompare(b[0]);
    });
  }, [questions]);

  if (idx && !paper) {
    throw notFound();
  }

  return (
    <AppShell dense>
      <div className="mb-5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Link to="/" className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="size-3.5" />
          All papers
        </Link>
        <span>/</span>
        <Link
          to="/notes/$subject"
          params={{ subject: paper ? subjectSlug(paper.subject) : "" }}
          className="capitalize hover:text-foreground"
        >
          {paper?.displaySubject ?? "…"}
        </Link>
        {paper?.year ? (
          <>
            <span>/</span>
            <Link to="/year/$year" params={{ year: String(paper.year) }} className="hover:text-foreground">
              {paper.year}
            </Link>
          </>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
      ) : null}

      {!idx ? (
        <div className="space-y-4">
          <Skeleton className="h-9 w-80" />
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-24 rounded-xl" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : null}

      {paper ? (
        <>
          <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {sessionPretty(paper.session)} · {paper.scheme === "unknown" ? "scheme n/a" : `${paper.scheme} scheme`}
              </p>
              <h1 className="mt-1 font-display text-3xl font-medium tracking-tight">
                {paper.displaySubject}
                {paper.paper ? ` — ${paper.paper}` : ""}
              </h1>
              <div className="mt-2.5 flex flex-wrap gap-1.5 text-xs">
                <span className="rounded-md bg-muted px-2 py-1 font-mono tabular-nums text-muted-foreground">
                  {paper.code}
                </span>
                <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">
                  {questions.length} questions
                </span>
                <span className="rounded-md bg-primary/15 px-2 py-1 font-medium text-primary">
                  {paper.withNotes} with notes
                </span>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => toggle(paper.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                  bookmarked
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
                aria-pressed={bookmarked}
              >
                <Bookmark className={cn("size-3.5", bookmarked && "fill-current")} aria-hidden />
                {bookmarked ? "Saved" : "Save"}
              </button>
              <DownloadPdfButton payload={{ paperId: paper.id }} label="Download paper + notes" />
            </div>
          </header>

          <div className="mb-5 flex items-center justify-between gap-3 text-sm">
            {prev ? (
              <Link
                to="/paper/$id"
                params={{ id: prev.id }}
                className="inline-flex min-h-11 items-center gap-1 text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="size-4" aria-hidden />
                {sessionPretty(prev.session)}
              </Link>
            ) : (
              <span />
            )}
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {index >= 0 ? `${index + 1} / ${siblings.length}` : null}
            </span>
            {next ? (
              <Link
                to="/paper/$id"
                params={{ id: next.id }}
                className="inline-flex min-h-11 items-center gap-1 text-muted-foreground hover:text-foreground"
              >
                {sessionPretty(next.session)}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            ) : (
              <span />
            )}
          </div>

          {search.q ? (
            <p className="mb-4 rounded-lg border border-primary/40 bg-primary/10 px-3.5 py-2.5 text-xs text-primary">
              Opened from a cross-reference — the linked question is highlighted below.
              <Link
                to="/paper/$id"
                params={{ id: paper.id }}
                search={{}}
                className="ml-2 underline underline-offset-2"
              >
                clear
              </Link>
            </p>
          ) : null}

          <div className="space-y-7">
            {grouped.map(([section, qs]) => (
              <section key={section}>
                <h2 className="mb-3 flex items-baseline gap-2.5 font-display text-lg font-semibold tracking-tight">
                  {section}
                  <span className="font-sans text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {qs.length} question{qs.length > 1 ? "s" : ""}
                  </span>
                </h2>
                <div className="space-y-2.5">
                  {qs.map((q) => (
                    <QuestionCard key={q.id} q={q} highlight={search.q === q.id} defaultOpen={search.q === q.id} />
                  ))}
                </div>
              </section>
            ))}
          </div>

          <p className="mt-10 text-center text-xs text-muted-foreground">
            Notes are AI-generated study aids — always cross-check with standard textbooks.
            {catPaper ? (
              <>
                <span className="mx-2" aria-hidden>·</span>
                Original KUHS PDF:{" "}
                <a
                  href={pdfProxy(catPaper.path)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-foreground"
                >
                  view <ExternalLink className="size-3" aria-hidden />
                </a>
              </>
            ) : null}
          </p>
        </>
      ) : null}
    </AppShell>
  );
}
