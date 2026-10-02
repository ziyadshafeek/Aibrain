#!/usr/bin/env node
/**
 * Build the study-notes bank from the raw AI-saver output (public/notes.json).
 *
 * Mapping contract (accuracy is paramount):
 *  1. Every note block is anchored by an explicit `[[KUHS-QUESTION:<code>:Q<n>]]` marker
 *     (or is a "preface" note sitting before the first marker of a paper section).
 *  2. The marker resolves to exactly ONE paper via (Q.P. code, session) from the chunk's
 *     paper-section headers. (code, session) is unique across the catalog.
 *  3. Grouped/merged MCQ content is NEVER split and NEVER attached to a non-MCQ question.
 *     All MCQ fragments of a paper merge into one answer-key note attached to the paper's
 *     official "Multiple Choice Questions" group question.
 *  4. The AI sometimes misnumbered its markers (e.g. numbering its own blocks sequentially
 *     after MCQ fragments). Every block is therefore verified against the official question
 *     text with IDF-weighted similarity; paper-wide constant offsets are detected by
 *     majority vote and applied. Anything still unverifiable is reported, never guessed.
 *  5. Cross references (`REFER TO`, bare `[code:Qn]` citations) resolve only on unique
 *     evidence; otherwise they stay as plain text.
 *
 * Output: public/notes-bank.json (schema v5) + scripts/notes-build-report.json
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const readJson = (name) => JSON.parse(readFileSync(join(root, "public", name), "utf8"));
const writeJson = (path, data) => writeFileSync(path, JSON.stringify(data), "utf8");

const catalog = readJson("catalog.json");
const fulltext = readJson("fulltext.json");
const notesJson = readJson("notes.json");

const REF_STANDALONE = /^\[\[KUHS-QUESTION:(\d{6}):Q(\d{1,2})\]\]\s*$/;
const REF_ANY = /\[\[KUHS-QUESTION:(\d{6}):Q(\d{1,2})\]\]/g;
const BARE_CITATION = /(?<!\[)\[(\d{6}):Q(\d{1,2})\](?!\])/g;

/* ------------------------------------------------------------------ *
 * Catalog lookups
 * ------------------------------------------------------------------ */
const paperByCodeSession = new Map();
for (const p of catalog.papers) {
  const key = `${p.code}|${p.session}`;
  if (paperByCodeSession.has(key)) throw new Error(`catalog duplicate ${key}`);
  paperByCodeSession.set(key, p);
}

/* ------------------------------------------------------------------ *
 * Official questions (from fulltext) + MCQ group re-insertion
 * ------------------------------------------------------------------ */
function isMcqSection(s) {
  return typeof s === "string" && /multiple\s*choice/i.test(s);
}

function officialQuestions(paperId) {
  const entry = fulltext[paperId];
  if (!entry) return [];
  const qs = (entry.questions ?? []).map((q) => ({ ...q }));
  if (!qs.some((q) => isMcqSection(q.section) || isMcqSection(q.text))) {
    const raw = entry.text ?? "";
    const m = raw.match(/^\s*(\d{1,2})\.\s*Multiple Choice Questions?\s*(\([^)]*\))?/im);
    if (m && !qs.some((q) => q.number === Number(m[1]))) {
      qs.push({
        section: "Multiple Choice",
        number: Number(m[1]),
        text: `Multiple Choice Questions ${m[2] ?? ""}`.trim(),
        mcqGroup: true,
      });
      qs.sort((a, b) => a.number - b.number);
    }
  }
  for (const q of qs) if (isMcqSection(q.section) || isMcqSection(q.text)) q.mcqGroup = true;
  return qs;
}

/* ------------------------------------------------------------------ *
 * IDF-weighted similarity
 * ------------------------------------------------------------------ */
const STOP = new Set(
  ("a an the of and or in to for with on at by from as is are be was were write describe explain " +
    "name draw label briefly note following questions question patient presents complaints history " +
    "examination answer answers give giving listed mention define classify what which how why where " +
    "when this that these those it its their his her all any each various about under heading " +
    "headings detail details detailed full complete different difference differences between " +
    "include includes including relevant probable most likely add also its toe yes into upon per " +
    "may can will shall should would could been being having has had did does done using use used " +
    "new old right left year years male female old along across during after before while since " +
    "there here other others same both few much many more less least very just only then than " +
    "some such no not nor but if else because however therefore thus hence via etc")
    .split(" ")
    .filter(Boolean),
);

function tokens(s) {
  return (s ?? "")
    .toLowerCase()
    .replace(/[*_`#>|]/g, " ")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t));
}

// document frequency over all official questions
const DF = new Map();
const N_DOCS = Object.keys(fulltext).length;
for (const entry of Object.values(fulltext)) {
  for (const q of entry.questions ?? []) {
    for (const t of new Set(tokens(q.text))) DF.set(t, (DF.get(t) ?? 0) + 1);
  }
}
const idf = (t) => Math.log(1 + N_DOCS / (1 + (DF.get(t) ?? 0)));

function simScore(noteText, officialText) {
  // Asymmetric coverage: how much of the official question's IDF mass does the note cover?
  const note = new Set(tokens(noteText));
  const off = [...new Set(tokens(officialText))];
  if (!note.size || !off.length) return 0;
  let total = 0;
  let hit = 0;
  for (const t of off) {
    const w = idf(t);
    total += w;
    if (note.has(t)) hit += w;
  }
  return total ? hit / total : 0;
}

/* ------------------------------------------------------------------ *
 * Note chunk parsing
 * ------------------------------------------------------------------ */
function sessionFromText(s) {
  const m = s.match(/(19|20)\d{2}_[A-Z]+/);
  return m ? m[0] : null;
}
function sessionFromSpaced(s) {
  const m = s.match(/(19|20)\d{2}\s+[A-Z]{3,}/);
  return m ? m[0].trim().replace(/\s+/, "_") : null;
}

function parseChunk(chunk, chunkIdx, report) {
  const lines = chunk.content.split("\n");
  const blocks = [];
  let ctx = { session: null, label: null, paperOrder: 0, scheme: null, code: null };
  let current = null;

  const finalize = () => {
    if (!current) return;
    const lines2 = current.contentLines;
    let head = null;
    let bodyStart = 0;
    for (let j = 0; j < Math.min(lines2.length, 8); j++) {
      const hm = lines2[j].match(/^#{1,6}\s+(.*)$/);
      if (hm && hm[1].trim()) {
        head = hm[1].trim();
        bodyStart = j + 1;
        break;
      }
      if (lines2[j].trim() !== "") break;
    }
    current.heading = head;
    current.rawContent = lines2.slice(bodyStart).join("\n").trim();
    current.fullContent = lines2.join("\n").trim();
    // continuation artifacts: keep the completed version
    const contIdx = lines2.findIndex((l) => /\*\(Continued\)\*/.test(l));
    if (contIdx >= 0) {
      const after = lines2.slice(contIdx + 1).join("\n").trim();
      const before = current.rawContent;
      if (after) {
        const dropped = before.length;
        current.rawContent = after;
        report.continuations.push({
          chunk: chunk.title,
          code: current.code,
          qnum: current.qnum,
          session: current.session,
          droppedChars: dropped,
          keptChars: after.length,
        });
      }
    }
    const numM = head ? head.match(/^(\d{1,2})[.)]\s+(.*)$/) : null;
    current.headingNumber = numM ? Number(numM[1]) : null;
    current.headingTitle = numM ? numM[2].trim() : head;
  };

  const startBlock = (code, qnum, lineIdx) => {
    finalize();
    current = {
      chunkIdx,
      chunkTitle: chunk.title,
      lineIdx,
      code,
      qnum,
      session: ctx.session,
      ctxLabel: ctx.label,
      paperOrder: ctx.paperOrder,
      scheme: ctx.scheme,
      ctxCode: ctx.code,
      heading: null,
      contentLines: [],
    };
    blocks.push(current);
  };

  const startPreface = (lineIdx) => {
    finalize();
    current = {
      chunkIdx,
      chunkTitle: chunk.title,
      lineIdx,
      code: ctx.code,
      qnum: null,
      preface: true,
      session: ctx.session,
      ctxLabel: ctx.label,
      paperOrder: ctx.paperOrder,
      scheme: ctx.scheme,
      contentLines: [],
    };
    blocks.push(current);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m;

    if (!REF_STANDALONE.test(line) && (m = line.match(/^#{2,3}\s+(.+)$/))) {
      const t = m[1].trim();
      if (!/\[\[KUHS/.test(t)) {
        const s = sessionFromText(t) ?? sessionFromSpaced(t);
        if (s) {
          finalize();
          current = null;
          ctx = { session: s, label: t, paperOrder: ctx.paperOrder + 1, scheme: null, code: null };
          const schemeM = t.match(/\((2010|2019)\s*[Ss]cheme\)/);
          if (schemeM) ctx.scheme = schemeM[1];
          prefaceStarted = false;
          continue;
        }
      }
    }
    if (/Q\.P\.\s*Code:\s*(\d{6})/.test(line) && ctx.session) {
      ctx.code = line.match(/Q\.P\.\s*Code:\s*(\d{6})/)[1];
      const sm = line.match(/\b(2010|2019)\b/);
      if (sm) ctx.scheme = sm[1];
      continue;
    }
    if ((m = line.match(REF_STANDALONE))) {
      startBlock(m[1], Number(m[2]), i);
      prefaceStarted = false;
      continue;
    }
    // content before the first ref of a section becomes a preface note
    if (!current && ctx.session && line.trim() && !/^---\s*$/.test(line.trim())) {
      startPreface(i);
    }
    if (current) current.contentLines.push(line);
  }
  finalize();
  return blocks;
}

/* ------------------------------------------------------------------ *
 * MCQ detection
 * ------------------------------------------------------------------ */
const ROMAN_WORD = /^(x{0,3})(ix|iv|viii|vii|vi|v|iii|ii|i)?$/i;
function isRoman(s) {
  if (!/^[ivxIVX]+$/.test(s)) return false;
  return ROMAN_WORD.test(s);
}
function romanItemLine(l) {
  // `* **xiv.** text` / `* **xi (1, 2):** text` / `* i. text` / `1. i) text`
  let clean = l.replace(/^\s*[-*+]\s+/, "").replace(/^\s*\d{1,2}[.)]\s*/, "");
  clean = clean.replace(/^\*{1,2}/, "").replace(/\*{1,2}/, "");
  const m = clean.match(/^([ivxIVX]{1,6})\s*[.():,\u2022]/);
  if (!m) return false;
  return isRoman(m[1]);
}

function looksLikeMcq(block) {
  const h = block.heading ?? "";
  if (/multiple\s*choice/i.test(h)) return true;
  if (/^mcq\b/i.test(h)) return true;
  if (/\bMCQ\s+(i{1,3}|iv|v|vi{0,3}|ix|x|xi{0,3}|xv)/i.test(h)) return true;
  const firstLines = block.rawContent.split("\n").filter((l) => l.trim()).slice(0, 3);
  for (const l of firstLines) {
    if (/multiple\s*choice/i.test(l)) return true;
    if (romanItemLine(l)) return true;
  }
  return false;
}

function isReferBlock(block) {
  const body = block.rawContent;
  if (!body) return true;
  const meaningful = body
    .split("\n")
    .filter((l) => l.trim() && !/^---\s*$/.test(l.trim()))
    .filter((l) => !/\[\[KUHS-QUESTION:/.test(l))
    .filter((l) => !/^\s*[-*]*\s*\**\s*(REFER TO|See continuation|See below)/i.test(l))
    .join(" ")
    .replace(/\(.*?\)/g, " ")
    .replace(/[*_`:]/g, "")
    .trim();
  return meaningful.length < 60;
}

/* ------------------------------------------------------------------ *
 * Build
 * ------------------------------------------------------------------ */
const report = {
  generatedAt: new Date().toISOString(),
  blocks: { total: 0, mcq: 0, refer: 0, full: 0, preface: 0, dead: 0, unmapped: [] },
  continuations: [],
  offsets: [],
  remaps: [],
  mappingReview: [],
  simHistogram: {},
  mcqMerges: [],
  crossRefs: { total: 0, resolved: 0, self: 0, ambiguous: [], unresolved: [] },
  bareCitations: { total: 0, resolved: 0, review: [] },
  officialQuestionsMissing: [],
  questionsWithoutNotes: [],
  droppedDuplicates: [],
  contentAccounting: {
    sourceChars: 0,
    mappedChars: 0,
    mcqChars: 0,
    droppedChars: 0,
    droppedSamples: [],
    markerChars: 0,
    headerChars: 0,
    preambleChars: 0,
  },
};

let prefaceStarted = false;
const allBlocks = [];
notesJson.notes.forEach((chunk, i) => {
  allBlocks.push(...parseChunk(chunk, i, report));
});
report.blocks.total = allBlocks.length;
report.contentAccounting.sourceChars = notesJson.notes.reduce((a, c) => a + c.content.length, 0);
report.contentAccounting.markerChars = allBlocks.filter((b) => !b.preface).length * 30;
report.contentAccounting.headerChars = allBlocks.filter((b) => b.ctxLabel).length * 60;

/* --- resolve each block to its paper --- */
const paperBlocks = new Map();
for (const b of allBlocks) {
  if (!b.session) {
    report.blocks.dead++;
    report.blocks.unmapped.push({ why: "no session context", chunk: b.chunkTitle, line: b.lineIdx, heading: b.heading });
    b.dead = true;
    continue;
  }
  const key = `${b.code}|${b.session}`;
  const paper = paperByCodeSession.get(key);
  if (!paper) {
    report.blocks.dead++;
    report.blocks.unmapped.push({
      why: "no catalog paper for (code, session)",
      chunk: b.chunkTitle,
      line: b.lineIdx,
      code: b.code,
      session: b.session,
      ctx: b.ctxLabel,
      heading: b.heading,
    });
    b.dead = true;
    continue;
  }
  b.paper = paper;
  b.paperId = paper.id;
  if (!paperBlocks.has(paper.id)) paperBlocks.set(paper.id, []);
  paperBlocks.get(paper.id).push(b);
}

/* --- official question tables --- */
const officialByPaper = new Map();
for (const paperId of paperBlocks.keys()) officialByPaper.set(paperId, officialQuestions(paperId));

/* --- classify blocks --- */
for (const b of allBlocks) {
  if (b.dead) continue;
  if (b.preface) report.blocks.preface++;
  const official = officialByPaper.get(b.paperId) ?? [];
  const officialAtNum = b.qnum != null ? official.find((q) => q.number === b.qnum) : undefined;
  b.officialAtNum = officialAtNum ?? null;
  const mcqByLook = looksLikeMcq(b);
  const mcqByOfficial = Boolean(officialAtNum?.mcqGroup);
  if (mcqByLook || mcqByOfficial) b.kind = "mcq";
  else if (isReferBlock(b)) b.kind = "refer";
  else b.kind = "full";
  report.blocks[b.kind]++;
}

/* --- MCQ merging per paper --- */
for (const [paperId, blocks] of paperBlocks) {
  const mcqBlocks = blocks.filter((b) => b.kind === "mcq");
  if (!mcqBlocks.length) continue;
  const official = officialByPaper.get(paperId) ?? [];
  const mcqQuestion = official.find((q) => q.mcqGroup);
  const merged = mcqBlocks
    .map((b) => {
      const body = [b.heading && !/multiple\s*choice/i.test(b.heading) ? `**${b.heading}**` : null, b.rawContent]
        .filter(Boolean)
        .join("\n\n");
      return body.trim();
    })
    .filter(Boolean)
    .join("\n\n---\n\n");
  report.mcqMerges.push({
    paperId,
    fragments: mcqBlocks.length,
    qnums: mcqBlocks.map((b) => b.qnum),
    officialMcqQuestion: mcqQuestion ? mcqQuestion.number : null,
    chars: merged.length,
  });
  for (const b of mcqBlocks) {
    b.mergedInto = mcqQuestion ? mcqQuestion.number : null;
    report.contentAccounting.mcqChars += b.fullContent.length;
  }
  if (!mcqQuestion) {
    report.blocks.unmapped.push({
      why: "MCQ fragments but no official MCQ group question found in paper text",
      paperId,
      qnums: mcqBlocks.map((b) => b.qnum),
    });
  }
}

/* ------------------------------------------------------------------ *
 * Semantic verification + offset detection + remap
 * ------------------------------------------------------------------ */
function blockMatchText(b) {
  return `${b.heading ?? ""} ${b.rawContent.slice(0, 600)}`;
}

// Cross-ref pre-pass is needed for refer-block transitive verification, but full
// resolution happens later; for now build a lightweight resolver for REFER lines.
/**
 * Segment = the part of the line after THIS ref marker and before the next one
 * (or the line end). Hints always follow the ref they qualify.
 */
function segmentFor(line, refEnd) {
  const window = line.slice(refEnd, refEnd + 120);
  const stop = window.indexOf("[[KUHS-QUESTION:");
  return (stop >= 0 ? window.slice(0, stop) : window).trim();
}

function resolveCrossRefLight(block, code, qnum, seg) {
  if (block.code === code && block.qnum === qnum) return { self: true };
  // 1. explicit session hints: "(2025_MARCH)", "under *Anatomy — Paper II — 2026_JUNE*"
  const session =
    seg.match(/((19|20)\d{2}_[A-Z]+)/)?.[1] ?? seg.match(/under\s+.{0,90}?((19|20)\d{2}_[A-Z]+)/is)?.[1] ?? null;
  if (session) {
    const paper = paperByCodeSession.get(`${code}|${session.toUpperCase()}`);
    if (paper) {
      const list = allBlocks.filter((x) => !x.dead && x.code === code && x.qnum === qnum && x.paperId === paper.id);
      if (list.length) return { target: list[0], method: "session-hint" };
    }
  }
  // 2. ophthalmology chunk "(Paper 2 …)" paper-order hints
  const paperHint = seg.match(/\(Paper\s+(\d+)/i);
  if (paperHint) {
    const list = allBlocks.filter(
      (x) => !x.dead && x.code === code && x.qnum === qnum && x.chunkIdx === block.chunkIdx && x.paperOrder === Number(paperHint[1]),
    );
    if (list.length === 1) return { target: list[0], method: "paper-order-hint" };
  }
  // 3. same-paper candidate (covers "above", "See continuation" and un-hinted same-paper refs)
  const samePaper = allBlocks.filter((x) => !x.dead && x.code === code && x.qnum === qnum && x.session === block.session);
  if (samePaper.length === 1) return { target: samePaper[0], method: "same-paper" };
  // 4. unique earlier-in-chunk, then unique global
  const earlier = allBlocks.filter((x) => !x.dead && x.code === code && x.qnum === qnum && x.chunkIdx === block.chunkIdx && x.lineIdx < block.lineIdx);
  if (earlier.length === 1) return { target: earlier[0], method: "unique-earlier" };
  if (earlier.length === 0) {
    const global = allBlocks.filter((x) => !x.dead && x.code === code && x.qnum === qnum);
    if (global.length === 1) return { target: global[0], method: "unique-global" };
  }
  return { ambiguous: true };
}

function referTargetText(block) {
  // For refer blocks, the real content is the referenced note; keep the block's own
  // heading too (it usually names the topic matching the official question).
  const lines = block.rawContent.split("\n");
  for (const line of lines) {
    REF_ANY.lastIndex = 0;
    const matches = [...line.matchAll(REF_ANY)];
    if (!matches.length) continue;
    const m = matches[0];
    const seg = segmentFor(line, m.index + m[0].length);
    const res = resolveCrossRefLight(block, m[1], Number(m[2]), seg);
    if (res?.target) return `${block.heading ?? ""} ${blockMatchText(res.target)}`;
  }
  return blockMatchText(block);
}

const COV_VOTE = 0.5; // coverage needed for a block to vote on the paper offset
const COV_MARGIN = 0.15; // winner margin over runner-up needed to vote
const COV_STRONG = 0.45; // coverage considered individually convincing
const COV_OK = 0.3;

for (const [paperId, blocks] of paperBlocks) {
  const official = (officialByPaper.get(paperId) ?? []).filter((q) => !q.mcqGroup);
  const candidates = blocks.filter((b) => b.kind === "full" || b.kind === "refer");
  if (!candidates.length || !official.length) {
    for (const b of candidates) b.mappedQnum = b.qnum;
    continue;
  }

  // per-block coverage table
  const votes = new Map(); // offset -> {weight, examples}
  for (const b of candidates) {
    const text = b.kind === "refer" ? referTargetText(b) : blockMatchText(b);
    const scored = official
      .map((q) => ({ q, score: simScore(text, q.text) }))
      .sort((a, b2) => b2.score - a.score);
    b.simTable = scored;
    b.bestMatch = scored[0];
    b.secondMatch = scored[1] ?? null;
    b.simAtRef = b.qnum != null ? (scored.find((s) => s.q.number === b.qnum)?.score ?? 0) : 0;
    const clear =
      b.bestMatch &&
      b.bestMatch.score >= COV_VOTE &&
      (!b.secondMatch || b.bestMatch.score - b.secondMatch.score >= COV_MARGIN);
    if (clear && b.qnum != null) {
      const d = b.bestMatch.q.number - b.qnum;
      const w = b.kind === "refer" ? 0.5 : 1;
      if (!votes.has(d)) votes.set(d, { weight: 0, examples: [] });
      votes.get(d).weight += w;
      votes.get(d).examples.push(`Q${b.qnum}->Q${b.bestMatch.q.number} (${b.bestMatch.score.toFixed(2)})`);
    }
  }

  // offset consensus
  const sortedVotes = [...votes.entries()].sort((a, b) => b[1].weight - a[1].weight);
  const totalWeight = [...votes.values()].reduce((a, v) => a + v.weight, 0);
  let offset = 0;
  let offsetApplied = false;
  if (sortedVotes.length) {
    const [d0, v0] = sortedVotes[0];
    const isZero = d0 === 0 && v0.weight >= 0.5 * totalWeight && v0.weight >= 1;
    const nonZeroOk = d0 !== 0 && v0.weight >= 2 && v0.weight >= 0.6 * totalWeight;
    if (isZero || nonZeroOk) {
      offset = d0;
      offsetApplied = true;
      report.offsets.push({ paperId, offset, weight: v0.weight, totalWeight, examples: v0.examples.slice(0, 6) });
    }
  }

  // preface blocks sit before the first ref marker: they continue the paper's question
  // sequence, i.e. they belong to the official question right before the first ref block.
  for (const b of candidates.filter((x) => x.preface)) {
    const firstMapped = Math.min(
      ...candidates.filter((x) => !x.preface && x.qnum != null && offsetApplied).map((x) => x.qnum + offset),
      Infinity,
    );
    if (offsetApplied && Number.isFinite(firstMapped) && firstMapped > 1) {
      const targetNum = firstMapped - 1;
      const oq = official.find((q) => q.number === targetNum);
      const cov = oq ? simScore(blockMatchText(b), oq.text) : 0;
      b.mappedQnum = targetNum;
      b.mappingMethod = "preface-sequence";
      b.mappingScore = Number(cov.toFixed(2));
      report.remaps.push({
        paperId,
        from: "preface",
        to: `Q${targetNum}`,
        score: b.mappingScore,
        heading: (b.heading ?? "").slice(0, 90),
        official: oq ? oq.text.slice(0, 90) : "(official text unavailable)",
      });
    } else {
      // fall back to best match with margin
      if (b.bestMatch && b.bestMatch.score >= COV_STRONG) {
        b.mappedQnum = b.bestMatch.q.number;
        b.mappingMethod = "semantic-best";
        b.mappingScore = Number(b.bestMatch.score.toFixed(2));
        report.remaps.push({
          paperId,
          from: "preface",
          to: `Q${b.bestMatch.q.number}`,
          score: b.mappingScore,
          heading: (b.heading ?? "").slice(0, 90),
          official: b.bestMatch.q.text.slice(0, 90),
        });
      } else {
        b.mappedQnum = b.bestMatch ? b.bestMatch.q.number : null;
        b.mappingMethod = b.bestMatch ? "semantic-weak" : "preface-unmapped";
        b.mappingScore = b.bestMatch ? Number(b.bestMatch.score.toFixed(2)) : 0;
        report.mappingReview.push({
          paperId,
          why: "preface could not be sequenced",
          mappedQnum: b.mappedQnum,
          score: b.mappingScore,
          heading: (b.heading ?? "").slice(0, 90),
          best: b.bestMatch ? b.bestMatch.q.text.slice(0, 90) : null,
        });
      }
    }
  }

  // apply mapping for ref blocks
  for (const b of candidates) {
    if (b.preface) continue;
    const refTarget = b.qnum != null ? official.find((q) => q.number === b.qnum) : undefined;
    const offsetTarget = b.qnum != null && offsetApplied ? official.find((q) => q.number === b.qnum + offset) : undefined;
    const text = b.kind === "refer" ? referTargetText(b) : blockMatchText(b);
    if (offsetApplied && b.qnum != null) {
      const targetNum = b.qnum + offset;
      const oq = official.find((q) => q.number === targetNum);
      const cov = oq ? simScore(text, oq.text) : 0;
      if (targetNum >= 1) {
        b.mappedQnum = targetNum;
        if (oq) {
          b.mappingMethod = offset === 0 ? (cov >= COV_OK ? "ref-verified" : "ref-weak") : cov >= COV_OK ? "ref+offset-verified" : "ref+offset-weak";
        } else {
          // the official parse is missing this question (garbled scan): the offset consensus
          // and/or the note's own numbered heading still identify the true question number.
          b.mappingMethod = "ref+offset-recovered";
        }
        b.mappingScore = Number(cov.toFixed(2));
      } else {
        // offset target invalid (e.g. an MCQ fragment misdetected): fall through
        b.mappedQnum = null;
        b.fallthrough = true;
      }
    }
    if (b.mappedQnum == null || b.fallthrough) {
      if (b.bestMatch && b.qnum != null && b.bestMatch.q.number !== b.qnum && b.bestMatch.score >= COV_STRONG && b.bestMatch.score - b.simAtRef >= COV_MARGIN && (!b.secondMatch || b.bestMatch.score - b.secondMatch.score >= COV_MARGIN)) {
        b.mappedQnum = b.bestMatch.q.number;
        b.mappingMethod = "semantic-best";
        b.mappingScore = Number(b.bestMatch.score.toFixed(2));
        report.remaps.push({
          paperId,
          from: `Q${b.qnum}`,
          to: `Q${b.bestMatch.q.number}`,
          score: b.mappingScore,
          heading: (b.heading ?? "").slice(0, 90),
          official: b.bestMatch.q.text.slice(0, 90),
        });
      } else if (b.bestMatch && b.qnum == null && b.bestMatch.score >= COV_STRONG) {
        b.mappedQnum = b.bestMatch.q.number;
        b.mappingMethod = "semantic-best";
        b.mappingScore = Number(b.bestMatch.score.toFixed(2));
      } else if (refTarget) {
        b.mappedQnum = b.qnum;
        b.mappingMethod = b.simAtRef >= COV_OK ? "ref-verified" : "ref-weak";
        b.mappingScore = Number(b.simAtRef.toFixed(2));
      } else if (b.bestMatch && b.bestMatch.score >= COV_STRONG) {
        b.mappedQnum = b.bestMatch.q.number;
        b.mappingMethod = "semantic-best";
        b.mappingScore = Number(b.bestMatch.score.toFixed(2));
        report.remaps.push({
          paperId,
          from: b.qnum != null ? `Q${b.qnum}` : "preface",
          to: `Q${b.bestMatch.q.number}`,
          score: b.mappingScore,
          heading: (b.heading ?? "").slice(0, 90),
          official: b.bestMatch.q.text.slice(0, 90),
        });
      } else if (b.bestMatch && b.bestMatch.score >= COV_OK) {
        b.mappedQnum = b.bestMatch.q.number;
        b.mappingMethod = "semantic-weak";
        b.mappingScore = Number(b.bestMatch.score.toFixed(2));
        report.mappingReview.push({
          paperId,
          why: "semantic-weak mapping",
          qnum: b.qnum,
          mappedQnum: b.mappedQnum,
          score: b.mappingScore,
          heading: (b.heading ?? "").slice(0, 90),
          official: b.bestMatch.q.text.slice(0, 90),
        });
      } else {
        b.mappedQnum = b.qnum; // keep the explicit ref even if official question missing
        b.mappingMethod = "ref-unverified";
        b.mappingScore = b.bestMatch ? Number(b.bestMatch.score.toFixed(2)) : 0;
      }
    }
    // heading number agreement check (only meaningful when the ref was kept as-is)
    if (b.headingNumber != null && b.mappedQnum != null && b.headingNumber !== b.mappedQnum && String(b.mappingMethod).startsWith("ref")) {
      report.mappingReview.push({
        paperId,
        why: "heading-number mismatch",
        qnum: b.qnum,
        mappedQnum: b.mappedQnum,
        headingNumber: b.headingNumber,
        heading: (b.heading ?? "").slice(0, 90),
      });
    }
    const s = b.mappingScore ?? 0;
    const bucket = s < 0.1 ? "0-.1" : s < 0.2 ? ".1-.2" : s < 0.3 ? ".2-.3" : s < 0.4 ? ".3-.4" : s < 0.5 ? ".4-.5" : s < 0.7 ? ".5-.7" : ".7+";
    report.simHistogram[bucket] = (report.simHistogram[bucket] ?? 0) + 1;
  }
}

/* --- assemble question notes (dedupe by mapped question) --- */
const METHOD_RANK = {
  "ref+offset-verified": 6,
  "ref-verified": 5,
  "preface-sequence": 4,
  "semantic-best": 4,
  "ref+offset-recovered": 4,
  "ref+offset-weak": 3,
  "ref-weak": 2,
  "semantic-weak": 2,
  "ref-unverified": 1,
};
const rankOf = (b) => METHOD_RANK[b.mappingMethod ?? "ref-unverified"] ?? 2;
const questionNotes = new Map(); // paperId|qnum -> block
for (const b of allBlocks) {
  if (b.dead || b.kind === "mcq" || b.mappedQnum == null) continue;
  const key = `${b.paperId}|${b.mappedQnum}`;
  const existing = questionNotes.get(key);
  const better =
    !existing ||
    rankOf(b) > rankOf(existing) ||
    (rankOf(b) === rankOf(existing) && existing.kind === "refer" && b.kind === "full") ||
    (rankOf(b) === rankOf(existing) && existing.kind === b.kind && existing.fullContent.length < b.fullContent.length);
  if (better) {
    if (existing) {
      report.droppedDuplicates.push({
        paperId: b.paperId,
        qnum: b.mappedQnum,
        kept: `${b.kind} ${b.fullContent.length}ch (method ${b.mappingMethod})`,
        dropped: `${existing.kind} ${existing.fullContent.length}ch (method ${existing.mappingMethod})`,
      });
      report.contentAccounting.droppedChars += existing.fullContent.length;
    }
    questionNotes.set(key, b);
  } else {
    report.droppedDuplicates.push({
      paperId: b.paperId,
      qnum: b.mappedQnum,
      kept: `${existing.kind} ${existing.fullContent.length}ch (method ${existing.mappingMethod})`,
      dropped: `${b.kind} ${b.fullContent.length}ch (method ${b.mappingMethod})`,
    });
    report.contentAccounting.droppedChars += b.fullContent.length;
  }
}
for (const [, b] of questionNotes) report.contentAccounting.mappedChars += b.fullContent.length;

// report blocks that ended with no official question
for (const b of allBlocks) {
  if (b.dead || b.kind === "mcq") continue;
  const official = officialByPaper.get(b.paperId) ?? [];
  if (b.mappedQnum != null && !official.find((q) => q.number === b.mappedQnum)) {
    report.officialQuestionsMissing.push({
      paperId: b.paperId,
      qnum: b.mappedQnum,
      refQnum: b.qnum,
      method: b.mappingMethod,
      score: b.mappingScore,
      heading: (b.heading ?? "").slice(0, 100),
    });
  }
}

/* ------------------------------------------------------------------ *
 * Cross reference resolution (full pass, after mapping)
 * ------------------------------------------------------------------ */
function findBlocks(code, qnum) {
  return allBlocks.filter((b) => !b.dead && b.code === code && b.qnum === qnum);
}

function topicMatchResolve(code, qnum, contextText, excludeBlock) {
  const candidates = findBlocks(code, qnum).filter((b) => b !== excludeBlock);
  if (!candidates.length) return null;
  const scored = candidates
    .map((c) => {
      const hScore = simScore(contextText, c.heading ?? "");
      const bScore = simScore(contextText, `${c.heading ?? ""} ${c.rawContent.slice(0, 200)}`) * 0.9;
      return { c, score: Math.max(hScore, bScore) };
    })
    .sort((a, b) => b.score - a.score);
  if (scored[0].score >= 0.35 && (scored.length === 1 || scored[0].score - (scored[1]?.score ?? 0) >= 0.1)) {
    return { block: scored[0].c, score: Number(scored[0].score.toFixed(2)) };
  }
  return { ambiguous: true, best: Number(scored[0].score.toFixed(2)) };
}

function resolveCrossRef(block, code, qnum, seg) {
  const light = resolveCrossRefLight(block, code, qnum, seg);
  if (light.self || light.target) return light;
  if (light.ambiguous) {
    // strict topic similarity fallback
    const top = topicMatchResolve(code, qnum, `${block.heading ?? ""} ${seg}`, block);
    if (top?.block) return { target: top.block, score: top.score };
  }
  return light;
}

const crossRefIndex = [];
for (const b of allBlocks) {
  if (b.dead) continue;
  const lines = b.rawContent.split("\n");
  for (const line of lines) {
    if (!line.includes("[[KUHS-QUESTION:")) continue;
    let m;
    REF_ANY.lastIndex = 0;
    while ((m = REF_ANY.exec(line))) {
      report.crossRefs.total++;
      const seg = segmentFor(line, m.index + m[0].length);
      const res = resolveCrossRef(b, m[1], Number(m[2]), seg);
      if (res?.self) report.crossRefs.self++;
      else if (res?.target) {
        report.crossRefs.resolved++;
        crossRefIndex.push({ block: b, code: m[1], qnum: Number(m[2]), target: res.target, method: res.score != null ? `topic-similarity(${res.score})` : "hint" });
      } else {
        report.crossRefs.ambiguous.push({ block: `${b.paperId}|Q${b.qnum ?? "?"}`, ref: `${m[1]}:Q${m[2]}`, line: line.slice(0, 120) });
      }
    }
  }
}

/* --- bare citations [code:Qn] --- */
for (const b of allBlocks) {
  if (b.dead) continue;
  const lines = b.rawContent.split("\n");
  for (const line of lines) {
    BARE_CITATION.lastIndex = 0;
    let m;
    while ((m = BARE_CITATION.exec(line))) {
      report.bareCitations.total++;
      const code = m[1];
      const qnum = Number(m[2]);
      if (b.code === code && b.qnum === qnum) {
        report.bareCitations.resolved++;
        crossRefIndex.push({ block: b, code, qnum, target: b, method: "self", bare: true });
        continue;
      }
      const samePaper = b.code === code ? findBlocks(code, qnum).filter((x) => x.session === b.session) : [];
      if (samePaper.length === 1) {
        report.bareCitations.resolved++;
        crossRefIndex.push({ block: b, code, qnum, target: samePaper[0], method: "same-paper", bare: true });
        continue;
      }
      const earlier = findBlocks(code, qnum).filter((x) => x.chunkIdx === b.chunkIdx && x.lineIdx < b.lineIdx);
      if (earlier.length === 1) {
        report.bareCitations.resolved++;
        crossRefIndex.push({ block: b, code, qnum, target: earlier[0], method: "unique-earlier", bare: true });
        continue;
      }
      if (earlier.length === 0) {
        const global = findBlocks(code, qnum);
        if (global.length === 1) {
          report.bareCitations.resolved++;
          crossRefIndex.push({ block: b, code, qnum, target: global[0], method: "unique-global", bare: true });
          continue;
        }
      }
      const top = topicMatchResolve(code, qnum, `${line} ${b.heading ?? ""}`, b);
      if (top?.block) {
        report.bareCitations.resolved++;
        crossRefIndex.push({ block: b, code, qnum, target: top.block, method: `topic-similarity(${top.score})`, bare: true });
        report.bareCitations.review.push({
          block: `${b.paperId}|Q${b.qnum ?? "?"}`,
          ref: `${code}:Q${qnum}`,
          target: `${top.block.paperId}|Q${qnum}`,
          score: top.score,
          targetHeading: (top.block.heading ?? "").slice(0, 80),
          line: line.slice(0, 110),
        });
        continue;
      }
      report.bareCitations.review.push({
        block: `${b.paperId}|Q${b.qnum ?? "?"}`,
        ref: `${code}:Q${qnum}`,
        unresolved: true,
        best: top?.best ?? null,
        line: line.slice(0, 110),
      });
    }
  }
}

/* ------------------------------------------------------------------ *
 * Assemble the bank
 * ------------------------------------------------------------------ */
const SUBJECT_DISPLAY = { Opthalmology: "Ophthalmology", Otorhinolaryngology: "ENT", Anatomy: "Anatomy" };

function cleanTitle(block) {
  let t = block.headingTitle ?? block.heading ?? "";
  t = t
    .replace(/^(Long Essay|Short Essay|Short Note|Short Answer|Essay|Diagram|Draw and Label|Clinical Case|Case|MCQ)\s*[:—-]\s*/i, "")
    .replace(/\s*\(Continued\)\s*$/i, "")
    .trim();
  return t || `Question ${block.qnum ?? ""}`.trim();
}

function topicKeyFor(title) {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const questions = [];
const papersOut = [];

for (const [paperId, blocks] of paperBlocks) {
  const paper = blocks[0].paper;
  const official = officialByPaper.get(paperId) ?? [];
  const mappedNotes = [...questionNotes.keys()].filter((k) => k.startsWith(`${paperId}|`)).map((k) => Number(k.split("|")[1]));
  const mcqFragments = blocks.filter((b) => b.kind === "mcq");
  const mcqQuestion = official.find((q) => q.mcqGroup);
  const noteOnlyQnums = blocks.filter((b) => b.kind !== "mcq" && b.mappedQnum == null).map((b) => b.qnum);
  const allQnums = new Set([
    ...official.map((q) => q.number),
    ...mappedNotes,
    ...(mcqQuestion && mcqFragments.length ? [mcqQuestion.number] : []),
    ...noteOnlyQnums.filter((q) => q != null),
    ...mcqFragments.filter((b) => !mcqQuestion).map((b) => b.qnum),
  ]);

  const paperQuestions = [];
  for (const qnum of [...allQnums].sort((a, b) => a - b)) {
    const oq = official.find((q) => q.number === qnum);
    const noteBlock = questionNotes.get(`${paperId}|${qnum}`);
    const isMcqKey = Boolean(oq?.mcqGroup) && mcqFragments.length > 0;
    let note = null;
    if (isMcqKey) {
      const merged = mcqFragments
        .map((b) => {
          const body = [b.heading && !/multiple\s*choice/i.test(b.heading) ? `**${b.heading}**` : null, b.rawContent]
            .filter(Boolean)
            .join("\n\n");
          return body.trim();
        })
        .filter(Boolean)
        .join("\n\n---\n\n");
      note = { kind: "mcq-key", title: "MCQ answer key", content: merged, refs: [], mapping: { method: "mcq-merge", fragments: mcqFragments.length } };
    } else if (noteBlock) {
      const refs = crossRefIndex
        .filter((r) => r.block === noteBlock)
        .map((r) => {
          const targetQ =
            r.target && (r.target.kind === "mcq" ? r.target.mergedInto : r.target.mappedQnum != null ? r.target.mappedQnum : r.target.qnum);
          return {
            id: r.target && targetQ != null ? `${r.target.paperId}__q${String(targetQ).padStart(2, "0")}` : null,
            code: r.code,
            qnum: r.qnum,
            label: r.target ? `${r.target.code} Q${String(r.target.qnum).padStart(2, "0")} — ${cleanTitle(r.target)}` : `${r.code} Q${String(r.qnum).padStart(2, "0")}`,
            method: r.method,
          };
        })
        .filter((r, i, arr) => arr.findIndex((x) => x.code === r.code && x.qnum === r.qnum && !!x.id === !!r.id) === i);
      note = {
        kind: noteBlock.kind,
        title: cleanTitle(noteBlock),
        content: noteBlock.rawContent,
        refs,
        mapping: { method: noteBlock.mappingMethod ?? "ref", score: noteBlock.mappingScore ?? null },
      };
    }
    const entry = {
      id: `${paperId}__q${String(qnum).padStart(2, "0")}`,
      paperId,
      subject: paper.subject,
      displaySubject: SUBJECT_DISPLAY[paper.subject] ?? paper.subject,
      paper: paper.paper,
      year: paper.year,
      month: paper.month,
      session: paper.session,
      scheme: paper.scheme,
      code: paper.code,
      qnum,
      qcode: `Q${String(qnum).padStart(2, "0")}`,
      section: oq?.section ?? (isMcqKey ? "Multiple Choice" : guessSection(noteBlock)),
      officialText: oq?.text ?? null,
      officialParsed: Boolean(oq),
      hasNote: Boolean(note),
      note,
    };
    if (note) entry.topic = note.kind === "mcq-key" ? "mcq answer key" : topicKeyFor(note.title);
    paperQuestions.push(entry);
    questions.push(entry);
    if (!note && !isMcqKey) report.questionsWithoutNotes.push({ paperId, qnum, official: oq?.text?.slice(0, 90) ?? null });
  }

  papersOut.push({
    id: paperId,
    subject: paper.subject,
    displaySubject: SUBJECT_DISPLAY[paper.subject] ?? paper.subject,
    paper: paper.paper,
    year: paper.year,
    month: paper.month,
    session: paper.session,
    scheme: paper.scheme,
    code: paper.code,
    title: paper.title,
    exam: paper.exam ?? null,
    phaseLabel: paper.phaseLabel,
    phase: paper.phase,
    questionCount: paperQuestions.length,
    withNotes: paperQuestions.filter((q) => q.hasNote).length,
    mcqKey: Boolean(mcqQuestion && mcqFragments.length),
  });
}

function guessSection(block) {
  if (!block) return "Question";
  const h = block.heading ?? "";
  const m = h.match(/^(Long Essay|Short Essay|Short Note|Short Answer|Essay|Diagram)\b/i);
  return m ? normalizeSection(m[1]) : "Question";
}
function normalizeSection(s) {
  const t = s.toLowerCase();
  if (t.startsWith("long")) return "Long Essay";
  if (t.startsWith("short essay")) return "Short Essay";
  if (t.startsWith("short note")) return "Short Note";
  if (t.startsWith("short answer")) return "Short Answer";
  return s;
}

/* --- subjects rollup --- */
const subjectsMap = new Map();
for (const p of papersOut) {
  if (!subjectsMap.has(p.displaySubject))
    subjectsMap.set(p.displaySubject, { subject: p.subject, display: p.displaySubject, papers: [], questions: 0, withNotes: 0, years: new Set(), topics: new Set() });
  const s = subjectsMap.get(p.displaySubject);
  s.papers.push(p.id);
  if (p.year) s.years.add(p.year);
}
for (const q of questions) {
  const s = subjectsMap.get(q.displaySubject);
  if (!s) continue;
  s.questions++;
  if (q.hasNote) s.withNotes++;
  if (q.topic && q.topic !== "mcq answer key") s.topics.add(q.topic);
}

/* --- topics index (with near-duplicate merging) --- */
const TOPIC_STOP = new Set([
  "short", "note", "notes", "essay", "long", "discuss", "describe", "explain", "write", "briefly", "classify",
  "classification", "causes", "cause", "etiology", "aetiology", "clinical", "features", "feature", "management",
  "treatment", "complications", "complication", "diagnosis", "investigations", "investigation", "and", "of", "in",
  "the", "a", "an", "with", "for", "to", "draw", "label", "add", "on", "list", "outline", "mention", "define",
  "what", "are", "is", "its", "enumerate", "differentiate", "compare", "tabulate", "various", "following",
  "about", "detail", "details", "pathophysiology", "pathogenesis", "indications", "contraindications", "types",
  "functions", "function", "structure", "structures", "boundaries", "boundry", "relations", "applied", "aspect",
  "aspects", "important", "importance", "significance", "differences", "difference", "methods", "method",
  "procedure", "procedures", "tests", "test", "signs", "sign", "symptoms", "symptom", "give", "giving", "write:",
  "how", "why", "which", "when", "where", "you", "your",
]);
function subjectTokens(text) {
  return [...new Set(
    text.toLowerCase().replace(/[’']s/g, "").replace(/[^a-z0-9\s-]/g, " ").split(/[\s-]+/).filter((w) => w.length > 2 && !TOPIC_STOP.has(w))
  )].sort();
}
const topicsMap = new Map();
for (const q of questions) {
  if (!q.topic || q.topic === "mcq answer key") continue;
  if (!topicsMap.has(q.topic)) topicsMap.set(q.topic, { key: q.topic, display: q.note.title, subject: q.displaySubject, questionIds: [] });
  topicsMap.get(q.topic).questionIds.push(q.id);
}
// merge keys that share the same subject-token signature, then greedy-merge subsets
const rawTopics = [...topicsMap.values()].map((t) => ({ ...t, tokens: subjectTokens(t.display) }));
const bySig = new Map();
for (const t of rawTopics) {
  const sig = t.tokens.join(" ");
  if (bySig.has(sig)) bySig.get(sig).push(t);
  else bySig.set(sig, [t]);
}
const mergedGroups = [...bySig.values()];
// greedy subset merge: tokens(A) ⊆ tokens(B) → merge B into A (A = shorter token set)
{
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < mergedGroups.length; i++) {
      for (let j = 0; j < mergedGroups.length; j++) {
        if (i === j) continue;
        const ti = mergedGroups[i][0].tokens;
        const tj = mergedGroups[j][0].tokens;
        if (ti.length && tj.length && ti.length < tj.length && ti.every((w) => tj.includes(w))) {
          mergedGroups[i] = mergedGroups[i].concat(mergedGroups[j]);
          mergedGroups.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
}
const topics = mergedGroups
  .map((group) => {
    const questionIds = group.flatMap((t) => t.questionIds);
    const display = group.reduce((short, t) => (t.display.length < short.length ? t.display : short), group[0].display);
    const subjects = [...new Set(group.map((t) => t.subject))];
    const displaySubjects = [...new Set(group.map((t) => t.displaySubject))];
    return {
      key: subjectTokens(display).join(" "),
      display,
      subject: subjects.length === 1 ? subjects[0] : "mixed",
      displaySubject: displaySubjects.length === 1 ? displaySubjects[0] : displaySubjects.join(" / "),
      count: questionIds.length,
      questionIds,
      years: [...new Set(questionIds.map((id) => questions.find((q) => q.id === id)?.year).filter(Boolean))].sort((a, b) => b - a),
    };
  })
  .sort((a, b) => b.count - a.count || a.display.localeCompare(b.display));

/* --- diagram manifest --- */
const diagrams = new Map();
for (const q of questions) {
  if (!q.note) continue;
  const blocks = [...q.note.content.matchAll(/```(?:[a-zA-Z]*)\n([\s\S]*?)```/g)].map((m) => m[1].replace(/\s+$/, ""));
  for (const code of blocks) {
    const hash = createHash("sha1").update(code).digest("hex").slice(0, 16);
    if (!diagrams.has(hash)) diagrams.set(hash, { hash, code, usedBy: [] });
    diagrams.get(hash).usedBy.push(q.id);
  }
}

/* --- final bank --- */
const bank = {
  schemaVersion: 5,
  app: "KUHS Papers & Study Notes",
  updatedAt: new Date().toISOString(),
  mappingRule:
    "Every note is anchored by an explicit [[KUHS-QUESTION:code:Qn]] marker and resolves to exactly one paper via (Q.P. code, session). Grouped MCQ content is merged per paper into one answer key attached to the official MCQ group question — never split, never attached to essay questions. Mappings are verified against the official question text (IDF-weighted similarity, paper-wide offset consensus); unverifiable items are reported, never guessed.",
  stats: {
    questions: questions.length,
    withNotes: questions.filter((q) => q.hasNote).length,
    papers: papersOut.length,
    subjects: subjectsMap.size,
    topics: topics.length,
    mcqKeys: papersOut.filter((p) => p.mcqKey).length,
    diagrams: diagrams.size,
    crossRefs: report.crossRefs.resolved,
    sourceChunks: notesJson.notes.length,
  },
  subjects: [...subjectsMap.values()].map((s) => ({
    subject: s.subject,
    display: s.display,
    papers: s.papers.length,
    questions: s.questions,
    withNotes: s.withNotes,
    years: [...s.years].sort((a, b) => b - a),
    topics: s.topics.size,
  })),
  papers: papersOut.sort(
    (a, b) => (b.year ?? 0) - (a.year ?? 0) || String(a.session).localeCompare(String(b.session)) || String(a.id).localeCompare(String(b.id)),
  ),
  questions,
  topics,
  diagrams: [...diagrams.values()].map((d) => ({ hash: d.hash, usedBy: d.usedBy.length, lines: d.code.split("\n").length })),
};

mkdirSync(join(root, "scripts"), { recursive: true });
writeJson(join(root, "public", "notes-bank.json"), bank);
writeJson(join(root, "scripts", "notes-build-report.json"), report);

const g = (n) => (n ?? 0).toLocaleString();
console.log(`blocks: ${g(report.blocks.total)} (mcq ${g(report.blocks.mcq)}, refer ${g(report.blocks.refer)}, full ${g(report.blocks.full)}, preface ${g(report.blocks.preface)}, dead ${g(report.blocks.dead)})`);
console.log(`offsets applied: ${report.offsets.filter((o) => o.offset !== 0).length} non-zero of ${report.offsets.length} papers`);
console.log(`semantic remaps: ${g(report.remaps.length)}`);
console.log(`simHistogram: ${JSON.stringify(report.simHistogram)}`);
console.log(`questions: ${g(bank.stats.questions)} withNotes ${g(bank.stats.withNotes)} mcqKeys ${g(bank.stats.mcqKeys)}`);
console.log(`mcq merges: ${report.mcqMerges.length} papers, ${g(report.mcqMerges.reduce((a, m) => a + m.fragments, 0))} fragments`);
console.log(`crossRefs: ${g(report.crossRefs.resolved)} resolved, ${g(report.crossRefs.self)} self, ${g(report.crossRefs.ambiguous.length)} ambiguous`);
console.log(`bareCitations: ${g(report.bareCitations.resolved)} / ${g(report.bareCitations.total)}`);
console.log(`droppedDuplicates: ${g(report.droppedDuplicates.length)}  officialMissing: ${g(report.officialQuestionsMissing.length)}  questionsWithoutNotes: ${g(report.questionsWithoutNotes.length)}  headingNumMismatches: ${g(report.mappingReview.length)}`);
console.log(`content chars: source ${g(report.contentAccounting.sourceChars)} → mapped ${g(report.contentAccounting.mappedChars)} + mcq ${g(report.contentAccounting.mcqChars)} + dropped ${g(report.contentAccounting.droppedChars)} + markers/headers ~${g(report.contentAccounting.markerChars + report.contentAccounting.headerChars)}`);
console.log(`diagrams: ${g(diagrams.size)}  topics: ${g(topics.length)}`);
