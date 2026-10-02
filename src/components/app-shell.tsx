import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { Bookmark, Download, Search, BookOpen } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { usePapers } from "@/components/papers-provider";
import { cn } from "@/lib/utils";

export function AppShell({
  children,
  dense = false,
}: {
  children: React.ReactNode;
  dense?: boolean;
}) {
  const { catalog } = usePapers();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { q?: string };
  const [q, setQ] = useState(search.q ?? "");

  useEffect(() => {
    setQ(search.q ?? "");
  }, [search.q]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const next = q.trim();
    void navigate({
      to: "/",
      search: next ? { q: next } : {},
    });
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link
            to="/"
            className="flex shrink-0 items-center gap-2 text-foreground"
            aria-label="KUHS Papers home"
          >
            <span className="flex size-9 items-center justify-center rounded-md bg-primary font-display text-lg leading-none text-primary-foreground">
              Q
            </span>
            <span className="hidden flex-col leading-tight sm:flex">
              <span className="font-display text-base font-medium tracking-tight">
                KUHS Papers
              </span>
              <span className="text-xs text-muted-foreground">
                MBBS previous years
              </span>
            </span>
          </Link>
          <form onSubmit={onSubmit} className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search subject, year, or a topic…"
              aria-label="Search question papers"
              className="pl-9"
            />
          </form>
          <Link
            to="/"
            hash="download-pack"
            className="inline-flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Download packs"
          >
            <Download className="size-5" />
          </Link>
          <Link
            to="/"
            search={{ saved: "1" }}
            className="inline-flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Saved papers"
          >
            <Bookmark className="size-5" />
          </Link>
          <Link
            to="/notes"
            className="inline-flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Study notes"
          >
            <BookOpen className="size-5" />
          </Link>
        </div>
      </header>
      <main
        className={cn(
          "mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6",
          dense ? "py-4" : "py-8",
        )}
      >
        {children}
      </main>
      <footer className="border-t border-border/80 py-6 text-center text-xs text-muted-foreground">
        <p>
          Papers sourced from{" "}
          <a
            className="underline decoration-border underline-offset-2 hover:text-foreground"
            href={
              catalog?.source ??
              "https://www2.kuhs.ac.in/kuhs_new/index.php?id=14&folder=MEDICAL/UG"
            }
            target="_blank"
            rel="noreferrer"
          >
            Kerala University of Health Sciences
          </a>
          . Subjects are read from each paper’s printed heading. For study use.
        </p>
      </footer>
    </div>
  );
}
