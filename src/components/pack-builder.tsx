import { useMemo, useState } from "react";
import { DownloadPack } from "@/components/download-pack";
import { SUBJECT_ORDER, uniqueSorted, type Paper, type PaperText } from "@/lib/papers";

export function PackBuilder({
  papers,
  texts,
}: {
  papers: Paper[];
  texts: Record<string, PaperText>;
}) {
  const [subject, setSubject] = useState("all");
  const [year, setYear] = useState("all");

  const years = useMemo(() => uniqueSorted(papers.map((p) => p.year)), [papers]);
  const subjects = useMemo(
    () => SUBJECT_ORDER.filter((name) => papers.some((p) => p.subject === name)),
    [papers],
  );

  const selected = useMemo(
    () =>
      papers.filter((p) => {
        if (subject !== "all" && p.subject !== subject) return false;
        if (year !== "all" && String(p.year) !== year) return false;
        return true;
      }),
    [papers, subject, year],
  );

  const scope =
    subject === "all" && year === "all"
      ? "all papers"
      : [subject === "all" ? null : subject, year === "all" ? null : year]
          .filter(Boolean)
          .join(" ");

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="flex min-h-11 flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
          Subject
          <select
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="h-11 rounded-md border border-input bg-card px-3 text-sm text-foreground shadow-card"
          >
            <option value="all">All subjects</option>
            {subjects.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-11 flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
          Year
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="h-11 rounded-md border border-input bg-card px-3 text-sm text-foreground shadow-card"
          >
            <option value="all">All years</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </div>
      <DownloadPack papers={selected} texts={texts} scope={scope} />
    </div>
  );
}
