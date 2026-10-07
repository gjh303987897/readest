import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Book } from '@/types/book';
import type { AppService } from '@/types/system';
import type { EnvConfigType } from '@/services/environment';

const fixture = vi.hoisted(() => ({
  service: {
    loadSettings: vi.fn(),
    loadLibraryBooks: vi.fn(),
    saveLibraryBooks: vi.fn(),
    downloadBookCovers: vi.fn(),
    generateCoverImageUrl: vi.fn(),
  },
  sync: {
    syncedBooks: [] as Book[],
    syncBooks: vi.fn(),
    lastSyncedAtBooks: 0,
    useSyncInited: false,
  },
  user: { id: 'test' },
  translate: (key: string) => key,
  setSettings: vi.fn(),
}));
vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({
    appService: fixture.service,
    envConfig: { getAppService: async () => fixture.service },
  }),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: fixture.user }) }));
vi.mock('@/hooks/useSync', () => ({ useSync: () => fixture.sync }));
vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => fixture.translate }));
vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({ setSettings: fixture.setSettings }),
}));
vi.mock('@/app/library/utils/libraryUtils', () => ({
  needsCoverRefresh: () => true,
  pickFresherCover: () => ({}),
}));
import { useLibrary } from '@/hooks/useLibrary';
import { useBooksSync } from '@/app/library/hooks/useBooksSync';
import { useLibraryStore } from '@/store/libraryStore';
import { usePrivacyStore } from '@/store/privacyStore';
import { SYNC_BOOKS_INTERVAL_SEC } from '@/services/constants';

const book = (hash: string, overrides: Partial<Book> = {}): Book => ({
  hash,
  title: hash,
  author: '',
  format: 'EPUB',
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});
const gate = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
};
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  usePrivacyStore.setState(usePrivacyStore.getInitialState());
  useLibraryStore.setState({ ...useLibraryStore.getInitialState(), checkOpenWithBooks: false });
  fixture.sync.syncedBooks = [];
  fixture.sync.lastSyncedAtBooks = 0;
  fixture.sync.syncBooks = vi.fn().mockResolvedValue(0);
  fixture.service.loadSettings.mockResolvedValue({});
  fixture.service.loadLibraryBooks.mockResolvedValue([]);
  fixture.service.saveLibraryBooks.mockResolvedValue(undefined);
  fixture.service.downloadBookCovers.mockResolvedValue(undefined);
  fixture.service.generateCoverImageUrl.mockResolvedValue('cover');
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it('aborts superseded cover work and publishes only the latest sync result', async () => {
  vi.useFakeTimers();
  const first = gate();
  useLibraryStore.setState({ libraryLoaded: true, library: [] });
  fixture.sync.syncedBooks = [book('first', { uploadedAt: 1 })];
  fixture.service.downloadBookCovers
    .mockImplementationOnce(() => first.promise)
    .mockResolvedValue(undefined);
  const { rerender } = renderHook(useBooksSync);
  const oldSignal = fixture.service.downloadBookCovers.mock.calls[0]![2] as AbortSignal;
  expect(oldSignal.aborted).toBe(false);
  fixture.sync.syncedBooks = [book('second', { uploadedAt: 1 })];
  rerender();
  expect(oldSignal.aborted).toBe(true);
  await act(async () => vi.advanceTimersByTimeAsync(10000));
  first.resolve();
  await act(async () => {});
  expect(fixture.service.saveLibraryBooks).toHaveBeenCalledTimes(1);
  expect(useLibraryStore.getState().library.map((entry) => entry.hash)).toEqual(['second']);
});

describe('library asynchronous recovery', () => {
  it('reports initialization failure and successfully retries', async () => {
    fixture.service.loadSettings.mockRejectedValueOnce(new Error('disk failure'));
    fixture.service.loadLibraryBooks.mockResolvedValue([book('loaded')]);
    const { result } = renderHook(useLibrary);
    await waitFor(() => expect(result.current.libraryError).toBe('disk failure'));
    expect(result.current.libraryLoaded).toBe(false);
    act(() => result.current.retryLibrary());
    await waitFor(() => expect(result.current.libraryLoaded).toBe(true));
    expect(result.current.libraryError).toBeNull();
    expect(useLibraryStore.getState().library.map((book) => book.hash)).toEqual(['loaded']);
  });

  it('merges an import made while a batch is waiting for the app service', async () => {
    useLibraryStore.getState().setLibrary([book('old')]);
    const ready = gate();
    const env = {
      getAppService: async () => {
        await ready.promise;
        return fixture.service as unknown as AppService;
      },
    } as EnvConfigType;
    const pending = useLibraryStore.getState().updateBooks(env, [book('batch')]);
    useLibraryStore.getState().setLibrary([book('old'), book('concurrent')]);
    ready.resolve();
    await pending;
    expect(useLibraryStore.getState().library.map((book) => book.hash)).toEqual([
      'old',
      'concurrent',
      'batch',
    ]);
  });

  it('preserves newer edits and imports made while loading the disk library', async () => {
    const loading = gate();
    fixture.service.loadLibraryBooks.mockImplementation(async () => {
      await loading.promise;
      return [book('disk')];
    });
    const pending = useLibraryStore
      .getState()
      .updateBooks({ getAppService: async () => fixture.service } as unknown as EnvConfigType, [
        book('edited'),
      ]);
    await waitFor(() => expect(fixture.service.loadLibraryBooks).toHaveBeenCalled());
    const edited = book('edited', { title: 'new title', updatedAt: 10, deletedAt: 11 });
    useLibraryStore.getState().setLibrary([edited, book('new')]);
    loading.resolve();
    await pending;
    expect(useLibraryStore.getState().getBookByHash('edited')).toBe(edited);
    expect(useLibraryStore.getState().library.map((book) => book.hash)).toEqual([
      'disk',
      'edited',
      'new',
    ]);
  });

  it('preserves concurrent local edits, additions and removals during cover downloads', async () => {
    const old = book('old');
    const removed = book('removed');
    useLibraryStore.getState().setLibrary([old, removed]);
    fixture.sync.syncedBooks = [book('old', { updatedAt: 2 }), book('removed', { updatedAt: 2 })];
    const downloading = gate();
    fixture.service.downloadBookCovers.mockImplementation(() => downloading.promise);
    renderHook(useBooksSync);
    await waitFor(() => expect(fixture.service.downloadBookCovers).toHaveBeenCalled());
    const edited = book('old', { title: 'local edit', updatedAt: 3 });
    act(() => useLibraryStore.getState().setLibrary([edited, book('import')]));
    await act(async () => downloading.resolve());
    await waitFor(() => expect(fixture.service.saveLibraryBooks).toHaveBeenCalled());
    expect(useLibraryStore.getState().library).toEqual([edited, book('import')]);
    expect(fixture.service.saveLibraryBooks).toHaveBeenCalledWith([edited, book('import')]);
  });

  it('does not mutate cloud records or a previously published library', async () => {
    const cloud = [book('high', { updatedAt: 2, uploadedAt: 1 }), book('low', { uploadedAt: 1 })];
    const snapshot: Book[] = [];
    useLibraryStore.getState().setLibrary(snapshot);
    fixture.sync.syncedBooks = cloud;
    fixture.service.downloadBookCovers.mockImplementation(async (books: Book[]) => {
      for (const book of books) book.coverDownloadedAt = 3;
    });
    renderHook(useBooksSync);
    await waitFor(() => expect(fixture.service.saveLibraryBooks).toHaveBeenCalled());
    expect(cloud.map((book) => book.hash)).toEqual(['high', 'low']);
    expect(cloud.every((book) => !book.coverDownloadedAt)).toBe(true);
    expect(snapshot).toEqual([]);
    expect(useLibraryStore.getState().library.map((book) => book.hash)).toEqual(['low', 'high']);
  });

  it('keeps throttling when the sync function changes and cancels trailing work on unmount', async () => {
    vi.useFakeTimers();
    useLibraryStore.getState().setLibrary([book('push')]);
    const { rerender, unmount } = renderHook(useBooksSync);
    await act(async () => {});
    const nextSync = vi.fn().mockResolvedValue(0);
    fixture.sync.syncBooks = nextSync;
    act(() => {
      useLibraryStore.getState().setLibrary([book('push', { updatedAt: 2 })]);
      rerender();
    });
    await act(async () => vi.advanceTimersByTimeAsync(100));
    expect(nextSync.mock.calls.filter((call) => call[1] === 'both')).toHaveLength(0);
    await act(async () => vi.advanceTimersByTimeAsync(SYNC_BOOKS_INTERVAL_SEC * 1000));
    expect(nextSync.mock.calls.filter((call) => call[1] === 'both')).toHaveLength(1);
    act(() => useLibraryStore.getState().setLibrary([book('push', { updatedAt: 3 })]));
    unmount();
    await vi.advanceTimersByTimeAsync(SYNC_BOOKS_INTERVAL_SEC * 1000);
    expect(nextSync.mock.calls.filter((call) => call[1] === 'both')).toHaveLength(1);
  });

  it('cancels a pending debounced library update when unmounted', async () => {
    vi.useFakeTimers();
    useLibraryStore.getState().setLibrary([]);
    useLibraryStore.getState().setIsSyncing(true);
    fixture.sync.syncedBooks = [book('new', { uploadedAt: 1 })];
    const { unmount } = renderHook(useBooksSync);
    unmount();
    await vi.advanceTimersByTimeAsync(10000);
    expect(fixture.service.downloadBookCovers).not.toHaveBeenCalled();
    expect(fixture.service.saveLibraryBooks).not.toHaveBeenCalled();
  });
});
