import { createFileRoute } from "@tanstack/react-router";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { BankQuestion, NotesBank } from "@/lib/bank";
import { buildPaperPdf } from "@/lib/pdf";

/* ------------------------------------------------------------------ */
/* GET — proxy for the original KUHS question paper PDFs               */
/* ------------------------------------------------------------------ */

const PREFIX = "https://www2.kuhs.ac.in/kuhs_new/images/uploads/pdf/questionpapers/";
const ALLOW = /^MEDICAL\/UG\/(?:[A-Za-z0-9_ .,-]+\/)*[A-Za-z0-9_ .,-]+\.pdf$/i;

/* ------------------------------------------------------------------ */
/* POST — generate a merged paper + notes PDF (or a topic selection)   */
/* body: {paperId} | {topicKey} | {questionIds, title}                 */
/* ------------------------------------------------------------------ */

let bankCache: NotesBank | null = null;

async function loadBank(): Promise<NotesBank> {
  if (bankCache) return bankCache;
  const candidates = [
    path.resolve("public/notes-bank.json"),
    path.resolve(".vercel/output/static/notes-bank.json"),
    path.resolve("dist/public/notes-bank.json"),
    path.resolve(".output/public/notes-bank.json"),
  ];
  for (const c of candidates) {
    try {
      const raw = await readFile(c, "utf8");
      bankCache = JSON.parse(raw) as NotesBank;
      return bankCache;
    } catch {
      /* try next */
    }
  }
  throw new Error("notes-bank.json not found on server");
}

function safeFilename(s: string): string {
  return s.replace(/[^A-Za-z0-9._ -]+/g, "").replace(/\s+/g, "_").slice(0, 120);
}

function groupTitle(bank: NotesBank, paperId: string): { title: string; subtitle: string; code: string } {
  const p = bank.papers.find((x) => x.id === paperId);
  if (!p) return { title: "KUHS Question Paper", subtitle: "", code: "" };
  const session = p.session && p.session !== "unknown" ? p.session.split("_").map((w, i) => (i === 1 ? w[0] + w.slice(1).toLowerCase() : w)).join(" ") : "";
  return {
    title: `${p.displaySubject}${p.paper ? ` — ${p.paper}` : ""}`,
    subtitle: [session, p.scheme === "unknown" ? null : `${p.scheme} scheme`].filter(Boolean).join(" · "),
    code: p.code,
  };
}

export const Route = createFileRoute("/api/pdf")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const p = url.searchParams.get("p") ?? "";
        if (!p || p.includes("..") || p.includes("\\") || p.includes("\0") || !ALLOW.test(p)) {
          return new Response("Invalid paper path", { status: 400 });
        }
        const target = PREFIX + p.split("/").map(encodeURIComponent).join("/");
        try {
          const upstream = await fetch(target, {
            headers: {
              "User-Agent": "Mozilla/5.0 (compatible; KUHSPapers/1.0; educational study helper)",
              Accept: "application/pdf",
            },
          });
          if (!upstream.ok) {
            return new Response("Paper could not be fetched from KUHS.", { status: upstream.status === 404 ? 404 : 502 });
          }
          const filename = p.split("/").pop() ?? "paper.pdf";
          return new Response(upstream.body, {
            status: 200,
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition": `inline; filename="${filename.replace(/"/g, "")}"`,
              "Cache-Control": "public, max-age=86400",
            },
          });
        } catch {
          return new Response("KUHS is unreachable right now.", { status: 502 });
        }
      },

      POST: async ({ request }) => {
        let body: { paperId?: string; topicKey?: string; questionIds?: string[]; title?: string };
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON body", { status: 400 });
        }

        if (!body || typeof body !== "object" || Array.isArray(body)) {
          return new Response("Invalid request body", { status: 400 });
        }
        if (body.title !== undefined && (typeof body.title !== "string" || body.title.length > 160)) {
          return new Response("Invalid title", { status: 400 });
        }
        if (body.questionIds !== undefined && (!Array.isArray(body.questionIds) || body.questionIds.length > 500 || body.questionIds.some((id) => typeof id !== "string"))) {
          return new Response("Invalid question selection", { status: 400 });
        }

        const bank = await loadBank();
        let questions: BankQuestion[];
        let title = "";
        let subtitle = "";
        let code = "";
        let coverNote: string | undefined;
        let filename: string;

        if (body.paperId) {
          const paper = bank.papers.find((p) => p.id === body.paperId);
          if (!paper) return new Response("Unknown paperId", { status: 404 });
          questions = bank.questions.filter((q) => q.paperId === paper.id);
          const t = groupTitle(bank, paper.id);
          title = t.title;
          subtitle = t.subtitle;
          code = t.code;
          filename = `KUHS_${safeFilename(t.title)}_${safeFilename(paper.session)}_${paper.code}_with_notes.pdf`;
        } else if (body.topicKey) {
          const topic = bank.topics.find((t) => t.key === body.topicKey);
          if (!topic) return new Response("Unknown topicKey", { status: 404 });
          questions = topic.questionIds
            .map((id) => bank.questions.find((q) => q.id === id))
            .filter((q): q is BankQuestion => Boolean(q));
          title = topic.display;
          subtitle = `${topic.displaySubject} · repeated in ${topic.count} question${topic.count > 1 ? "s" : ""}`;
          coverNote = `Topic compilation — ${questions.length} questions across ${new Set(questions.map((q) => q.paperId)).size} papers (${[...new Set(questions.map((q) => q.year).filter((y): y is number => y != null))].sort((a, b) => b - a).join(", ")})`;
          filename = `KUHS_topic_${safeFilename(topic.display).slice(0, 60)}.pdf`;
        } else if (body.questionIds?.length) {
          questions = body.questionIds
            .map((id) => bank.questions.find((q) => q.id === id))
            .filter((q): q is BankQuestion => Boolean(q));
          if (!questions.length) return new Response("No valid questionIds", { status: 400 });
          title = body.title?.trim() || "Selected study notes";
          subtitle = `${questions.length} questions · ${[...new Set(questions.map((q) => q.displaySubject))].join(", ")}`;
          coverNote = "Custom selection";
          filename = `KUHS_selection_${safeFilename(title).slice(0, 50)}.pdf`;
        } else {
          return new Response("Provide paperId, topicKey, or questionIds", { status: 400 });
        }

        try {
          const origin = new URL(request.url).origin;
          const bytes = buildPaperPdf({
            bank,
            questions,
            meta: { title, subtitle, code, origin, coverNote },
          });
          return new Response(bytes as unknown as BodyInit, {
            status: 200,
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition": `attachment; filename="${filename}"`,
              "Cache-Control": "no-store",
            },
          });
        } catch (err) {
          console.error("pdf build failed", err);
          return new Response("PDF generation failed", { status: 500 });
        }
      },
    },
  },
});
