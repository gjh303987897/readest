import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Book } from '@/types/book';

interface ReadingCacheState {
  books: Record<string, Book>;
  remember: (book: Book) => void;
  forget: (hash: string) => void;
}

// Session metadata is separate from library.json and never participates in cloud sync.
export const useOpdsReadingCacheStore = create<ReadingCacheState>()(
  persist(
    (set) => ({
      books: {},
      remember: (book) => set((state) => ({ books: { ...state.books, [book.hash]: book } })),
      forget: (hash) =>
        set((state) => {
          const books = { ...state.books };
          delete books[hash];
          return { books };
        }),
    }),
    { name: 'readest-opds-reading-cache', storage: createJSONStorage(() => sessionStorage) },
  ),
);
