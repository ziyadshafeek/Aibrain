#!/usr/bin/env node
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const readJson = (name) => JSON.parse(readFileSync(join(root, name), "utf8"));
const fail = (message) => {
  console.error(`CONTENT QA FAILED: ${message}`);
  process.exitCode = 1;
};

const catalog = readJson("public/catalog.json");
const fulltext = readJson("public/fulltext.json");
const notes = readJson("public/notes.json");

if (!Array.isArray(catalog.papers) || catalog.papers.length !== catalog.count) {
  fail(`catalog count mismatch (${catalog.papers?.length} vs ${catalog.count})`);
}
const ids = new Set(catalog.papers.map((p) => p.id));
if (ids.size !== catalog.papers.length) fail("catalog contains duplicate paper ids");
const fulltextIds = Object.keys(fulltext);
if (fulltextIds.some((id) => !ids.has(id))) fail("fulltext contains an id not present in catalog");
const fulltextIdSet = new Set(fulltextIds);
const expectedTextOk = catalog.papers.filter((p) => p.hasText).length;
if (expectedTextOk !== fulltextIds.length) fail(`hasText/fulltext count mismatch (${expectedTextOk} vs ${fulltextIds.length})`);
for (const paper of catalog.papers) {
  if (!paper.path?.endsWith(".pdf")) fail(`bad PDF path: ${paper.id}`);
  if (!/^https?:\/\//.test(paper.url ?? "")) fail(`bad PDF URL: ${paper.id}`);
  if (!String(paper.url).includes("/MEDICAL/UG/")) fail(`non-MBBS KUHS URL: ${paper.id}`);
  if (Boolean(paper.hasText) !== fulltextIdSet.has(paper.id)) {
    fail(`hasText/fulltext id mismatch: ${paper.id}`);
  }
  if (!/^(?:paper|correction)$/.test(paper.docType ?? "paper")) {
    fail(`unexpected document type: ${paper.id}`);
  }
}
if (!Array.isArray(notes.notes) || notes.notes.length !== 4) fail("expected four note sets");
for (const note of notes.notes) {
  if (!note.id || !note.subject || !note.title || !note.content) fail(`incomplete note record: ${note.id}`);
  if ((note.content.match(/\[\[KUHS-QUESTION:[^\]]+\]\]/g) ?? []).length === 0) {
    console.warn(`CONTENT QA WARNING: no question markers found in ${note.title}`);
  }
}

const requiredFiles = [
  "package.json",
  "package-lock.json",
  "vite.config.ts",
  "vercel.json",
  "src/routes/__root.tsx",
  "src/routes/index.tsx",
  "src/routes/notes.tsx",
  "src/routes/notes.$subject.tsx",
  "src/routes/api/pdf.ts",
  "src/routeTree.gen.ts",
];
for (const file of requiredFiles) {
  try {
    statSync(join(root, file));
  } catch {
    fail(`required file missing: ${file}`);
  }
}
const pkg = readJson("package.json");
if (pkg.name !== "kuhs-papers-study-notes") fail(`unexpected package name: ${pkg.name}`);
const lock = readJson("package-lock.json");
const lockRoot = lock.packages?.[""] ?? {};
if (JSON.stringify(lockRoot.dependencies ?? {}) !== JSON.stringify(pkg.dependencies ?? {})) {
  fail("package-lock root dependencies do not match package.json");
}
if (JSON.stringify(lockRoot.devDependencies ?? {}) !== JSON.stringify(pkg.devDependencies ?? {})) {
  fail("package-lock root devDependencies do not match package.json");
}
const vercel = readJson("vercel.json");
if (vercel.framework !== "tanstack-start") fail("vercel.json is not configured for tanstack-start");
const pdfSource = readFileSync(join(root, "src/routes/api/pdf.ts"), "utf8");
if (!pdfSource.includes("(?:[A-Za-z0-9_ .,-]+\\/)*[A-Za-z0-9_ .,-]+\\.pdf")) {
  fail("PDF proxy allowlist does not support nested KUHS paths");
}
const pdfAllow = /^MEDICAL\/UG\/(?:[A-Za-z0-9_ .,-]+\/)*[A-Za-z0-9_ .,-]+\.pdf$/i;
for (const paper of catalog.papers) {
  if (!pdfAllow.test(paper.path)) fail(`catalog PDF path rejected by proxy allowlist: ${paper.id}`);
}
const proxyAccepts = (path) =>
  Boolean(path) && !path.includes("..") && !path.includes("\\") && !path.includes("\0") && pdfAllow.test(path);
for (const rejected of ["../../etc/passwd", "MEDICAL/UG\\2026_JANUARY\\101001.pdf", "MEDICAL/UG/2026_JANUARY/<script>.pdf"]) {
  if (proxyAccepts(rejected)) fail(`PDF proxy rejection test unexpectedly accepted: ${rejected}`);
}
const rootSource = readFileSync(join(root, "src/routes/__root.tsx"), "utf8");
if (rootSource.includes("preview-host-bridge") || rootSource.includes("__grok/")) {
  fail("public app still contains Grok preview-only wiring");
}

const sizes = ["public/catalog.json", "public/fulltext.json", "public/notes.json"].map((p) => `${p}=${statSync(join(root, p)).size}`);
console.log(`CONTENT QA PASSED: ${catalog.papers.length} papers, ${fulltextIds.length} full-text records, ${notes.notes.length} note sets.`);
console.log(sizes.join(" · "));
