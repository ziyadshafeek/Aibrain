import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, BookOpenCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PaperCard } from "@/components/paper-card";
import { usePapers } from "@/components/papers-provider";
import { Button } from "@/components/ui/button";
import { subjectSlug } from "@/lib/bank";
import { uniqueSorted } from "@/lib/papers";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/subject/$subject")({
  component: SubjectPage,
});

function SubjectPage() {
  const { subject } = Route.useParams();
  const decoded = decodeURIComponent(subject);
  const { papers, loading } = usePapers();
  const [paperFilter, setPaperFilter] = useState("all");
  const [scheme, setScheme] = useState("all");
  const [year, setYear] = useState("all");

  const subjectPapers = useMemo(
    () => papers.filter((p) => p.subject === decoded),
    [papers, decoded],
  );

  const paperNames = useMemo(
    () => uniqueSorted(subjectPapers.map((p) => p.paper).filter((p): p is string => Boolean(p))),
    [subjectPapers],
  );
  const schemes = useMemo(
    () => uniqueSorted(subjectPapers.map((p) => p.scheme).filter((s) => s && s !== "unknown")),
    [subjectPapers],
  );
  const years = useMemo(
    () => uniqueSorted(subjectPapers.map((p) => p.year).filter((y): y is number => Boolean(y))),
    [subjectPapers],
  );

  const filtered = useMemo(
    () =>
      subjectPapers.filter(
        (p) =>
          (paperFilter === "all" || p.paper === paperFilter) &&
          (scheme === "all" || p.scheme === scheme) &&
          (year === "all" || String(p.year) === year),
      ),
    [subjectPapers, paperFilter, scheme, year],
  );

  const hasFilters = paperFilter !== "all" || scheme !== "all" || year !== "all";

  return (
    <AppShell dense>
      <div className="mb-5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Link to="/" className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="size-3.5" />
          All papers
        </Link>
        <span>/</span>
        <span className="text-foreground">{decoded}</span>
      </div>

      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-medium tracking-tight">{decoded}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {subjectPapers.length} paper{subjectPapers.length === 1 ? "" : "s"}
            {years.length ? ` · ${years[years.length - 1]}–${years[0]}` : ""}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/notes/$subject" params={{ subject: subjectSlug(decoded) }}>
            <BookOpenCheck className="size-4" />
            Study notes for {decoded}
          </Link>
        </Button>
      </header>

      {paperNames.length > 1 || schemes.length > 1 || years.length > 1 ? (
        <div className="mb-5 space-y-2">
          {paperNames.length > 1 ? (
            <FilterRow
              options={["all", ...paperNames]}
              value={paperFilter}
              onChange={setPaperFilter}
              labelOf={(v) => (v === "all" ? "All papers" : v)}
            />
          ) : null}
          {schemes.length > 1 ? (
            <FilterRow
              options={["all", ...schemes]}
              value={scheme}
              onChange={setScheme}
              labelOf={(v) => (v === "all" ? "All schemes" : `${v} scheme`)}
            />
          ) : null}
          {years.length > 1 ? (
            <FilterRow
              options={["all", ...years.map(String)]}
              value={year}
              onChange={setYear}
              labelOf={(v) => (v === "all" ? "All years" : v)}
            />
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading papers…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl bg-card px-6 py-12 text-center shadow-card">
          <p className="font-display text-lg">No papers match those filters</p>
          {hasFilters ? (
            <Button
              variant="ghost"
              className="mt-3"
              onClick={() => {
                setPaperFilter("all");
                setScheme("all");
                setYear("all");
              }}
            >
              Clear filters
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((p) => (
            <PaperCard key={p.id} paper={p} snippetText={null} />
          ))}
        </div>
      )}
    </AppShell>
  );
}

function FilterRow({
  options,
  value,
  onChange,
  labelOf,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  labelOf: (v: string) => string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={cn(
            "inline-flex min-h-9 items-center rounded-full border px-3 text-[13px] transition-colors duration-150",
            value === opt
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-foreground hover:bg-muted",
          )}
        >
          {labelOf(opt)}
        </button>
      ))}
    </div>
  );
}
