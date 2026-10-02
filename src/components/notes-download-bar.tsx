import { Download, FileText, LoaderCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { downloadNotesPdf, downloadNotesText } from "@/lib/notes-download";
import { displaySubject, type StudyNote } from "@/lib/notes";
import { cn } from "@/lib/utils";

export function NotesDownloadBar({
  notes,
  subject,
}: {
  notes: StudyNote[];
  subject?: string;
}) {
  const years = useMemo(
    () => [...new Set(notes.map((n) => String(n.year)))].sort((a, b) => Number(b) - Number(a)),
    [notes],
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState<"txt" | "pdf" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeYears = selected.length ? selected : [];
  const pack = useMemo(
    () => (activeYears.length ? notes.filter((n) => activeYears.includes(String(n.year))) : []),
    [notes, activeYears],
  );

  function toggle(year: string) {
    setSelected((cur) => (cur.includes(year) ? cur.filter((y) => y !== year) : [...cur, year]));
  }

  const scope = [
    subject ? displaySubject(subject) : "Notes",
    activeYears.length ? activeYears.join("-") : "",
  ]
    .filter(Boolean)
    .join(" ");

  function run(kind: "txt" | "pdf") {
    if (!pack.length || busy) return;
    setBusy(kind);
    setError(null);
    try {
      if (kind === "txt") downloadNotesText(pack, scope);
      else downloadNotesPdf(pack, scope);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="notes-dl">
      <div>
        <p className="eyebrow">Download notes</p>
        <h2 className="font-display text-xl font-medium tracking-tight">Pick years, then save</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Select one or more years. The file contains each question with its study note.
        </p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {years.map((year) => (
          <button
            key={year}
            type="button"
            onClick={() => toggle(year)}
            className={cn("year-select", selected.includes(year) && "active")}
          >
            {year}
          </button>
        ))}
        {selected.length ? (
          <button type="button" className="year-select" onClick={() => setSelected([])}>
            Clear
          </button>
        ) : null}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {pack.length
          ? `${pack.length} questions from ${activeYears.join(", ")}`
          : "Select a year to enable download."}
      </p>
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={() => void run("txt")} disabled={!pack.length || Boolean(busy)}>
          {busy === "txt" ? <LoaderCircle className="size-4 animate-spin" /> : <FileText className="size-4" />}
          Download text
        </Button>
        <Button variant="outline" onClick={() => void run("pdf")} disabled={!pack.length || Boolean(busy)}>
          {busy === "pdf" ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
          Download PDF
        </Button>
      </div>
    </section>
  );
}
