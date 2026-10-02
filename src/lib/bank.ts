/**
 * Notes bank loader + indexes for the schema v5 bank emitted by
 * scripts/build-notes-bank.mjs (source of truth: public/notes-bank.json).
 */

export type NoteRef = {
  id: string | null;
  code: string;
  qnum: number;
  label: string;
  method: string;
};

export type StudyNote = {
  kind: "full" | "refer" | "mcq-key" | string;
  title: string;
  content: string;
  refs: NoteRef[];
  mapping: { method: string; score?: number | null; fragments?: number } | null;
};

export type BankQuestion = {
  id: string;
  paperId: string;
  subject: string;
  displaySubject: string;
  paper: string | null;
  year: number | null;
  month: string | null;
  session: string;
  scheme: string;
  code: string;
  qnum: number;
  qcode: string;
  section: string;
  officialText: string | null;
  officialParsed: boolean | null;
  hasNote: boolean;
  note: StudyNote | null;
  topic: string | null;
};

export type BankPaper = {
  id: string;
  subject: string;
  displaySubject: string;
  paper: string | null;
  year: number | null;
  month: string | null;
  session: string;
  scheme: string;
  code: string;
  questions: number;
  withNotes: number;
  years?: number[];
};

export type BankSubject = {
  subject: string;
  display: string;
  questions: number;
  withNotes: number;
  papers: number;
  years: number[];
  topics: number;
};

export type BankTopic = {
  key: string;
  display: string;
  subject: string;
  displaySubject: string;
  count: number;
  questionIds: string[];
  years: number[];
};

export type NotesBank = {
  schemaVersion: number;
  app: string;
  updatedAt: string;
  mappingRule: string;
  stats: {
    questions: number;
    withNotes: number;
    papers: number;
    subjects: number;
    topics: number;
    diagrams: number;
    crossRefs: { total: number; resolved: number; self: number; ambiguous: number };
    bareCitations: { total: number; resolved: number };
    mcqKeys: number;
    [key: string]: unknown;
  };
  subjects: BankSubject[];
  papers: BankPaper[];
  questions: BankQuestion[];
  topics: BankTopic[];
};

export const BANK_URL = "/notes-bank.json";

let bankPromise: Promise<NotesBank> | null = null;

/** Fetch (once) and lightly validate the notes bank. */
export function loadBank(): Promise<NotesBank> {
  if (!bankPromise) {
    bankPromise = fetch(BANK_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`notes-bank.json ${r.status}`);
        return r.json() as Promise<NotesBank>;
      })
      .then((bank) => {
        if (!bank.questions?.length) throw new Error("notes-bank.json is empty");
        return bank;
      })
      .catch((err) => {
        bankPromise = null;
        throw err;
      });
  }
  return bankPromise;
}

export type BankIndex = {
  bank: NotesBank;
  byId: Map<string, BankQuestion>;
  byPaper: Map<string, BankQuestion[]>;
  topicsByKey: Map<string, BankTopic>;
  topicsBySubject: Map<string, BankTopic[]>;
  subjectBySlug: Map<string, BankSubject>;
};

let indexPromise: Promise<BankIndex> | null = null;

export function loadBankIndex(): Promise<BankIndex> {
  if (!indexPromise) {
    indexPromise = loadBank().then((bank) => {
      const byId = new Map<string, BankQuestion>();
      const byPaper = new Map<string, BankQuestion[]>();
      for (const q of bank.questions) {
        byId.set(q.id, q);
        const list = byPaper.get(q.paperId) ?? [];
        list.push(q);
        byPaper.set(q.paperId, list);
      }
      for (const list of byPaper.values()) {
        list.sort((a, b) => a.qnum - b.qnum);
      }
      const topicsByKey = new Map<string, BankTopic>();
      const topicsBySubject = new Map<string, BankTopic[]>();
      for (const t of bank.topics) {
        topicsByKey.set(t.key, t);
        const list = topicsBySubject.get(t.subject) ?? [];
        list.push(t);
        topicsBySubject.set(t.subject, list);
      }
      const subjectBySlug = new Map<string, BankSubject>();
      for (const s of bank.subjects) subjectBySlug.set(subjectSlug(s.subject), s);
      return { bank, byId, byPaper, topicsByKey, topicsBySubject, subjectBySlug };
    });
  }
  return indexPromise;
}

export function subjectSlug(subject: string): string {
  return subject.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function topicSlug(key: string): string {
  return key.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "topic";
}

/** Find the topic object for a question's topic (merged display title). */
export function topicOfQuestion(idx: BankIndex, q: BankQuestion): BankTopic | undefined {
  if (!q.topic) return undefined;
  return idx.bank.topics.find((t) => t.questionIds.includes(q.id));
}

export const MONTH_ORDER = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function sessionPretty(session: string): string {
  const [y, m] = session.split("_");
  const month = m ? m[0] + m.slice(1).toLowerCase() : "";
  return `${month} ${y}`.trim();
}

export function paperLabel(p: { paper: string | null; code: string; scheme: string; session: string; year: number | null }): string {
  const parts: string[] = [];
  if (p.paper) parts.push(p.paper);
  parts.push(`code ${p.code}`);
  parts.push(p.scheme === "unknown" ? "scheme n/a" : `${p.scheme} scheme`);
  if (p.session && p.session !== "unknown") parts.push(sessionPretty(p.session));
  return parts.join(" · ");
}
