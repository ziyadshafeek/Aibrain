#!/usr/bin/env node
/* Deep analysis of notes chunks: section headers, refs, MCQ blocks, resolvability. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const readJson = (name) => JSON.parse(readFileSync(join(root, "public", name), "utf8"));
const catalog = readJson("catalog.json");
const fulltext = readJson("fulltext.json");
const notes = readJson("notes.json");

const REF = /\[\[KUHS-QUESTION:(\d+):Q(\d+)\]\]/g;

function sessionFromText(s) {
  const m = s.match(/(19|20)\d{2}_[A-Z]+/);
  return m ? m[0] : null;
}

// 1) catalog lookups
const byCodeSession = new Map();
for (const p of catalog.papers) {
  const key = `${p.code}|${p.session}`;
  if (!byCodeSession.has(key)) byCodeSession.set(key, []);
  byCodeSession.get(key).push(p);
}
console.log("== (code,session) uniqueness for codes in refs ==");
const codes = new Set();
for (const n of notes.notes) for (const m of n.content.matchAll(REF)) codes.add(m[1]);
for (const code of codes) {
  const sessions = [...byCodeSession.keys()].filter((k) => k.startsWith(code + "|"));
  const bad = sessions.filter((s) => byCodeSession.get(s).length > 1);
  console.log(`code ${code}: ${sessions.length} sessions in catalog, ambiguous: ${bad.length}`);
}

// 2) walk chunks, track paper context headers
for (const chunk of notes.notes) {
  console.log(`\n########## CHUNK ${chunk.title} (${chunk.subject}) ##########`);
  const lines = chunk.content.split("\n");
  let ctx = null; // current context {session, scheme, codeHint, label}
  let ctxLine = -1;
  let refCount = 0;
  let mcqCount = 0;
  const unresolved = [];
  const contextHeaders = new Map();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // context headers
    let m;
    if ((m = line.match(/^#{2,3}\s+(.+)$/))) {
      const t = m[1];
      const session = sessionFromText(t);
      if (session && !/\[\[KUHS/.test(t)) {
        ctx = { session, label: t.trim(), line: i, scheme: null };
        contextHeaders.set(t.trim(), (contextHeaders.get(t.trim()) ?? 0) + 1);
      }
    }
    if (/Q\.P\. Code:\s*(\d+)/.test(line)) {
      if (ctx) {
        ctx.codeHint = line.match(/Q\.P\. Code:\s*(\d+)/)[1];
        ctx.scheme = /2019/.test(line) ? "2019" : /2010/.test(line) ? "2010" : null;
      }
    }
    const rm = line.match(/\[\[KUHS-QUESTION:(\d+):Q(\d+)\]\]/);
    if (rm && !/\*\*REFER TO/.test(line)) {
      refCount++;
      const code = rm[1];
      const qnum = Number(rm[2]);
      const session = ctx?.session;
      const papers = session ? byCodeSession.get(`${code}|${session}`) : null;
      let status = papers ? (papers.length === 1 ? "OK" : `AMBIG(${papers.length})`) : "NO-PAPER";
      const nextHead = (lines[i + 1] ?? "").replace(/^#{1,6}\s+/, "").trim();
      const isMcq = /multiple choice|\bmcq\b|\bMCQs\b/i.test(nextHead) || /^\*?\*?\s*(i{1,3}|xi{0,3}|xviii{0,2})\s*\(/i.test(nextHead);
      if (isMcq) mcqCount++;
      if (status !== "OK") unresolved.push({ line: i, code, qnum, session, ctxLabel: ctx?.label, nextHead: nextHead.slice(0, 60) });
    }
  }
  console.log(`refs: ${refCount}, mcq-ish: ${mcqCount}, unresolved: ${unresolved.length}`);
  console.log("context headers:", [...contextHeaders.keys()].length);
  for (const u of unresolved.slice(0, 40)) console.log("  UNRESOLVED", JSON.stringify(u));
}
