# KUHS Papers & Study Notes — workspace notes

TanStack Start + React 19 + Tailwind v4 site over static JSON data in `public/`.

## Data pipeline (repeatable)

- `public/notes.json` — raw AI-generated note chunks (input of record; more chunks can be appended).
- `node scripts/build-notes-bank.mjs` — parses chunks, maps notes to official questions via
  `[[KUHS-QUESTION:CODE:Qnn]]` markers (roman-numeral MCQ parsing, ground-truth offsets,
  verified mappings), resolves cross-references (session/paper hints, same-paper, unique-earlier,
  topic similarity), merges near-duplicate topics, and emits `public/notes-bank.json`
  (schema v5) + `scripts/notes-build-report.json` (audit trail).
- `npm test` (`scripts/validate-content.mjs`) — content QA over catalog, fulltext, notes and bank.
- After editing any `src/routes/*` file the route tree regenerates on the next dev/build run.

## App structure

- `src/lib/bank.ts` — bank loader + indexes (byId, byPaper, topics).
- `src/lib/markdown.ts` — isomorphic note → HTML pipeline (KaTeX math, fenced ASCII diagrams
  as SVG images, cross-ref chips; raw HTML is escaped, so output is trusted without DOMPurify).
- `src/lib/pdf.ts` — server-side PDF builder (Times 12pt, 1.5 spacing, Courier diagram boxes,
  LaTeX → plain text, clickable cross-ref appendix).
- `src/routes/api/pdf.ts` — GET proxies original KUHS PDFs; POST builds merged paper/notes PDFs
  (`{paperId}` | `{topicKey}` | `{questionIds, title}`).
- Study UI: `src/components/study/*` (bank provider, note markdown, question card with +/− notes,
  single download button). One download button per page — never add extra download controls.

## Dev

- `npm run dev` on port 8080 (host 0.0.0.0; `allowedHosts: true` for sandbox previews).
- `npm run build` → `.vercel/output` (nitro vercel preset); `npx vite preview` serves it on 8081.
