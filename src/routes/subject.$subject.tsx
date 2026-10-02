import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, BookOpen } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { DownloadPack } from "@/components/download-pack";
import { PaperCard } from "@/components/paper-card";
import { usePapers } from "@/components/papers-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { sessionLabel, uniqueSorted } from "@/lib/papers";
import { cn } from "@/lib/utils";
import { displaySubject, loadNotesBank, type StudyNote } from "@/lib/notes";

export const Route = createFileRoute("/subject/$subject")({
  component: SubjectPage,
});

function SubjectPage() {
  const { subject } = Route.useParams();
  const decoded = decodeURIComponent(subject);
  const { papers, texts, loading } = usePapers();
  const [paperFilter, setPaperFilter] = useState<string>("all");
  const [scheme, setScheme] = useState<string>("all");
  const [year, setYear] = useState<string>("all");
  const [notes, setNotes] = useState<StudyNote[]>([]);
  useEffect(() => {
    let cancelled = false;
    void loadNotesBank().then((d) => {
      if (!cancelled) setNotes(d.notes.filter((n) => displaySubject(n.subject) === displaySubject(decoded)));
    });
    return () => { cancelled = true; };
  }, [decoded]);

  const subjectPapers = useMemo(
    () => papers.filter((p) => p.subject === decoded),
    [papers, decoded],
  );

  const paperNames = useMemo(
    () => uniqueSorted(subjectPapers.map((p) => p.paper)),
    [subjectPapers],
  );
  const schemes = useMemo(
    () => uniqueSorted(subjectPapers.map((p) => p.scheme).filter((s) => s !== "unknown")),
    [subjectPapers],
  );
  const years = useMemo(
    () => uniqueSorted(subjectPapers.map((p) => p.year)),
    [subjectPapers],
  );

  const visible = useMemo(
    () =>
      subjectPapers.filter((p) => {
        if (paperFilter !== "all" && p.paper !== paperFilter) return false;
        if (scheme !== "all" && p.scheme !== scheme) return false;
        if (year !== "all" && String(p.year) !== year) return false;
        return true;
      }),
    [subjectPapers, paperFilter, scheme, year],
  );

  const drill = useMemo(() => {
    const rows: {
      section: string;
      number: number;
      text: string;
      paperId: string;
      session: string;
      year: number | null;
    }[] = [];
    for (const p of visible) {
      if (p.docType === "correction") continue;
      const t = texts[p.id];
      if (!t) continue;
      for (const q of t.questions) {
        if (
          q.section !== "Long Essay" &&
          q.section !== "Short Essay" &&
          q.section !== "Short Note"
        ) {
          continue;
        }
        rows.push({
          section: q.section,
          number: q.number,
          text: q.text,
          paperId: p.id,
          session: sessionLabel(p),
          year: p.year,
        });
      }
    }
    rows.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    return rows;
  }, [visible, texts]);

  if (loading) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </AppShell>
    );
  }

  if (!subjectPapers.length) {
    return (
      <AppShell>
        <p className="font-display text-lg">No papers for {decoded}.</p>
        <Button asChild className="mt-4">
          <Link to="/">Back</Link>
        </Button>
      </AppShell>
    );
  }

  const phaseLabel = uniqueSorted(subjectPapers.map((p) => p.phaseLabel)).join(" · ");
  const packScope = [decoded, year === "all" ? null : year, paperFilter === "all" ? null : paperFilter]
    .filter(Boolean)
    .join(" ");

  return (
    <AppShell>
      <Link
        to="/"
        className="mb-4 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        All papers
      </Link>
      <p className="text-xs font-medium uppercase tracking-widest text-primary">{phaseLabel}</p>
      <h1 className="mt-1 font-display text-4xl font-medium tracking-tight">{decoded}</h1>
      <p className="mt-2 text-muted-foreground">
        {subjectPapers.length} papers labelled from the printed heading · jump a topic across every sitting
      </p>

      <div className="mt-6">
        <DownloadPack papers={visible} texts={texts} scope={packScope} compact />
      </div>

      {notes.length ? (
        <Link to="/notes/$subject" params={{ subject: decoded }} className="mt-3 flex items-center justify-between rounded-2xl border border-border bg-card px-5 py-4 shadow-card transition hover:shadow-card-hover">
          <div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground"><BookOpen className="size-5" /></span><div><p className="text-xs font-medium uppercase tracking-widest text-primary">Study notes</p><p className="font-display text-lg">Read {displaySubject(decoded)} notes</p><p className="text-sm text-muted-foreground">Full Markdown notes with formulas, tables, figures, code boxes and year-wise PDF / print.</p></div></div><span className="text-sm text-primary">{notes.length} set{notes.length===1?'':'s'} →</span>
        </Link>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        <Chip active={paperFilter === "all"} onClick={() => setPaperFilter("all")}>
          All papers
        </Chip>
        {paperNames.map((name) => (
          <Chip
            key={name}
            active={paperFilter === name}
            onClick={() => setPaperFilter(name)}
          >
            {name}
          </Chip>
        ))}
        {schemes.map((s) => (
          <Chip key={s} active={scheme === s} onClick={() => setScheme(scheme === s ? "all" : s)}>
            {s} scheme
          </Chip>
        ))}
        {years.map((y) => (
          <Chip key={y} active={year === y} onClick={() => setYear(year === y ? "all" : y)}>
            {y}
          </Chip>
        ))}
      </div>

      <Tabs defaultValue="questions" className="mt-8">
        <TabsList>
          <TabsTrigger value="questions">Question bank</TabsTrigger>
          <TabsTrigger value="papers">Papers ({visible.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="questions">
          {drill.length === 0 ? (
            <p className="rounded-xl bg-card px-5 py-8 text-sm text-muted-foreground shadow-card">
              Question text is still loading, or these files are image-only PDFs.
            </p>
          ) : (
            <div className="space-y-3">
              {drill.map((row, i) => (
                <Link
                  key={`${row.paperId}-${row.section}-${row.number}-${i}`}
                  to="/paper/$id"
                  params={{ id: row.paperId }}
                  className="block rounded-xl bg-card p-4 shadow-card transition-[box-shadow] duration-150 hover:shadow-card-hover"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge variant="accent">{row.section}</Badge>
                    <span className="text-xs text-muted-foreground">{row.session}</span>
                  </div>
                  <p className="text-sm leading-relaxed sm:text-base">{row.text}</p>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="papers">
          <div className="grid gap-3 sm:grid-cols-2">
            {visible.map((p) => (
              <PaperCard key={p.id} paper={p} />
            ))}
          </div>
        </TabsContent>
      </Tabs>
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
