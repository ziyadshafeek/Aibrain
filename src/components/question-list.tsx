import { Badge } from "@/components/ui/badge";
import type { Question } from "@/lib/papers";

const SECTION_ORDER = [
  "Long Essay",
  "Short Essay",
  "Short Note",
  "Short Answer",
  "Draw Diagram",
];

export function QuestionList({
  questions,
  highlight,
}: {
  questions: Question[];
  highlight?: string;
}) {
  if (!questions.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No structured questions could be parsed from this paper. Use the original PDF
        tab.
      </p>
    );
  }

  const groups = new Map<string, Question[]>();
  for (const q of questions) {
    const list = groups.get(q.section) ?? [];
    list.push(q);
    groups.set(q.section, list);
  }

  const keys = [
    ...SECTION_ORDER.filter((s) => groups.has(s)),
    ...[...groups.keys()].filter((k) => !SECTION_ORDER.includes(k)),
  ];

  return (
    <div className="space-y-8">
      {keys.map((section) => (
        <section key={section}>
          <div className="mb-3 flex items-baseline gap-2">
            <h3 className="font-display text-lg font-medium tracking-tight">{section}</h3>
            <span className="text-xs text-muted-foreground tabular-nums">
              {groups.get(section)?.length}
            </span>
          </div>
          <ol className="space-y-3">
            {(groups.get(section) ?? []).map((q, i) => (
              <li
                key={`${section}-${q.number}-${i}`}
                className="rounded-lg bg-muted/60 p-4"
              >
                <div className="mb-1.5 flex items-center gap-2">
                  {q.number > 0 ? (
                    <Badge variant="secondary" className="font-mono tabular-nums">
                      {q.number}
                    </Badge>
                  ) : null}
                </div>
                <p className="text-sm leading-relaxed text-foreground sm:text-base">
                  {highlight ? emphasize(q.text, highlight) : q.text}
                </p>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function emphasize(text: string, q: string) {
  const needle = q.trim();
  if (!needle) return text;
  const parts = text.split(new RegExp(`(${escapeReg(needle)})`, "ig"));
  return parts.map((part, i) =>
    part.toLowerCase() === needle.toLowerCase() ? (
      <mark key={i} className="rounded-sm bg-accent px-0.5 text-accent-foreground">
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function escapeReg(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
