import {
  PHASES,
  type Paper,
  type PaperText,
  type PhaseId,
} from "@/lib/papers";

export type DocType = "paper" | "correction";

export type Classification = {
  subject: string | null;
  paper: string | null;
  scheme: string | null;
  phase: PhaseId | null;
  exam: string | null;
  title: string | null;
  code: string | null;
  docType: DocType;
};

const SUBJECT_RULES: { name: string; line: RegExp; any?: RegExp }[] = [
  {
    name: "Obstetrics & Gynaecology",
    line: /obstetric|gynaecolog|gynecolog/i,
  },
  { name: "Forensic Medicine", line: /forensic/i },
  { name: "Community Medicine", line: /community\s*medicine/i },
  {
    name: "Otorhinolaryngology",
    line: /oto[\s\-]*rhino[\s\-]*laryng|otorhinolaryng|\bent\b/i,
  },
  { name: "Ophthalmology", line: /ophthalmolog/i },
  { name: "Paediatrics", line: /paediatrics?|pediatrics?/i },
  { name: "Pharmacology", line: /pharmacolog/i },
  { name: "Microbiology", line: /microbiolog/i },
  { name: "Biochemistry", line: /biochemistr/i },
  {
    name: "Pathology",
    line: /patholog|hematology\s+and\s+systemic|haematology\s+and\s+systemic/i,
  },
  { name: "Physiology", line: /physiolog/i },
  { name: "Anatomy", line: /(?:human\s+)?anatomy/i },
  {
    name: "General Medicine",
    line: /general\s+medicine|(?<![a-z])medicine\s*[–\-:]?\s*(?:paper\s*)?(i{1,2}|1|2)\b|(?<![a-z])medicine\s*$/i,
  },
  {
    name: "General Surgery",
    line: /general\s+surgery|(?<![a-z])surgery\s*[–\-:]?\s*(?:paper\s*)?(i{1,2}|1|2)\b|(?<![a-z])surgery\s*$/i,
  },
];

const SKIP_LINE =
  /scheme|q\.?\s*p\.?\s*code|reg\.?\s*no|time\s*:|total marks|answer all|draw table|draw diagram|indicate the question|leave sufficient|do not leave|admission only|multiple choice/i;

const EXAM_LINE =
  /(first|second|third|iii)\s+professional.{0,80}examinations?.{0,40}/i;

function headerLines(text: string, n = 36): string[] {
  return text.split(/\r?\n/).slice(0, n);
}

function isGarbled(text: string): boolean {
  const head = text.slice(0, 900);
  const letters = (head.match(/[A-Za-z]/g) ?? []).length;
  const pipes = (head.match(/\|/g) ?? []).length;
  return letters < 48 || pipes > 40;
}

function detectPhase(head: string): PhaseId | null {
  if (/(third|iii)\s+professional[\s\S]{0,90}part\s*II/i.test(head)) return "final";
  if (/(third|iii)\s+professional[\s\S]{0,90}part\s*I\b/i.test(head)) return "third";
  if (/first\s+professional/i.test(head)) return "first";
  if (/second\s+professional/i.test(head)) return "second";
  return null;
}

function detectScheme(head: string): string | null {
  const m = head.match(/\b(2010|2019)\s*(?:scheme|admission)\b/i);
  return m ? m[1] : null;
}

function detectPaper(blob: string): string | null {
  const cleaned = blob.replace(/part\s*II/gi, " ");
  if (/paper\s*(ii|2)\b/i.test(cleaned) || /[–\-]\s*(ii|2)\s*$/im.test(cleaned)) {
    return "Paper II";
  }
  if (/paper\s*(i|1)\b/i.test(cleaned) || /[–\-]\s*(i|1)\s*$/im.test(cleaned)) {
    return "Paper I";
  }
  return null;
}

function detectSubject(lines: string[], head: string): { subject: string; line: string | null } | null {
  for (const line of lines) {
    const trimmed = line.replace(/\s+/g, " ").trim();
    if (!trimmed || trimmed.length > 90) continue;
    if (SKIP_LINE.test(trimmed) || EXAM_LINE.test(trimmed)) continue;
    for (const rule of SUBJECT_RULES) {
      if (rule.line.test(trimmed)) return { subject: rule.name, line: trimmed };
    }
  }
  for (const rule of SUBJECT_RULES) {
    if (rule.line.test(head)) return { subject: rule.name, line: null };
  }
  return null;
}

function detectExam(lines: string[]): string | null {
  for (const line of lines) {
    const trimmed = line.replace(/\s+/g, " ").trim();
    if (EXAM_LINE.test(trimmed) && trimmed.length < 160) return trimmed;
  }
  const joined = lines.join(" ").replace(/\s+/g, " ");
  const m = joined.match(
    /((?:First|Second|Third|III)\s+Professional[\s\S]{0,90}Examinations?[^\n]{0,40})/i,
  );
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
}

function detectCode(text: string, filename: string): string | null {
  const fromText = text.slice(0, 700).match(/Q\.?\s*P\.?\s*Code\s*:\s*(\d{6})/i);
  if (fromText) return fromText[1];
  const fromName = filename.match(/(\d{6})/);
  return fromName ? fromName[1] : null;
}

function detectDocType(text: string): DocType {
  if (/correction\s*\/\s*no-?correction/i.test(text.slice(0, 400))) return "correction";
  return "paper";
}

export function classifyFromText(text: string, filename = ""): Classification {
  const empty: Classification = {
    subject: null,
    paper: null,
    scheme: null,
    phase: null,
    exam: null,
    title: null,
    code: detectCode(text, filename),
    docType: detectDocType(text),
  };
  if (!text || isGarbled(text)) return empty;

  const lines = headerLines(text);
  const head = lines.join("\n");
  const found = detectSubject(lines, head);
  const paper = found?.line ? detectPaper(found.line) : detectPaper(head);
  const subject = found?.subject ?? null;
  const title = subject ? (paper ? `${subject} — ${paper}` : subject) : null;

  return {
    subject,
    paper: paper ?? null,
    scheme: detectScheme(head),
    phase: detectPhase(head),
    exam: detectExam(lines),
    title,
    code: detectCode(text, filename),
    docType: detectDocType(text),
  };
}

export function classifyFromFilename(filename: string): Pick<Classification, "subject" | "paper"> {
  const name = filename.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ");
  const found = detectSubject([name], name);
  return {
    subject: found?.subject ?? null,
    paper: detectPaper(name),
  };
}

const PHASE_BY_SUBJECT: Record<string, PhaseId> = {
  Anatomy: "first",
  Physiology: "first",
  Biochemistry: "first",
  Pathology: "second",
  Pharmacology: "second",
  Microbiology: "second",
  "Forensic Medicine": "second",
  "Community Medicine": "third",
  Ophthalmology: "third",
  Otorhinolaryngology: "third",
  "General Medicine": "final",
  "General Surgery": "final",
  "Obstetrics & Gynaecology": "final",
  Paediatrics: "final",
};

export function applyContentClassification(paper: Paper, text?: PaperText): Paper {
  const raw = text?.text ?? "";
  const fromText = raw ? classifyFromText(raw, paper.filename) : null;
  const fromName = classifyFromFilename(paper.filename);

  const subject = fromText?.subject || paper.subject || fromName.subject;
  const paperNo = fromText?.paper || paper.paper || fromName.paper;
  const scheme = fromText?.scheme || (paper.scheme !== "unknown" ? paper.scheme : null);
  let phase = (fromText?.phase as PhaseId | null) || (paper.phase as PhaseId);
  // 2019 scheme Forensic sits in Third Professional Part I — trust content phase.
  if (!fromText?.phase && subject && PHASE_BY_SUBJECT[subject]) {
    // Only fill phase from subject when the folder was clearly wrong
    // (e.g. Community Medicine dumped in FIRST_YEAR).
    const expected = PHASE_BY_SUBJECT[subject];
    if (paper.phase !== expected && subject !== "Forensic Medicine") {
      if (
        (subject === "Community Medicine" ||
          subject === "Ophthalmology" ||
          subject === "Otorhinolaryngology") &&
        paper.phase === "first"
      ) {
        phase = expected;
      }
    }
  }
  if (fromText?.phase) phase = fromText.phase;

  const phaseMeta = PHASES.find((p) => p.id === phase);
  const title =
    subject ? (paperNo ? `${subject} — ${paperNo}` : subject) : paper.title;
  const code = fromText?.code || (/\d{6}/.test(paper.code) ? paper.code : paper.code);

  return {
    ...paper,
    subject,
    paper: paperNo,
    scheme: scheme || paper.scheme || "unknown",
    phase,
    phaseLabel: phaseMeta?.label ?? paper.phaseLabel,
    title,
    exam: fromText?.exam || paper.exam,
    code,
    docType: fromText?.docType ?? paper.docType ?? "paper",
  };
}
