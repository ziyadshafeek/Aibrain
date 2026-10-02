import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { NotesDownloadBar } from "@/components/notes-download-bar";
import { QuestionTafsir } from "@/components/question-tafsir";
import { useNotes } from "@/components/notes-provider";
import { Input } from "@/components/ui/input";
import {
  displaySubject,
  filterNotes,
  noteAnchor,
  sessionPretty,
  uniqueSittings,
} from "@/lib/notes";
import { cn } from "@/lib/utils";

type NotesSearch = {
  year?: string;
  session?: string;
  paper?: string;
  paperId?: string;
  q?: string;
};

export const Route = createFileRoute("/notes/$subject")({
  validateSearch: (s: Record<string, unknown>): NotesSearch => ({
    year: typeof s.year === "string" ? s.year : undefined,
    session: typeof s.session === "string" ? s.session : undefined,
    paper: typeof s.paper === "string" ? s.paper : undefined,
    paperId: typeof s.paperId === "string" ? s.paperId : undefined,
    q: typeof s.q === "string" ? s.q : undefined,
  }),
  component: NotesSubject,
});

function NotesSubject() {
  const { subject } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const decoded = displaySubject(decodeURIComponent(subject));
  const { notes, loading } = useNotes();
  const [query, setQuery] = useState("");

  const subjectNotes = useMemo(
    () => notes.filter((n) => displaySubject(n.subject) === decoded),
    [notes, decoded],
  );

  const years = useMemo(
    () =>
      [...new Set(subjectNotes.map((n) => String(n.year)))]
        .sort((a, b) => Number(b) - Number(a)),
    [subjectNotes],
  );

  const year = search.year ?? years[0];
  const yearNotes = useMemo(
    () => subjectNotes.filter((n) => String(n.year) === year),
    [subjectNotes, year],
  );

  const sittings = useMemo(() => uniqueSittings(yearNotes), [yearNotes]);

  const activeSitting = useMemo(() => {
    if (search.paperId) {
      const byId = sittings.find((s) => s.paperId === search.paperId);
      if (byId) return byId;
    }
    if (search.session) {
      const bySession = sittings.find(
        (s) =>
          s.session === search.session &&
          (!search.paper || s.paper === search.paper),
      );
      if (bySession) return bySession;
    }
    return sittings[0];
  }, [sittings, search.paper, search.paperId, search.session]);

  const visible = useMemo(() => {
    if (!activeSitting) return [];
    return filterNotes(yearNotes, {
      session: activeSitting.session,
      paper: activeSitting.paper ?? undefined,
      q: query,
    }).sort((a, b) => a.qnum - b.qnum);
  }, [yearNotes, activeSitting, query]);

  useEffect(() => {
    if (!search.q) return;
    const target = visible.find((n) => String(n.qnum) === search.q);
    if (!target) return;
    const t = window.setTimeout(() => {
      document.getElementById(noteAnchor(target.id))?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 80);
    return () => window.clearTimeout(t);
  }, [search.q, visible]);

  function setSearch(patch: NotesSearch) {
    void navigate({
      search: (prev) => {
        const next = { ...prev, ...patch };
        for (const key of Object.keys(next) as (keyof NotesSearch)[]) {
          if (!next[key]) delete next[key];
        }
        return next;
      },
    });
  }

  return (
    <AppShell dense>
      <div className="notes-breadcrumb">
        <Link to="/notes">
          <ArrowLeft className="size-3.5" /> Notes
        </Link>
        <span>/</span>
        <span>{decoded}</span>
      </div>

      <header className="notes-reader-head">
        <div>
          <p className="eyebrow">Question commentary</p>
          <h1>{decoded}</h1>
          <p>
            {subjectNotes.length} indexed questions · {years.join(" · ")}
          </p>
        </div>
      </header>

      <div className="year-toolbar">
        <span>Year</span>
        {years.map((y) => (
          <button
            key={y}
            type="button"
            className={cn("year-select", year === y && "active")}
            onClick={() =>
              setSearch({
                year: y,
                session: undefined,
                paper: undefined,
                paperId: undefined,
                q: undefined,
              })
            }
          >
            {y}
          </button>
        ))}
      </div>

      <div className="year-toolbar">
        <span>Sitting</span>
        {sittings.map((s) => {
          const active = activeSitting?.paperId === s.paperId;
          return (
            <button
              key={s.paperId}
              type="button"
              className={cn("year-select", active && "active")}
              onClick={() =>
                setSearch({
                  year,
                  session: s.session,
                  paper: s.paper ?? undefined,
                  paperId: s.paperId,
                  q: undefined,
                })
              }
            >
              {sessionPretty(s.session)}
              {s.paper ? ` · ${s.paper}` : ""}
              {s.scheme && s.scheme !== "unknown" ? ` · ${s.scheme}` : ""}
            </button>
          );
        })}
      </div>

      <div className="notes-reader-summary">
        <div>
          <span className="eyebrow">Current paper</span>
          <strong>
            {activeSitting
              ? `${sessionPretty(activeSitting.session)}${activeSitting.paper ? ` · ${activeSitting.paper}` : ""}`
              : "No sitting selected"}
          </strong>
        </div>
        <div className="notes-summary-counts">
          <span>{visible.length} questions</span>
          <span>{visible.filter((n) => n.kind !== "missing").length} with notes</span>
          <span>{visible.filter((n) => n.kind === "missing").length} without a mapped note</span>
        </div>
      </div>

      <NotesDownloadBar notes={subjectNotes} subject={decoded} />

      <div className="notes-layout">
        <aside className="notes-sidebar">
          <div className="sidebar-search">
            <Search />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a question…"
            />
          </div>
          <p className="sidebar-label">Questions</p>
          {visible.map((n) => (
            <a key={n.id} className="outline-link" href={`#${noteAnchor(n.id)}`}>
              <strong className="font-mono tabular-nums">Q{n.qnum}</strong>{" "}
              {n.title}
              {n.kind === "missing" ? (
                <span className="outline-status">No note</span>
              ) : null}
            </a>
          ))}
        </aside>

        <main className="notes-reader-shell">
          {loading ? (
            <div className="notes-loading">Loading notes…</div>
          ) : visible.length ? (
            <div className="tafsir-stream">
              {visible.map((note) => (
                <QuestionTafsir key={note.id} note={note} highlight={query} />
              ))}
            </div>
          ) : (
            <div className="notes-empty">
              No questions match this selection.
            </div>
          )}
        </main>
      </div>
    </AppShell>
  );
}
