import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, CheckSquare, Square } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { QuestionCard } from "@/components/study/question-card";
import { DownloadPdfButton } from "@/components/study/download-button";
import { useBank } from "@/components/study/bank-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { sessionPretty } from "@/lib/bank";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/topics/$key")({
  component: TopicPage,
});

function TopicPage() {
  const { key } = Route.useParams();
  const { idx, error } = useBank();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const topic = useMemo(() => idx?.topicsByKey.get(key), [idx, key]);

  const questions = useMemo(() => {
    if (!idx || !topic) return [];
    return topic.questionIds
      .map((id) => idx.byId.get(id))
      .filter((q): q is NonNullable<typeof q> => Boolean(q))
      .sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.qnum - b.qnum);
  }, [idx, topic]);

  const byPaper = useMemo(() => {
    const groups = new Map<string, typeof questions>();
    for (const q of questions) {
      if (!groups.has(q.paperId)) groups.set(q.paperId, []);
      groups.get(q.paperId)!.push(q);
    }
    return [...groups.entries()];
  }, [questions]);

  if (idx && !topic) {
    throw notFound();
  }

  const allSelected = questions.length > 0 && selected.size === questions.length;

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(questions.map((q) => q.id)));
  }

  return (
    <AppShell dense>
      <div className="mb-5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Link to="/topics" className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="size-3.5" />
          All topics
        </Link>
        <span>/</span>
        <span className="text-foreground">{topic?.display ?? "…"}</span>
      </div>

      {error ? (
        <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
      ) : null}

      {!idx ? (
        <div className="space-y-4">
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-6 w-48" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : null}

      {topic ? (
        <>
          <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {topic.displaySubject} · topic
              </p>
              <h1 className="mt-1 font-display text-3xl font-medium tracking-tight">{topic.display}</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Asked in {topic.count} question{topic.count > 1 ? "s" : ""} across {byPaper.length} paper
                {byPaper.length > 1 ? "s" : ""} · {topic.years.join(", ")}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={toggleAll}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {allSelected ? <CheckSquare className="size-3.5 text-primary" aria-hidden /> : <Square className="size-3.5" aria-hidden />}
                {allSelected ? "Clear selection" : `Select all (${questions.length})`}
              </button>
              {selected.size > 0 ? (
                <DownloadPdfButton
                  payload={{
                    questionIds: questions.filter((q) => selected.has(q.id)).map((q) => q.id),
                    title: topic.display,
                  }}
                  label={`Download ${selected.size} selected`}
                />
              ) : (
                <DownloadPdfButton payload={{ topicKey: topic.key }} label="Download topic PDF" />
              )}
            </div>
          </header>

          <div className="space-y-7">
            {byPaper.map(([paperId, qs]) => {
              const paper = idx!.bank.papers.find((p) => p.id === paperId);
              const paperSel = qs.every((q) => selected.has(q.id));
              return (
                <section key={paperId}>
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="flex items-baseline gap-2.5 font-display text-lg font-semibold tracking-tight">
                      {paper ? sessionPretty(paper.session) : paperId}
                      <span className="font-sans text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        {paper?.paper ?? ""} {qs.length > 1 ? `· ${qs.length} questions` : ""}
                      </span>
                    </h2>
                    <button
                      type="button"
                      onClick={() =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          const ids = qs.map((q) => q.id);
                          if (paperSel) ids.forEach((id) => next.delete(id));
                          else ids.forEach((id) => next.add(id));
                          return next;
                        })
                      }
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                        paperSel ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {paperSel ? <CheckSquare className="size-3.5" aria-hidden /> : <Square className="size-3.5" aria-hidden />}
                      {paperSel ? "selected" : "select"}
                    </button>
                  </div>
                  <div className="space-y-2.5">
                    {qs.map((q) => (
                      <div key={q.id} className="flex items-start gap-2">
                        <button
                          type="button"
                          onClick={() => toggleOne(q.id)}
                          className="mt-4 shrink-0 text-muted-foreground transition-colors hover:text-primary"
                          aria-label={selected.has(q.id) ? `Unselect question ${q.qnum}` : `Select question ${q.qnum}`}
                        >
                          {selected.has(q.id) ? (
                            <CheckSquare className="size-4 text-primary" aria-hidden />
                          ) : (
                            <Square className="size-4" aria-hidden />
                          )}
                        </button>
                        <div className="min-w-0 flex-1">
                          <QuestionCard q={q} />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>

          {selected.size > 0 ? (
            <div className="sticky bottom-4 mt-8 flex items-center justify-between gap-3 rounded-xl border border-primary/40 bg-card/95 px-4 py-3 shadow-card-hover backdrop-blur">
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{selected.size}</span> of {questions.length} questions selected
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
                <DownloadPdfButton
                  payload={{
                    questionIds: questions.filter((q) => selected.has(q.id)).map((q) => q.id),
                    title: topic.display,
                  }}
                  label="Download selection"
                  size="sm"
                />
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </AppShell>
  );
}
