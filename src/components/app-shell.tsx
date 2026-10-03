import type { ReactNode } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { BookOpenCheck, Layers, Library, Stethoscope } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Papers", icon: Library },
  { to: "/notes", label: "Study notes", icon: BookOpenCheck },
  { to: "/topics", label: "Topics", icon: Layers },
] as const;

export function AppShell({ children, dense = false }: { children: ReactNode; dense?: boolean }) {
  const { pathname } = useLocation();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-rule/60 bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" className="group flex min-w-0 items-center gap-2.5">
            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-xl bg-moss text-ink-on-accent shadow-card">
              <Stethoscope className="size-4.5" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-display text-[15px] font-semibold leading-tight text-fg group-hover:text-moss-bright">
                KUHS MBBS Papers
              </span>
              <span className="block text-[10.5px] uppercase tracking-[0.14em] text-fg-soft">
                previous papers · study notes
              </span>
            </span>
          </Link>
          <nav className="flex items-center gap-1" aria-label="Primary">
            {NAV.map(({ to, label, icon: Icon }) => {
              const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
              return (
                <Link
                  key={to}
                  to={to}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors sm:px-3",
                    active
                      ? "bg-surface-muted text-moss-bright"
                      : "text-fg-muted hover:bg-surface-muted/60 hover:text-fg",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                  <span className="hidden sm:inline">{label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className={cn("mx-auto max-w-6xl px-4 sm:px-6", dense ? "py-5" : "py-8")}>{children}</main>
      <footer className="mt-14 border-t border-rule/60 py-6">
        <div className="mx-auto max-w-6xl px-4 text-center text-xs text-fg-soft sm:px-6">
          Unofficial study companion for Kerala University of Health Sciences MBBS previous question papers —
          notes are AI-generated study aids, always cross-check with textbooks.
        </div>
      </footer>
    </div>
  );
}
