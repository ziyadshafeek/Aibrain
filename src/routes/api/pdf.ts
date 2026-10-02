import { createFileRoute } from "@tanstack/react-router";

const PREFIX = "https://www2.kuhs.ac.in/kuhs_new/images/uploads/pdf/questionpapers/";
const ALLOW = /^MEDICAL\/UG\/(?:[A-Za-z0-9_ .,-]+\/)*[A-Za-z0-9_ .,-]+\.pdf$/i;

export const Route = createFileRoute("/api/pdf")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const path = url.searchParams.get("p") ?? "";
        if (!path || path.includes("..") || path.includes("\\") || path.includes("\0") || !ALLOW.test(path)) {
          return new Response("Invalid paper path", { status: 400 });
        }
        const target = PREFIX + path.split("/").map(encodeURIComponent).join("/");
        try {
          const upstream = await fetch(target, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (compatible; KUHSPapers/1.0; educational study helper)",
              Accept: "application/pdf",
            },
          });
          if (!upstream.ok) {
            return new Response("Paper could not be fetched from KUHS.", {
              status: upstream.status === 404 ? 404 : 502,
            });
          }
          const filename = path.split("/").pop() ?? "paper.pdf";
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
    },
  },
});
