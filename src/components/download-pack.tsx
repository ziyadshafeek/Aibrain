import { Download, FileArchive, FileText, LoaderCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  downloadOriginalZip,
  downloadStudyPdf,
  downloadTextPack,
  type DownloadFormat,
} from "@/lib/download";
import type { Paper, PaperText } from "@/lib/papers";
import { cn } from "@/lib/utils";

const FORMATS: { id: DownloadFormat; label: string; hint: string; icon: typeof FileText }[] = [
  {
    id: "text",
    label: "Question text",
    hint: "One .txt file of every paper’s extracted questions.",
    icon: FileText,
  },
  {
    id: "pdf",
    label: "Study PDF",
    hint: "A readable PDF compiled from the question text.",
    icon: Download,
  },
  {
    id: "originals",
    label: "Original PDFs",
    hint: "Official KUHS files, zipped by subject.",
    icon: FileArchive,
  },
];

export function DownloadPack({
  papers,
  texts,
  scope,
  compact = false,
}: {
  papers: Paper[];
  texts: Record<string, PaperText>;
  scope: string;
  compact?: boolean;
}) {
  const [format, setFormat] = useState<DownloadFormat>("text");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(!compact);

  const count = papers.length;
  const originalsHeavy = format === "originals" && count > 80;

  const summary = useMemo(() => {
    if (!count) return "Nothing to download for this selection.";
    return `${count} paper${count === 1 ? "" : "s"} · ${scope}`;
  }, [count, scope]);

  async function run() {
    if (!count || busy) return;
    setBusy(true);
    setError(null);
    setProgress(null);
    try {
      if (format === "text") downloadTextPack(papers, texts, scope);
      else if (format === "pdf") downloadStudyPdf(papers, texts, scope);
      else {
        const result = await downloadOriginalZip(papers, scope, (p) =>
          setProgress({ done: p.done, total: p.total }),
        );
        if (result.failed) {
          setError(`${result.failed} official PDF${result.failed === 1 ? "" : "s"} could not be fetched.`);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <section
      className={cn(
        "rounded-2xl bg-card shadow-card",
        compact ? "p-4" : "p-5 sm:p-6",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-primary">Download pack</p>
          <h2 className="mt-1 font-display text-xl font-medium tracking-tight">
            {compact ? "Take this set with you" : "Subject-wise and year-wise packs"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{summary}</p>
        </div>
        {compact ? (
          <Button variant="ghost" onClick={() => setOpen((v) => !v)}>
            {open ? "Hide" : "Choose format"}
          </Button>
        ) : null}
      </div>

      {open ? (
        <>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {FORMATS.map((item) => {
              const Icon = item.icon;
              const active = format === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFormat(item.id)}
                  className={cn(
                    "rounded-xl border px-3 py-3 text-left transition-colors duration-150",
                    active
                      ? "border-primary bg-accent text-accent-foreground"
                      : "border-border bg-background hover:bg-muted",
                  )}
                >
                  <Icon className="size-4" />
                  <p className="mt-2 text-sm font-medium">{item.label}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.hint}</p>
                </button>
              );
            })}
          </div>
          {originalsHeavy ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Large original packs fetch each KUHS file in turn. Prefer a subject or a year, or use
              the study PDF for offline reading.
            </p>
          ) : null}
          {progress ? (
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                <span>Fetching official PDFs</span>
                <span className="font-mono tabular-nums">
                  {progress.done}/{progress.total}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-[width] duration-200"
                  style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
                />
              </div>
            </div>
          ) : null}
          {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
          <Button className="mt-4 min-h-11" onClick={() => void run()} disabled={!count || busy}>
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
            {busy ? "Preparing…" : `Download ${count || 0}`}
          </Button>
        </>
      ) : (
        <Button className="mt-4 min-h-11" onClick={() => void run()} disabled={!count || busy}>
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
          Download text
        </Button>
      )}
    </section>
  );
}
