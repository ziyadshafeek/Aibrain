import { Link } from "@tanstack/react-router";
import { Bookmark } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { schemeLabel, sessionLabel, type Paper } from "@/lib/papers";
import { useLibrary } from "@/lib/store";
import { cn } from "@/lib/utils";

export function PaperCard({
  paper,
  snippetText,
  showSubject = false,
}: {
  paper: Paper;
  snippetText?: string | null;
  showSubject?: boolean;
}) {
  const bookmarked = useLibrary((s) => s.bookmarks.includes(paper.id));
  const toggle = useLibrary((s) => s.toggleBookmark);

  return (
    <article className="group relative rounded-xl bg-card p-4 shadow-card transition-[box-shadow,transform] duration-200 ease-out hover:shadow-card-hover">
      <div className="flex items-start justify-between gap-3">
        <Link to="/paper/$id" params={{ id: paper.id }} className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {sessionLabel(paper)}
            <span className="mx-1.5 text-border">·</span>
            {paper.phaseLabel}
          </p>
          <h3 className="mt-1 font-display text-lg font-medium leading-snug tracking-tight text-foreground">
            {paper.title}
          </h3>
        </Link>
        <button
          type="button"
          aria-label={bookmarked ? "Remove bookmark" : "Save paper"}
          onClick={() => toggle(paper.id)}
          className={cn(
            "relative flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground after:absolute after:top-1/2 after:left-1/2 after:size-11 after:-translate-x-1/2 after:-translate-y-1/2 hover:bg-muted hover:text-foreground",
            bookmarked && "text-primary",
          )}
        >
          <Bookmark className={cn("size-4", bookmarked && "fill-current")} />
        </button>
      </div>
      {snippetText ? (
        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{snippetText}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {showSubject && paper.subject ? <Badge variant="accent">{paper.subject}</Badge> : null}
        <Badge>{schemeLabel(paper.scheme)}</Badge>
        <Badge variant="secondary" className="font-mono tabular-nums">
          {paper.code}
        </Badge>
        {paper.docType === "correction" ? <Badge variant="outline">Correction</Badge> : null}
        {paper.hasText ? <Badge variant="accent">Readable text</Badge> : null}
      </div>
    </article>
  );
}
