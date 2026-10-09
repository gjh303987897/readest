import { create } from 'zustand';
import type { Book } from '@/types/book';
import type { EnvConfigType } from '@/services/environment';
import { isTauriAppPlatform } from '@/services/environment';
import { filterAccessibleBooks } from '@/services/privacyService';
import { usePrivacyStore } from '@/store/privacyStore';
import { useOpdsReadingCacheStore } from '@/store/opdsReadingCacheStore';

interface LibraryState {
  library: Book[];
  visibleLibrary: Book[];
  libraryLoaded: boolean;
  isSyncing: boolean;
  syncProgress: number;
  checkOpenWithBooks: boolean;
  hashIndex: Map<string, number>;
  setIsSyncing: (syncing: boolean) => void;
  setSyncProgress: (progress: number) => void;
  setCheckOpenWithBooks: (check: boolean) => void;
  setLibrary: (books: Book[]) => void;
  getBookByHash: (hash: string) => Book | undefined;
  getVisibleLibrary: () => Book[];
  rebuildHashIndex: () => void;
  updateBookProgress: (hash: string, progress: [number, number]) => void;
  updateBook: (envConfig: EnvConfigType, book: Book) => Promise<void>;
  updateBooks: (
    envConfig: EnvConfigType,
    books: Book[],
    options?: { skipSave?: boolean },
  ) => Promise<void>;
}

const buildHashIndex = (books: Book[]) =>
  new Map(books.map((book, index) => [book.hash, index] as const));

const visibleBooks = (books: Book[]) => {
  const { hiddenBookHashes, isUnlocked, isCloudUnlockRequired } = usePrivacyStore.getState();
  if (isCloudUnlockRequired) return [];
  return filterAccessibleBooks(
    books.filter((book) => !book.deletedAt),
    hiddenBookHashes,
    isUnlocked,
  );
};

export const useLibraryStore = create<LibraryState>((set, get) => ({
  library: [],
  visibleLibrary: [],
  libraryLoaded: false,
  isSyncing: false,
  syncProgress: 0,
  checkOpenWithBooks: isTauriAppPlatform(),
  hashIndex: new Map(),
  setIsSyncing: (isSyncing) => set({ isSyncing }),
  setSyncProgress: (syncProgress) => set({ syncProgress }),
  setCheckOpenWithBooks: (checkOpenWithBooks) => set({ checkOpenWithBooks }),
  setLibrary: (library) =>
    set({
      library,
      visibleLibrary: visibleBooks(library),
      libraryLoaded: true,
      hashIndex: buildHashIndex(library),
    }),
  getBookByHash: (hash) => {
    const cached = useOpdsReadingCacheStore.getState().books[hash];
    if (cached) return cached;
    const { library, hashIndex } = get();
    const index = hashIndex.get(hash);
    return index === undefined ? undefined : library[index];
  },
  getVisibleLibrary: () => get().visibleLibrary,
  rebuildHashIndex: () => set({ hashIndex: buildHashIndex(get().library) }),
  updateBookProgress: (hash, progress) => {
    const { library, hashIndex } = get();
    const index = hashIndex.get(hash);
    if (index === undefined) return;
    const previous = library[index]!;
    const next: Book = {
      ...previous,
      progress,
      updatedAt: Date.now(),
    };
    const updated = library.slice();
    updated[index] = next;
    set({ library: updated, visibleLibrary: visibleBooks(updated) });
  },
  updateBook: async (envConfig, book) => {
    const appService = await envConfig.getAppService();
    const { library, hashIndex } = get();
    const index = hashIndex.get(book.hash);
    const updated =
      index === undefined
        ? [...library, book]
        : [...library.slice(0, index), book, ...library.slice(index + 1)];
    set({
      library: updated,
      visibleLibrary: visibleBooks(updated),
      hashIndex: buildHashIndex(updated),
    });
    await appService.saveLibraryBooks(updated);
  },
  updateBooks: async (envConfig, books, options) => {
    if (books.length === 0) return;
    const appService = await envConfig.getAppService();
    const diskBooks = get().libraryLoaded ? [] : await appService.loadLibraryBooks();
    const merged = new Map([...diskBooks, ...get().library].map((book) => [book.hash, book]));
    for (const book of books) {
      const current = merged.get(book.hash);
      if (
        !current ||
        Math.max(current.updatedAt ?? current.lastUpdated ?? 0, current.deletedAt ?? 0) <=
          Math.max(book.updatedAt ?? 0, book.deletedAt ?? 0)
      ) {
        merged.set(book.hash, book);
      }
    }
    const updated = Array.from(merged.values());
    set({
      library: updated,
      visibleLibrary: visibleBooks(updated),
      libraryLoaded: true,
      hashIndex: buildHashIndex(updated),
    });
    if (!options?.skipSave) await appService.saveLibraryBooks(updated);
  },
}));

usePrivacyStore.subscribe((state, previous) => {
  if (
    state.isUnlocked === previous.isUnlocked &&
    state.isCloudUnlockRequired === previous.isCloudUnlockRequired &&
    state.hiddenBookHashes === previous.hiddenBookHashes
  ) {
    return;
  }
  useLibraryStore.setState((libraryState) => ({
    visibleLibrary: visibleBooks(libraryState.library),
  }));
});
