import { useCallback, useEffect, useRef } from 'react';

import { useAuth } from '@/context/AuthContext';
import { useEnv } from '@/context/EnvContext';
import { useSyncContext } from '@/context/SyncContext';
import { useBookDataStore } from '@/store/bookDataStore';
import { useSettingsStore } from '@/store/settingsStore';
import type { BookBookmark } from '@/types/book';
import type { DBBookNote } from '@/types/records';
import { mergeBookmarks } from '@/utils/bookmark';
import { debounce } from '@/utils/debounce';
import { eventDispatcher } from '@/utils/event';
import {
  transformBookmarkToBookNote,
  transformBookNoteFromDB,
  transformBookNoteToBookmark,
} from '@/utils/transform';

const EMPTY_BOOKMARKS: BookBookmark[] = [];
const PULL_RETRY_DELAYS_MS = [1500, 4000, 10000];
const PUSH_DEBOUNCE_MS = 1000;

const sameBookmarks = (left: BookBookmark[], right: BookBookmark[]) =>
  JSON.stringify(left) === JSON.stringify(right);

export const useBookmarkSync = (bookKey: string) => {
  const { user } = useAuth();
  const { envConfig } = useEnv();
  const { syncClient } = useSyncContext();
  const settings = useSettingsStore((state) => state.settings);
  const bookId = bookKey.split('-')[0]!;
  const storedBookmarks = useBookDataStore(
    (state) => state.booksData[bookId]?.config?.bookmarks ?? EMPTY_BOOKMARKS,
  );
  const getBookData = useBookDataStore((state) => state.getBookData);
  const getConfig = useBookDataStore((state) => state.getConfig);
  const setConfig = useBookDataStore((state) => state.setConfig);
  const saveConfig = useBookDataStore((state) => state.saveConfig);
  const pullReady = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistBookmarks = useCallback(
    async (incoming: BookBookmark[]) => {
      const config = getConfig(bookKey);
      if (!config) return EMPTY_BOOKMARKS;
      const current = config.bookmarks ?? EMPTY_BOOKMARKS;
      const merged = mergeBookmarks(current, incoming);
      if (sameBookmarks(current, merged)) return current;

      setConfig(bookKey, { bookmarks: merged });
      await saveConfig(envConfig, bookKey, { ...config, bookmarks: merged }, settings);
      return merged;
    },
    [bookKey, envConfig, getConfig, saveConfig, setConfig, settings],
  );

  const remoteRecordsToBookmarks = useCallback((records: unknown[] | null) => {
    if (!records) return EMPTY_BOOKMARKS;
    return records
      .map((record) => transformBookNoteFromDB(record as DBBookNote))
      .map(transformBookNoteToBookmark)
      .filter((bookmark): bookmark is BookBookmark => bookmark !== null);
  }, []);

  const pushLatestBookmarks = useCallback(async () => {
    const book = getBookData(bookKey)?.book;
    const config = getConfig(bookKey);
    if (!user || !book || !config) return;

    const bookmarks = config.bookmarks ?? EMPTY_BOOKMARKS;
    const response = await syncClient.pushChanges({
      notes: bookmarks.map((bookmark) =>
        transformBookmarkToBookNote(bookmark, book.hash, book.metaHash),
      ),
    });
    await persistBookmarks(remoteRecordsToBookmarks(response.notes));
  }, [
    bookKey,
    getBookData,
    getConfig,
    persistBookmarks,
    remoteRecordsToBookmarks,
    syncClient,
    user,
  ]);

  const pushLatestBookmarksSafely = useCallback(async () => {
    try {
      await pushLatestBookmarks();
    } catch (error) {
      console.warn('Failed to push bookmarks', error);
    }
  }, [pushLatestBookmarks]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const schedulePush = useCallback(debounce(pushLatestBookmarksSafely, PUSH_DEBOUNCE_MS), [
    pushLatestBookmarksSafely,
  ]);

  const pullAndReconcile = useCallback(async () => {
    const book = getBookData(bookKey)?.book;
    if (!user || !book) return false;

    const response = await syncClient.pullChanges(0, 'notes', book.hash, book.metaHash);
    await persistBookmarks(remoteRecordsToBookmarks(response.notes));
    pullReady.current = true;
    await pushLatestBookmarksSafely();
    return true;
  }, [
    bookKey,
    getBookData,
    persistBookmarks,
    pushLatestBookmarksSafely,
    remoteRecordsToBookmarks,
    syncClient,
    user,
  ]);

  useEffect(() => {
    pullReady.current = false;
    let cancelled = false;

    const run = async (attempt: number) => {
      try {
        if (await pullAndReconcile()) return;
      } catch (error) {
        console.warn('Failed to synchronize bookmarks', error);
      }
      if (cancelled) return;
      const delay = PULL_RETRY_DELAYS_MS[attempt];
      if (delay === undefined) {
        // Server-side LWW still protects newer remote rows if the initial pull
        // cannot complete. Release local pushes so offline edits are not lost.
        pullReady.current = true;
        schedulePush();
        return;
      }
      retryTimer.current = setTimeout(() => run(attempt + 1), delay);
    };

    if (user) run(0);
    return () => {
      cancelled = true;
      if (retryTimer.current) clearTimeout(retryTimer.current);
      retryTimer.current = null;
    };
  }, [bookKey, pullAndReconcile, schedulePush, user]);

  useEffect(() => {
    if (user && pullReady.current) schedulePush();
  }, [schedulePush, storedBookmarks, user]);

  useEffect(() => {
    const handleManualSync = (event: CustomEvent) => {
      if (event.detail.bookKey !== bookKey || !user) return;
      schedulePush.flush();
      pullAndReconcile().catch((error) => {
        console.warn('Failed to synchronize bookmarks', error);
      });
    };
    eventDispatcher.on('sync-book-progress', handleManualSync);
    return () => {
      eventDispatcher.off('sync-book-progress', handleManualSync);
      schedulePush.flush();
    };
  }, [bookKey, pullAndReconcile, schedulePush, user]);
};
