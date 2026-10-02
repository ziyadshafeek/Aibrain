import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { DownloadPack } from "@/components/download-pack";
import { PaperCard } from "@/components/paper-card";
import { usePapers } from "@/components/papers-provider";
import { Button } from "@/components/ui/button";
import { SUBJECT_ORDER, uniqueSorted } from "@/lib/papers";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/year/$year")({
  component: YearPage,
});

function YearPage() {
  const { year } = Route.useParams();
  const { papers, texts, loading } = usePapers();
  const [subject, setSubject] = useState<string>("all");

  const yearPapers = useMemo(
    () => papers.filter((p) => String(p.year) === year),
    [papers, year],
  );

  const subjects = useMemo(
    () => SUBJECT_ORDER.filter((name) => yearPapers.some((p) => p.subject === name)),
    [yearPapers],
  );

  const visible = useMemo(
    () => (subject === "all" ? yearPapers : yearPapers.filter((p) => p.subject === subject)),
    [yearPapers, subject],
  );

  const months = useMemo(() => uniqueSorted(yearPapers.map((p) => p.month)), [yearPapers]);

  if (loading) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </AppShell>
    );
  }

  if (!yearPapers.length) {
    return (
      <AppShell>
        <p className="font-display text-lg">No papers for {year}.</p>
        <Button asChild className="mt-4">
          <Link to="/">Back</Link>
        </Button>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Link
        to="/"
        className="mb-4 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        All papers
      </Link>
      <p className="text-xs font-medium uppercase tracking-widest text-primary">Year-wise pack</p>
      <h1 className="mt-1 font-display text-4xl font-medium tracking-tight">{year}</h1>
      <p className="mt-2 text-muted-foreground">
        {yearPapers.length} papers
        {months.length ? ` · ${months.join(", ")}` : ""}
      </p>

      <div className="mt-6">
        <DownloadPack
          papers={visible}
          texts={texts}
          scope={subject === "all" ? String(year) : `${subject} ${year}`}
          compact
        />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Chip active={subject === "all"} onClick={() => setSubject("all")}>
          All subjects
        </Chip>
        {subjects.map((name) => (
          <Chip key={name} active={subject === name} onClick={() => setSubject(name)}>
            {name}
          </Chip>
        ))}
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {visible.map((p) => (
          <PaperCard key={p.id} paper={p} showSubject />
        ))}
      </div>
    </AppShell>
  );
}

function Chip({
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
        "inline-flex min-h-10 items-center rounded-full border px-3 text-sm transition-colors duration-150",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
