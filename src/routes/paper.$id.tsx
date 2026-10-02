import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Download,
  ExternalLink,
  FileText,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { QuestionList } from "@/components/question-list";
import { usePapers } from "@/components/papers-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { paperToText } from "@/lib/download";
import { formatPaperFilename, pdfProxy, schemeLabel, sessionLabel } from "@/lib/papers";
import { useLibrary } from "@/lib/store";
import { cn, downloadBlob } from "@/lib/utils";

export const Route = createFileRoute("/paper/$id")({
  component: PaperPage,
});

function PaperPage() {
  const { id } = Route.useParams();
  const { papers, getText, loading, textsLoading } = usePapers();
  const paper = papers.find((p) => p.id === id);
  const text = getText(id);
  const addRecent = useLibrary((s) => s.addRecent);
  const toggle = useLibrary((s) => s.toggleBookmark);
  const bookmarked = useLibrary((s) => s.bookmarks.includes(id));
  const [tab, setTab] = useState("questions");

  useEffect(() => {
    if (paper) addRecent(paper.id);
  }, [paper, addRecent]);

  const siblings = useMemo(() => {
    if (!paper) return [];
    return papers
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
        return (a.month ?? "").localeCompare(b.month ?? "");
      });
  }, [papers, paper]);

  const index = siblings.findIndex((p) => p.id === id);
  const prev = index > 0 ? siblings[index - 1] : undefined;
  const next = index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : undefined;

  if (loading) {
    return (
      <AppShell dense>
        <p className="text-sm text-muted-foreground">Loading paper…</p>
      </AppShell>
    );
  }

  if (!paper) {
    return (
      <AppShell dense>
        <div className="rounded-xl bg-card px-6 py-12 text-center shadow-card">
          <p className="font-display text-lg">Paper not found</p>
          <Button asChild className="mt-4">
            <Link to="/">Back to shelf</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  const questions = text?.questions ?? [];
  const raw = text?.text ?? "";

  function saveText() {
    if (!paper) return;
    downloadBlob(
      new Blob([paperToText(paper, text)], { type: "text/plain;charset=utf-8" }),
      formatPaperFilename(paper, "txt"),
    );
  }

  return (
    <AppShell dense>
      <div className="mb-5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Link to="/" className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="size-3.5" />
          All papers
        </Link>
        {paper.subject ? (
          <>
            <span>/</span>
            <Link
              to="/subject/$subject"
              params={{ subject: paper.subject }}
              className="hover:text-foreground"
            >
              {paper.subject}
            </Link>
          </>
        ) : null}
        {paper.year ? (
          <>
            <span>/</span>
            <Link
              to="/year/$year"
              params={{ year: String(paper.year) }}
              className="hover:text-foreground"
            >
              {paper.year}
            </Link>
          </>
        ) : null}
      </div>

      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {sessionLabel(paper)} · {paper.phaseLabel}
          </p>
          <h1 className="mt-1 font-display text-3xl font-medium tracking-tight">
            {paper.title}
          </h1>
          {paper.exam ? (
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{paper.exam}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge>{schemeLabel(paper.scheme)}</Badge>
            <Badge variant="secondary" className="font-mono tabular-nums">
              {paper.code}
            </Badge>
            {paper.docType === "correction" ? <Badge variant="outline">Correction slip</Badge> : null}
            {paper.pages ? (
              <Badge variant="outline">
                {paper.pages} page{paper.pages === 1 ? "" : "s"}
              </Badge>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={bookmarked ? "default" : "outline"}
            onClick={() => toggle(paper.id)}
          >
            <Bookmark className={cn("size-4", bookmarked && "fill-current")} />
            {bookmarked ? "Saved" : "Save"}
          </Button>
          <Button variant="outline" onClick={saveText} disabled={!raw && !questions.length}>
            <FileText className="size-4" />
            Text
          </Button>
          <Button variant="outline" asChild>
            <a href={pdfProxy(paper.path)} download={`${paper.code}.pdf`}>
              <Download className="size-4" />
              PDF
            </a>
          </Button>
          <Button variant="ghost" asChild>
            <a href={paper.url} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" />
              KUHS
            </a>
          </Button>
        </div>
      </header>

      <div className="mb-5 flex items-center justify-between gap-3 text-sm">
        {prev ? (
          <Link
            to="/paper/$id"
            params={{ id: prev.id }}
            className="inline-flex min-h-11 items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            {sessionLabel(prev)}
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
            {sessionLabel(next)}
            <ArrowRight className="size-4" />
          </Link>
        ) : (
          <span />
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="questions" className="flex-1 sm:flex-none">
            Questions
          </TabsTrigger>
          <TabsTrigger value="pdf" className="flex-1 sm:flex-none">
            Original PDF
          </TabsTrigger>
          <TabsTrigger value="raw" className="flex-1 sm:flex-none">
            Full text
          </TabsTrigger>
        </TabsList>
        <TabsContent value="questions">
          <div className="rounded-xl bg-card p-5 shadow-card sm:p-8">
            {textsLoading && !text ? (
              <p className="text-sm text-muted-foreground">Extracting questions…</p>
            ) : (
              <QuestionList questions={questions} />
            )}
          </div>
        </TabsContent>
        <TabsContent value="pdf">
          <div className="overflow-hidden rounded-xl bg-card shadow-card">
            <iframe
              title={`${paper.title} PDF`}
              src={pdfProxy(paper.path)}
              className="paper-frame"
            />
          </div>
        </TabsContent>
        <TabsContent value="raw">
          <div className="rounded-xl bg-card p-5 shadow-card sm:p-8">
            {raw ? (
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
                {raw}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground">
                Text is not available for this file — open the original PDF.
              </p>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {questions.length === 0 && !textsLoading ? (
        <p className="mt-4 inline-flex items-center gap-2 text-sm text-muted-foreground">
          <FileText className="size-4" />
          Scanned or image-only papers stay in the PDF tab.
        </p>
      ) : null}
    </AppShell>
  );
}
