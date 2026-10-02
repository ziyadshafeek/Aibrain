export type NoteRecord = {
  id: string;
  questionCode?: string;
  subject: string;
  year: string;
  topic?: string;
  mode: string;
  title: string;
  content: string;
  createdAt?: string;
  updatedAt?: string;
};

export type NotesDatabase = {
  schemaVersion: number;
  app: string;
  updatedAt: string | null;
  notes: NoteRecord[];
};

let cache: NotesDatabase | null = null;
let promise: Promise<NotesDatabase> | null = null;

export async function loadNotes(): Promise<NotesDatabase> {
  if (cache) return cache;
  if (!promise) {
    promise = fetch('/notes.json').then(async (r) => {
      if (!r.ok) throw new Error('Notes database could not be loaded.');
      const data = (await r.json()) as NotesDatabase;
      cache = data;
      return data;
    });
  }
  return promise;
}

export function displaySubject(subject: string) {
  return subject === 'Opthalmology' ? 'Ophthalmology' : subject;
}

export function noteSubjects(notes: NoteRecord[]) {
  return [...new Set(notes.map((n) => n.subject))].sort((a, b) => displaySubject(a).localeCompare(displaySubject(b)));
}

export function noteYears(notes: NoteRecord[], subject?: string) {
  const values = notes
    .filter((n) => !subject || n.subject === subject)
    .flatMap((n) => {
      const fromMetadata = n.year
        .split(/[,|]/)
        .map((x) => x.trim())
        .filter((x) => /^(?:19|20)\d{2}$/.test(x));
      const fromHeadings = splitNoteByPapers(n.content).map((section) => section.year).filter(Boolean) as string[];
      return [...fromMetadata, ...fromHeadings];
    });
  return [...new Set(values)].sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
}

export function noteMatches(n: NoteRecord, q: string) {
  if (!q.trim()) return true;
  const hay = `${n.subject} ${n.year} ${n.topic ?? ''} ${n.title} ${n.content}`.toLowerCase();
  return hay.includes(q.trim().toLowerCase());
}

export function splitNoteByPapers(content: string) {
  const lines = content.split(/\r?\n/);
  const sections: { heading: string; year?: string; lines: string[] }[] = [];
  let current: { heading: string; year?: string; lines: string[] } | null = null;
  for (const line of lines) {
    const isPaper = /^#{2,4}\s+.*\b(?:19|20)\d{2}(?:_[A-Z]+)?\b/i.test(line.trim());
    if (isPaper) {
      if (current) sections.push(current);
      const match = line.match(/(?:19|20)\d{2}/);
      current = { heading: line.trim(), year: match?.[0], lines: [line] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) sections.push(current);
  return sections;
}

export function contentForYear(content: string, year: string) {
  if (!year || year === 'all') return content;
  const sections = splitNoteByPapers(content);
  const matching = sections.filter(s => s.year === year);
  if (!matching.length) return content;
  return matching.map(s => s.lines.join('\n')).join('\n\n---\n\n');
}

export function countQuestionMarkers(content: string) {
  return (content.match(/\[\[KUHS-QUESTION:[^\]]+\]\]/g) ?? []).length;
}
