import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { loadNotesBank, type NotesBank, type NotesPaper, type StudyNote } from "@/lib/notes";

type NotesContextValue = {
  bank: NotesBank | null;
  notes: StudyNote[];
  papers: NotesPaper[];
  loading: boolean;
  error: string | null;
};

const NotesContext = createContext<NotesContextValue | null>(null);

export function NotesProvider({ children }: { children: ReactNode }) {
  const [bank, setBank] = useState<NotesBank | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadNotesBank()
      .then((data) => {
        if (!cancelled) {
          setBank(data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Notes failed to load.");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<NotesContextValue>(
    () => ({
      bank,
      notes: bank?.notes ?? [],
      papers: bank?.papers ?? [],
      loading,
      error,
    }),
    [bank, loading, error],
  );

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
}

export function useNotes() {
  const ctx = useContext(NotesContext);
  if (!ctx) throw new Error("useNotes must be used within NotesProvider");
  return ctx;
}
