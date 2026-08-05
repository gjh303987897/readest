import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const localBookmark = {
    id: 'local-1',
    location: 'epubcfi(/6/4!/4/2)',
    title: 'Local',
    createdAt: 1000,
    updatedAt: 1000,
  };
  const remoteNote = {
    user_id: 'user-1',
    book_hash: 'hash-1',
    meta_hash: 'meta-1',
    id: 'remote-1',
    type: 'bookmark',
    cfi: 'epubcfi(/6/8!/4/2)',
    text: 'Chapter 2',
    note: 'Remote',
    page: 20,
    created_at: new Date(2000).toISOString(),
    updated_at: new Date(2000).toISOString(),
    deleted_at: null,
  };
  const state = {
    config: {
      bookHash: 'hash-1',
      metaHash: 'meta-1',
      bookmarks: [localBookmark],
      updatedAt: 1000,
    },
  };
  return {
    localBookmark,
    remoteNote,
    state,
    pullChanges: vi.fn(),
    pushChanges: vi.fn(),
    saveConfig: vi.fn(async () => {}),
    setConfig: vi.fn((_key: string, partial: { bookmarks?: unknown[] }) => {
      if (partial.bookmarks)
        h.state.config.bookmarks = partial.bookmarks as (typeof localBookmark)[];
    }),
    eventListeners: new Map<string, Set<(event: CustomEvent) => void>>(),
  };
});

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ envConfig: {} }),
}));

vi.mock('@/context/SyncContext', () => ({
  useSyncContext: () => ({
    syncClient: { pullChanges: h.pullChanges, pushChanges: h.pushChanges },
  }),
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: (selector: (state: { settings: object }) => unknown) =>
    selector({ settings: {} }),
}));

vi.mock('@/store/bookDataStore', () => {
  const store = {
    booksData: { 'hash-1': { config: h.state.config } },
    getBookData: () => ({ book: { hash: 'hash-1', metaHash: 'meta-1' } }),
    getConfig: () => h.state.config,
    setConfig: h.setConfig,
    saveConfig: h.saveConfig,
  };
  return {
    useBookDataStore: (selector: (state: typeof store) => unknown) => selector(store),
  };
});

vi.mock('@/utils/event', () => ({
  eventDispatcher: {
    on: (name: string, listener: (event: CustomEvent) => void) => {
      const listeners = h.eventListeners.get(name) ?? new Set();
      listeners.add(listener);
      h.eventListeners.set(name, listeners);
    },
    off: (name: string, listener: (event: CustomEvent) => void) => {
      h.eventListeners.get(name)?.delete(listener);
    },
  },
}));

import { useBookmarkSync } from '@/app/reader/hooks/useBookmarkSync';

beforeEach(() => {
  h.state.config.bookmarks = [h.localBookmark];
  h.pullChanges.mockReset().mockResolvedValue({ books: [], configs: [], notes: [h.remoteNote] });
  h.pushChanges.mockReset().mockResolvedValue({ books: [], configs: [], notes: [] });
  h.saveConfig.mockClear();
  h.setConfig.mockClear();
  h.eventListeners.clear();
});

afterEach(cleanup);

describe('useBookmarkSync', () => {
  it('pulls, merges, persists, and pushes all bookmarks when a book opens', async () => {
    renderHook(() => useBookmarkSync('hash-1-view-1'));

    await waitFor(() => expect(h.pushChanges).toHaveBeenCalled());

    expect(h.pullChanges).toHaveBeenCalledWith(0, 'notes', 'hash-1', 'meta-1');
    expect(h.state.config.bookmarks.map((bookmark) => bookmark.id)).toEqual([
      'local-1',
      'remote-1',
    ]);
    expect(h.saveConfig).toHaveBeenCalled();
    expect(h.pushChanges).toHaveBeenCalledWith({
      notes: expect.arrayContaining([
        expect.objectContaining({ id: 'local-1', type: 'bookmark' }),
        expect.objectContaining({
          id: 'remote-1',
          cfi: h.remoteNote.cfi,
          note: h.remoteNote.note,
        }),
      ]),
    });
  });
});
