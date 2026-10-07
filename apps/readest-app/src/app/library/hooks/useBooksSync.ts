import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Book } from '@/types/book';
import { useSync } from '@/hooks/useSync';
import { useEnv } from '@/context/EnvContext';
import { useAuth } from '@/context/AuthContext';
import { useLibraryStore } from '@/store/libraryStore';
import { useTranslation } from '@/hooks/useTranslation';
import { SYNC_BOOKS_INTERVAL_SEC } from '@/services/constants';
import { throttle } from '@/utils/throttle';
import { debounce } from '@/utils/debounce';
import { eventDispatcher } from '@/utils/event';
import { needsCoverRefresh, pickFresherCover } from '@/app/library/utils/libraryUtils';

export const useBooksSync = () => {
  const _ = useTranslation();
  const { user } = useAuth();
  const { appService } = useEnv();
  const { library, isSyncing, libraryLoaded } = useLibraryStore();
  const { setLibrary, setIsSyncing, setSyncProgress } = useLibraryStore();
  const { useSyncInited, syncedBooks, syncBooks, lastSyncedAtBooks } = useSync();
  const isPullingRef = useRef(false);

  const getNewBooks = useCallback(() => {
    if (!user) return {};
    const library = useLibraryStore.getState().library;
    const newBooks = library
      .filter(
        (book) =>
          !book.syncedAt ||
          lastSyncedAtBooks < book.updatedAt ||
          lastSyncedAtBooks < (book.deletedAt ?? 0),
      )
      // book.filePath is a device-local absolute path used by the in-place
      // import flow to point at a file outside Books/<hash>/. It is
      // meaningless on any other device, so strip it before pushing to the
      // cloud — peers always rehydrate via the hash-keyed copy that
      // cloudService.downloadBook lands under Books/<hash>/. Keeping the
      // source device's path in the cloud record would be dead data at
      // best, and would become an active footgun if isBookAvailable ever
      // got its branch order swapped (it currently checks Books/<hash>
      // before falling back to filePath; flipping that order would make
      // peers chase a non-existent path instead of downloading).
      // `altFilePaths` (the other on-disk names that resolve to the same book)
      // is device-local for exactly the same reason.
      .map(({ filePath: _filePath, altFilePaths: _altFilePaths, ...rest }): Book => rest);
    return {
      books: newBooks,
    };
  }, [user, lastSyncedAtBooks]);

  const pullLibrary = useCallback(
    async (fullRefresh = false, verbose = false) => {
      if (!user) return;
      if (isPullingRef.current) return;

      isPullingRef.current = true;
      try {
        const library = useLibraryStore.getState().library;
        const since = (libraryLoaded && library.length === 0) || fullRefresh ? 0 : undefined;
        const synced = (await syncBooks([], 'pull', since)) ?? 0;

        if (verbose) {
          eventDispatcher.dispatch('toast', {
            type: 'info',
            message: _('{{count}} book(s) synced', { count: synced }),
          });
        }
      } finally {
        isPullingRef.current = false;
      }
    },
    [_, user, libraryLoaded, syncBooks],
  );

  const autoSyncRef = useRef(async () => {});
  autoSyncRef.current = async () => {
    if (isPullingRef.current) return;
    const newBooks = getNewBooks();
    if (!newBooks.books?.length) return;
    isPullingRef.current = true;
    try {
      await syncBooks(newBooks.books, 'both');
    } catch (error) {
      console.error('Automatic book sync failed:', error);
    } finally {
      isPullingRef.current = false;
    }
  };
  const handleAutoSync = useMemo(
    () =>
      throttle(() => void autoSyncRef.current(), SYNC_BOOKS_INTERVAL_SEC * 1000, {
        emitLast: true,
      }),
    [],
  );
  useEffect(() => () => handleAutoSync.cancel(), [handleAutoSync]);

  useEffect(() => {
    if (!user) return;
    if (isPullingRef.current) return;
    handleAutoSync();
  }, [user, library, handleAutoSync]);

  const pushLibrary = useCallback(async () => {
    if (!user) return;
    const newBooks = getNewBooks();
    if (newBooks.books?.length) {
      await syncBooks(newBooks?.books, 'push');
    }
  }, [user, syncBooks, getNewBooks]);

  useEffect(() => {
    if (!user || !useSyncInited || !libraryLoaded) return;
    void pullLibrary().catch((error) => {
      console.error('Initial library sync failed:', error);
      eventDispatcher.dispatch('toast', { type: 'error', message: _('Failed to sync books') });
    });
  }, [user, useSyncInited, libraryLoaded, pullLibrary]);

  const updateLibrary = useCallback(
    async (signal: AbortSignal) => {
      if (!syncedBooks?.length || !appService) return;
      const cloudBooks = [...syncedBooks].sort((a, b) => a.updatedAt - b.updatedAt);
      const snapshot = new Map(useLibraryStore.getState().library.map((book) => [book.hash, book]));
      const syncedByHash = new Map(cloudBooks.map((book) => [book.hash, book]));
      const existing = [...snapshot.values()].filter((book) => syncedByHash.has(book.hash));
      const refresh = existing.filter((book) =>
        needsCoverRefresh(book, syncedByHash.get(book.hash)!),
      );
      const additions = cloudBooks.filter(
        (book) => !snapshot.has(book.hash) && book.uploadedAt && !book.deletedAt,
      );
      const refreshed = new Map<string, Book>();
      const prepared = new Map<string, Book>();

      // Download methods annotate their arguments; give them copies instead of store objects.
      const downloads = [...refresh, ...additions].map((book) => ({ ...book }));
      setIsSyncing(true);
      try {
        for (let i = 0; i < downloads.length; i += 20) {
          if (signal.aborted) return;
          const batch = downloads.slice(i, i + 20);
          await appService.downloadBookCovers(batch, false, signal);
          if (signal.aborted) return;
          for (const book of batch) {
            refreshed.set(book.hash, {
              ...book,
              coverImageUrl: await appService.generateCoverImageUrl(book),
            });
          }
          setSyncProgress(Math.min((i + 20) / downloads.length, 1));
        }
        if (signal.aborted) return;
        for (const book of existing) {
          const local = refreshed.get(book.hash) ?? book;
          const cloud = syncedByHash.get(book.hash)!;
          const merged =
            Math.max(cloud.updatedAt, cloud.deletedAt ?? 0) >=
            Math.max(local.updatedAt, local.deletedAt ?? 0)
              ? { ...local, ...cloud, syncedAt: Date.now() }
              : { ...cloud, ...local, syncedAt: Date.now() };
          const cover = pickFresherCover(local, cloud);
          prepared.set(book.hash, {
            ...merged,
            coverHash: cover.coverHash,
            coverUpdatedAt: cover.coverUpdatedAt,
            coverImageUrl: local.coverImageUrl,
          });
        }
        for (const book of additions) {
          prepared.set(book.hash, { ...(refreshed.get(book.hash) ?? book), syncedAt: Date.now() });
        }
        // Publish once, merging against the state after all awaits. Concurrent local edits win.
        const latest = useLibraryStore.getState().library;
        const latestHashes = new Set(latest.map((book) => book.hash));
        const merged = latest.map((book) =>
          book === snapshot.get(book.hash) ? (prepared.get(book.hash) ?? book) : book,
        );
        for (const [hash, book] of prepared) {
          if (!snapshot.has(hash) && !latestHashes.has(hash)) merged.push(book);
        }
        setLibrary(merged);
        await appService.saveLibraryBooks(merged);
      } catch (error) {
        if (!signal.aborted) {
          console.error('Error updating synced books:', error);
          eventDispatcher.dispatch('toast', { type: 'error', message: _('Failed to sync books') });
        }
      } finally {
        if (!signal.aborted) setIsSyncing(false);
      }
    },
    [syncedBooks, appService, setIsSyncing, setSyncProgress, setLibrary, _],
  );

  const debouncedUpdateLibrary = useMemo(() => debounce(updateLibrary, 10000), [updateLibrary]);
  useEffect(() => {
    if (!libraryLoaded) return;
    const controller = new AbortController();
    if (isSyncing) debouncedUpdateLibrary(controller.signal);
    else void updateLibrary(controller.signal);
    return () => {
      controller.abort();
      debouncedUpdateLibrary.cancel();
      setIsSyncing(false);
    };
    // isSyncing chooses how to start; publishing our own state must not restart this job.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateLibrary, debouncedUpdateLibrary, libraryLoaded, setIsSyncing]);

  return { pullLibrary, pushLibrary };
};
