export type NoteKind = "full" | "refer" | "stub" | "missing";

export type NoteRef = {
  noteId: string | null;
  paperId: string | null;
  subject: string;
  code: string;
  qnum: number;
  session: string;
  year: number | null;
  month: string | null;
  title: string | null;
  label: string;
  part?: string | null;
  sourceQnum?: number;
  sourceQcode?: string;
};

export type StudyNote = {
  id: string;
  paperId: string;
  subject: string;
  paper: string | null;
  year: number;
  month: string;
  session: string;
  scheme: string;
  code: string;
  qnum: number;
  qcode: string;
  section: string;
  title: string;
  questionText: string | null;
  mappedNumber: number | null;
  kind: NoteKind;
  content: string;
  refs: NoteRef[];
  hasNotes: boolean;
};

export type NotesPaper = {
  id: string;
  subject: string;
  paper: string | null;
  year: number | null;
  month: string | null;
  session: string;
  scheme: string | null;
  code: string;
  title: string;
  exam?: string | null;
  phase?: string | null;
  phaseLabel?: string | null;
  url?: string | null;
  noteCount: number;
  missingCount: number;
};

export type NotesSubject = {
  subject: string;
  display: string;
  questions: number;
  withNotes: number;
  missing: number;
  papers: number;
  years: number[];
};

export type NotesBank = {
  schemaVersion: number;
  app: string;
  updatedAt: string;
  stats: {
    questions: number;
    withNotes: number;
    papers: number;
    subjects: number;
    missing: number;
    skippedGroupedMcq: number;
    unmappedSourceNotes: number;
    references: number;
    resolvedReferences: number;
    unresolvedReferences: number;
  };
  subjects: NotesSubject[];
  papers: NotesPaper[];
  notes: StudyNote[];
};

let cache: NotesBank | null = null;
let promise: Promise<NotesBank> | null = null;

export async function loadNotesBank(): Promise<NotesBank> {
  if (cache) return cache;
  if (!promise) {
    promise = fetch("/notes-bank.json").then(async (r) => {
      if (!r.ok) throw new Error("Study notes could not be loaded.");
      const data = (await r.json()) as NotesBank;
      cache = data;
      return data;
    });
  }
  return promise;
}

export function displaySubject(subject: string) {
  return subject === "Opthalmology" ? "Ophthalmology" : subject === "Otorhinolaryngology" ? "ENT" : subject;
}

export function noteAnchor(id: string) {
  return `note-${id}`;
}

export function sittingLabel(note: Pick<StudyNote, "month" | "year" | "paper" | "scheme">) {
  const sitting = [note.month, note.year].filter(Boolean).join(" ");
  const bits = [sitting, note.paper, note.scheme && note.scheme !== "unknown" ? `${note.scheme} scheme` : null].filter(
    Boolean,
  );
  return bits.join(" · ");
}

export function sessionPretty(session: string) {
  const [year, month] = session.split("_");
  if (!month) return session;
  return `${month.charAt(0)}${month.slice(1).toLowerCase()} ${year}`;
}

export function filterNotes(
  notes: StudyNote[],
  opts: { subject?: string; year?: string; session?: string; paper?: string; q?: string },
) {
  const needle = opts.q?.trim().toLowerCase();
  return notes.filter((n) => {
    if (opts.subject && displaySubject(n.subject) !== displaySubject(opts.subject)) return false;
    if (opts.year && String(n.year) !== opts.year) return false;
    if (opts.session && n.session !== opts.session) return false;
    if (opts.paper && (n.paper ?? "") !== opts.paper) return false;
    if (!needle) return true;
    const hay = `${n.title} ${n.questionText ?? ""} ${n.content} ${n.section} ${n.qcode}`.toLowerCase();
    return hay.includes(needle);
  });
}

export function uniqueSittings(notes: StudyNote[]) {
  const map = new Map<
    string,
    {
      session: string;
      year: number;
      month: string;
      paper: string | null;
      paperId: string;
      scheme: string;
      count: number;
    }
  >();
  for (const n of notes) {
    const key = n.paperId;
    const row = map.get(key);
    if (row) row.count += 1;
    else {
      map.set(key, {
        session: n.session,
        year: n.year,
        month: n.month,
        paper: n.paper,
        paperId: n.paperId,
        scheme: n.scheme,
        count: 1,
      });
    }
  }
  return [...map.values()].sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    if (a.month !== b.month) return a.month.localeCompare(b.month);
    return (a.paper ?? "").localeCompare(b.paper ?? "");
  });
}

export function notesForPaper(notes: StudyNote[], paperId: string) {
  return notes.filter((n) => n.paperId === paperId).sort((a, b) => a.qnum - b.qnum);
}

export function noteForOfficialQuestion(notes: StudyNote[], paperId: string, number: number) {
  const paperNotes = notesForPaper(notes, paperId);
  const mapped = paperNotes.filter((n) => n.mappedNumber === number);
  if (mapped.length) {
    return mapped.sort((a, b) => {
      const rank = (k: NoteKind) => (k === "full" ? 0 : k === "refer" ? 1 : 2);
      return rank(a.kind) - rank(b.kind);
    })[0];
  }
  return paperNotes.find((n) => n.qnum === number);
}

export function findNote(notes: StudyNote[], id: string | null | undefined) {
  if (!id) return undefined;
  return notes.find((n) => n.id === id);
}

export function noteSearchHref(note: Pick<StudyNote, "subject" | "session" | "qnum" | "id">) {
  const params = new URLSearchParams({ session: note.session, q: String(note.qnum) });
  return `/notes/${encodeURIComponent(displaySubject(note.subject))}?${params.toString()}#${noteAnchor(note.id)}`;
}
