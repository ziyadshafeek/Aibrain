import { create } from "zustand";
import { persist } from "zustand/middleware";

type LibraryState = {
  bookmarks: string[];
  recents: string[];
  toggleBookmark: (id: string) => void;
  isBookmarked: (id: string) => boolean;
  addRecent: (id: string) => void;
};

export const useLibrary = create<LibraryState>()(
  persist(
    (set, get) => ({
      bookmarks: [],
      recents: [],
      toggleBookmark: (id) =>
        set((s) => ({
          bookmarks: s.bookmarks.includes(id)
            ? s.bookmarks.filter((x) => x !== id)
            : [id, ...s.bookmarks],
        })),
      isBookmarked: (id) => get().bookmarks.includes(id),
      addRecent: (id) =>
        set((s) => ({
          recents: [id, ...s.recents.filter((x) => x !== id)].slice(0, 24),
        })),
    }),
    { name: "kuhs-papers-library" },
  ),
);
