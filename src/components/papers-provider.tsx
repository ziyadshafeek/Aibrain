import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import catalogJson from "@/data/catalog.json";
import { applyContentClassification } from "@/lib/classify";
import type { Catalog, Paper, PaperText } from "@/lib/papers";

type PapersContextValue = {
  catalog: Catalog | null;
  papers: Paper[];
  texts: Record<string, PaperText>;
  loading: boolean;
  textsLoading: boolean;
  error: string | null;
  getText: (id: string) => PaperText | undefined;
};

const PapersContext = createContext<PapersContextValue | null>(null);

const INITIAL_CATALOG = catalogJson as Catalog;

export function PapersProvider({ children }: { children: ReactNode }) {
  const [catalog] = useState<Catalog>(INITIAL_CATALOG);
  const [texts, setTexts] = useState<Record<string, PaperText>>({});
  const [textsLoading, setTextsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/fulltext.json");
        if (!res.ok) {
          if (!cancelled) setTextsLoading(false);
          return;
        }
        const data = (await res.json()) as Record<string, PaperText>;
        if (!cancelled) {
          setTexts(data);
          setTextsLoading(false);
        }
      } catch {
        if (!cancelled) setTextsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const papers = useMemo(
    () => catalog.papers.map((paper) => applyContentClassification(paper, texts[paper.id])),
    [catalog, texts],
  );

  const value = useMemo<PapersContextValue>(
    () => ({
      catalog: { ...catalog, papers, count: papers.length },
      papers,
      texts,
      loading: false,
      textsLoading,
      error: null,
      getText: (id) => texts[id],
    }),
    [catalog, papers, texts, textsLoading],
  );

  return <PapersContext.Provider value={value}>{children}</PapersContext.Provider>;
}

export function usePapers() {
  const ctx = useContext(PapersContext);
  if (!ctx) throw new Error("usePapers must be used within PapersProvider");
  return ctx;
}
