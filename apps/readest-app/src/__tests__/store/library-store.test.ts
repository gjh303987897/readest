import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/environment', () => ({
  isTauriAppPlatform: () => false,
}));

import { useLibraryStore } from '@/store/libraryStore';
import type { Book } from '@/types/book';
import type { EnvConfigType } from '@/services/environment';
import type { AppService } from '@/types/system';

const makeBook = (overrides: Partial<Book> = {}): Book => ({
  hash: 'hash-1',
  format: 'EPUB',
  title: 'Book',
  author: 'Author',
  createdAt: 1,
  updatedAt: 2,
  ...overrides,
});

const makeEnv = (appService: Partial<AppService>): EnvConfigType => ({
  getAppService: vi.fn().mockResolvedValue(appService as AppService),
});

describe('libraryStore', () => {
  beforeEach(() => {
    useLibraryStore.setState({
      library: [],
      visibleLibrary: [],
      libraryLoaded: false,
      isSyncing: false,
      syncProgress: 0,
      checkOpenWithBooks: false,
      hashIndex: new Map(),
    });
  });

  it('loads visible books and builds the hash index', () => {
    useLibraryStore
      .getState()
      .setLibrary([makeBook({ hash: 'a' }), makeBook({ hash: 'b', deletedAt: 3 })]);

    const state = useLibraryStore.getState();
    expect(state.libraryLoaded).toBe(true);
    expect(state.getBookByHash('a')?.hash).toBe('a');
    expect(state.getVisibleLibrary().map((book) => book.hash)).toEqual(['a']);
  });

  it('updates progress immutably', () => {
    const original = makeBook({ hash: 'a', progress: [1, 10] });
    useLibraryStore.getState().setLibrary([original]);

    useLibraryStore.getState().updateBookProgress('a', [5, 10]);

    expect(original.progress).toEqual([1, 10]);
    expect(useLibraryStore.getState().getBookByHash('a')?.progress).toEqual([5, 10]);
    expect(useLibraryStore.getState().visibleLibrary[0]?.progress).toEqual([5, 10]);
  });

  it('persists a single book update', async () => {
    const saveLibraryBooks = vi.fn().mockResolvedValue(undefined);
    const envConfig = makeEnv({ saveLibraryBooks });
    useLibraryStore.getState().setLibrary([makeBook({ hash: 'a' })]);

    await useLibraryStore
      .getState()
      .updateBook(envConfig, makeBook({ hash: 'a', title: 'Updated' }));

    expect(useLibraryStore.getState().getBookByHash('a')?.title).toBe('Updated');
    expect(saveLibraryBooks).toHaveBeenCalledOnce();
  });

  it('merges imported books and persists once', async () => {
    const saveLibraryBooks = vi.fn().mockResolvedValue(undefined);
    const envConfig = makeEnv({ saveLibraryBooks });
    useLibraryStore.getState().setLibrary([makeBook({ hash: 'a' })]);

    await useLibraryStore.getState().updateBooks(envConfig, [makeBook({ hash: 'b' })]);

    expect(useLibraryStore.getState().library.map((book) => book.hash)).toEqual(['a', 'b']);
    expect(saveLibraryBooks).toHaveBeenCalledOnce();
  });

  it('hydrates disk data before merging when the store is not loaded', async () => {
    const loadLibraryBooks = vi.fn().mockResolvedValue([makeBook({ hash: 'disk' })]);
    const saveLibraryBooks = vi.fn().mockResolvedValue(undefined);
    const envConfig = makeEnv({ loadLibraryBooks, saveLibraryBooks });

    await useLibraryStore.getState().updateBooks(envConfig, [makeBook({ hash: 'new' })]);

    expect(useLibraryStore.getState().library.map((book) => book.hash)).toEqual(['disk', 'new']);
  });
});
