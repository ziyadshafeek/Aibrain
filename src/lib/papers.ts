export type PhaseId = "first" | "second" | "third" | "final";

export type Question = {
  section: string;
  number: number;
  text: string;
};

export type DocType = "paper" | "correction";

export type Paper = {
  id: string;
  code: string;
  filename: string;
  path: string;
  url: string;
  phase: PhaseId | string;
  phaseLabel: string;
  session: string;
  year: number | null;
  month: string | null;
  scheme: string;
  subject: string | null;
  paper: string | null;
  title: string;
  exam?: string;
  pages: number | null;
  hasText: boolean;
  docType?: DocType;
};

export type Catalog = {
  source: string;
  scrapedAt: string;
  count: number;
  textOk?: number;
  textFail?: number;
  papers: Paper[];
};

export type PaperText = {
  text: string;
  questions: Question[];
  subject: string | null;
  paper: string | null;
  title: string;
  exam: string | null;
  pages: number;
};

export const PHASES: {
  id: PhaseId;
  label: string;
  short: string;
  subjects: string;
}[] = [
  {
    id: "first",
    label: "First Professional",
    short: "1st year",
    subjects: "Anatomy, Physiology, Biochemistry",
  },
  {
    id: "second",
    label: "Second Professional",
    short: "2nd year",
    subjects: "Pathology, Pharmacology, Microbiology, FMT (2010 scheme)",
  },
  {
    id: "third",
    label: "Third Professional Part I",
    short: "3rd year",
    subjects: "Community Medicine, Ophthalmology, ENT, FMT (2019 scheme)",
  },
  {
    id: "final",
    label: "Third Professional Part II",
    short: "Final year",
    subjects: "Medicine, Surgery, OBG, Paediatrics",
  },
];

export const SUBJECT_ORDER = [
  "Anatomy",
  "Physiology",
  "Biochemistry",
  "Pathology",
  "Pharmacology",
  "Microbiology",
  "Forensic Medicine",
  "Community Medicine",
  "Ophthalmology",
  "Otorhinolaryngology",
  "General Medicine",
  "General Surgery",
  "Obstetrics & Gynaecology",
  "Paediatrics",
] as const;

export type SearchFilters = {
  q?: string;
  phase?: string;
  subject?: string;
  year?: string;
  scheme?: string;
  saved?: string;
};

export function phaseMeta(id: string) {
  return PHASES.find((p) => p.id === id);
}

export function paperHref(id: string) {
  return `/paper/${encodeURIComponent(id)}`;
}

export function subjectHref(subject: string) {
  return `/subject/${encodeURIComponent(subject)}`;
}

export function yearHref(year: string | number) {
  return `/year/${encodeURIComponent(String(year))}`;
}

export function pdfProxy(path: string) {
  return `/api/pdf?p=${encodeURIComponent(path)}`;
}

export function filterPapers(papers: Paper[], filters: SearchFilters): Paper[] {
  const q = filters.q?.trim().toLowerCase();
  return papers.filter((p) => {
    if (filters.phase && p.phase !== filters.phase) return false;
    if (filters.subject && p.subject !== filters.subject) return false;
    if (filters.year && String(p.year) !== filters.year) return false;
    if (filters.scheme && p.scheme !== filters.scheme) return false;
    if (!q) return true;
    const hay = [p.title, p.code, p.subject, p.paper, p.exam, p.month, String(p.year)]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

export function searchInText(
  papers: Paper[],
  texts: Record<string, PaperText>,
  q: string,
): Paper[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return papers;
  return papers.filter((p) => {
    const t = texts[p.id];
    if (!t) return false;
    if (t.text.toLowerCase().includes(needle)) return true;
    return t.questions.some((question) => question.text.toLowerCase().includes(needle));
  });
}

export function uniqueSorted(values: Array<string | number | null | undefined>): string[] {
  const set = new Set<string>();
  for (const v of values) {
    if (v === null || v === undefined || v === "") continue;
    set.add(String(v));
  }
  return [...set].sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return nb - na;
    return a.localeCompare(b);
  });
}

export function sessionLabel(paper: Pick<Paper, "month" | "year">) {
  if (paper.month && paper.year) return `${paper.month} ${paper.year}`;
  if (paper.year) return String(paper.year);
  return "Session unknown";
}

export function schemeLabel(scheme: string) {
  if (scheme === "2010" || scheme === "2019") return `${scheme} scheme`;
  if (!scheme || scheme === "unknown") return "Scheme n/a";
  return `${scheme} scheme`;
}

export function countBy<T>(items: T[], key: (item: T) => string | null | undefined) {
  const map = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    if (!k) continue;
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return map;
}

export function snippet(text: string, q: string, radius = 90): string | null {
  const lower = text.toLowerCase();
  const needle = q.trim().toLowerCase();
  if (!needle) return null;
  const i = lower.indexOf(needle);
  if (i < 0) return null;
  const start = Math.max(0, i - radius);
  const end = Math.min(text.length, i + needle.length + radius);
  const slice = text.slice(start, end).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "…" : ""}${slice}${end < text.length ? "…" : ""}`;
}

export function formatPaperFilename(paper: Paper, ext: string) {
  const bits = [
    paper.year ? String(paper.year) : null,
    paper.month,
    paper.subject,
    paper.paper,
    paper.code,
  ]
    .filter(Boolean)
    .join(" ");
  return `${bits}.${ext}`.replace(/[^\w.]+/g, "_");
}
