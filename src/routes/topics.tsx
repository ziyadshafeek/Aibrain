import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useBank } from "@/components/study/bank-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/topics")({
  component: TopicsIndex,
});

function TopicsIndex() {
  const { idx, error } = useBank();
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState<string>("all");

  const subjects = useMemo(() => {
    if (!idx) return [];
    return idx.bank.subjects.map((s) => ({ value: s.subject, label: s.display }));
  }, [idx]);

  const topics = useMemo(() => {
    if (!idx) return [];
    const q = query.trim().toLowerCase();
    return idx.bank.topics.filter((t) => {
      if (subject !== "all" && t.subject !== subject) return false;
      if (q && !t.display.toLowerCase().includes(q) && !t.key.includes(q)) return false;
      return true;
    });
  }, [idx, query, subject]);

  return (
    <AppShell>
      <section className="mb-7">
        <p className="text-xs font-medium uppercase tracking-widest text-primary">Topics</p>
        <h1 className="mt-2 font-display text-3xl font-medium tracking-tight sm:text-4xl">
          Study by topic, across every paper.
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
          {idx ? idx.bank.topics.length.toLocaleString() : "…"} recurring topics distilled from{" "}
          {idx ? idx.bank.stats.questions.toLocaleString() : "…"} questions. Pick a topic to see
          every paper that asked it — and download them together as one PDF.
        </p>
      </section>

      {error ? (
        <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
      ) : null}

      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <label className="relative block flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search topics — e.g. glaucoma, epistaxis, femoral nerve…"
            className="h-11 w-full rounded-xl border border-input bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
          />
        </label>
        <select
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="h-11 rounded-xl border border-input bg-card px-3 text-sm text-foreground focus:border-ring focus:outline-none"
          aria-label="Filter by subject"
        >
          <option value="all">All subjects</option>
          {subjects.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {!idx && !error ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-xl" />
          ))}
        </div>
      ) : null}

      {idx ? (
        <>
          <p className="mb-3 text-sm text-muted-foreground">
            {topics.length.toLocaleString()} topic{topics.length === 1 ? "" : "s"}
            {subject !== "all" ? ` in ${subjects.find((s) => s.value === subject)?.label}` : ""}
            {query ? ` matching “${query}”` : ""}
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {topics.slice(0, 300).map((t) => (
              <Link
                key={t.key}
                to="/topics/$key"
                params={{ key: t.key }}
                className="group flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-card px-3.5 py-2.5 text-sm shadow-card transition-[box-shadow] hover:shadow-card-hover"
              >
                <span className="min-w-0">
                  <span className="block truncate text-foreground group-hover:text-primary">{t.display}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{t.displaySubject}</span>
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-md px-1.5 py-0.5 font-mono text-xs tabular-nums",
                    t.count >= 4 ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                  )}
                >
                  {t.count}
                </span>
              </Link>
            ))}
          </div>
          {topics.length > 300 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Showing the 300 most frequent — refine the search to see more.
            </p>
          ) : null}
        </>
      ) : null}
    </AppShell>
  );
}
