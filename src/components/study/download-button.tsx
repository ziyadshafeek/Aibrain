import { useState } from "react";
import { Check, Download, Loader2, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The single download control of the site. Generates a merged
 * question-paper + notes PDF server-side and saves it.
 */
export function DownloadPdfButton({
  payload,
  label = "Download PDF",
  size = "md",
  variant = "primary",
  className,
}: {
  payload: { paperId: string } | { topicKey: string } | { questionIds: string[]; title: string };
  label?: string;
  size?: "sm" | "md";
  variant?: "primary" | "ghost";
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");

  async function download() {
    setState("working");
    try {
      const res = await fetch("/api/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`server ${res.status}`);
      const blob = await res.blob();
      const dispo = res.headers.get("Content-Disposition") ?? "";
      const m = /filename="([^"]+)"/.exec(dispo);
      const name = m?.[1] ?? "KUHS_notes.pdf";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setState("done");
      setTimeout(() => setState("idle"), 2600);
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 3600);
    }
  }

  return (
    <button
      type="button"
      onClick={download}
      disabled={state === "working"}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-moss",
        size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2.5 text-sm",
        variant === "primary"
          ? "bg-moss text-ink-on-accent hover:bg-moss-bright shadow-card hover:shadow-card-hover"
          : "border border-rule/60 bg-surface-muted text-fg hover:border-moss hover:text-moss",
        state === "working" && "cursor-progress opacity-80",
        className,
      )}
    >
      {state === "working" ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : state === "done" ? (
        <Check className="size-4" aria-hidden />
      ) : state === "error" ? (
        <TriangleAlert className="size-4" aria-hidden />
      ) : (
        <Download className="size-4" aria-hidden />
      )}
      {state === "working" ? "Building PDF…" : state === "done" ? "Saved" : state === "error" ? "Failed — retry" : label}
    </button>
  );
}
