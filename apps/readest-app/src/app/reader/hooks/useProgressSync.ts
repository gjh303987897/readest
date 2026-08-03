import { useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useSync } from '@/hooks/useSync';
import type { BookConfig } from '@/types/book';
import { useBookDataStore } from '@/store/bookDataStore';
import { useReaderStore } from '@/store/readerStore';
import { useBookProgress } from '@/store/readerProgressStore';
import { useTranslation } from '@/hooks/useTranslation';
import { CFI } from '@/libs/document';
import { debounce } from '@/utils/debounce';
import { eventDispatcher } from '@/utils/event';
import { SYNC_PROGRESS_INTERVAL_SEC } from '@/services/constants';
import { isMalformedLocationCfi } from '@/utils/cfi';

// Backoff schedule for the first-pull retry on book open. After these
// attempts the gate releases unconditionally so the user's progress can
// still sync out even if the server keeps timing out (high Android network
// concurrency, captive portal, transient 5xx). Total window ≈ 15.5s.
const PULL_RETRY_DELAYS_MS = [1500, 4000, 10000];

export const useProgressSync = (bookKey: string) => {
  const _ = useTranslation();
  // Per-field selectors avoid subscribing this hook's host (FoliateViewer)
  // to the WHOLE bookDataStore — saveConfig writes booksData on every
  // throttled save and would otherwise re-render the entire reader subtree.
  const getConfig = useBookDataStore((s) => s.getConfig);
  const getBookData = useBookDataStore((s) => s.getBookData);
  const getView = useReaderStore((s) => s.getView);
  const setHoveredBookKey = useReaderStore((s) => s.setHoveredBookKey);
  const { syncedConfigs, syncConfigs } = useSync(bookKey);
  const { user } = useAuth();
  // Reactive subscription on this book's progress so the effects below
  // (auto-push debounce, initial pull) re-run when the user turns the
  // page. Reads from readerProgressStore, not readerStore — see
  // store/readerProgressStore.ts for why this split exists.
  const progress = useBookProgress(bookKey);

  const configPulled = useRef(false);
  const hasPulledConfigOnce = useRef(false);
  const pullAttempt = useRef(0);
  const pullInFlight = useRef(false);
  const pullRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPendingPullRetry = () => {
    if (pullRetryTimer.current !== null) {
      clearTimeout(pullRetryTimer.current);
      pullRetryTimer.current = null;
    }
  };

  const pushConfig = async (bookKey: string, config: BookConfig | null) => {
    const book = getBookData(bookKey)?.book;
    if (!config || !book || !user) return;
    const bookHash = book.hash;
    const metaHash = book.metaHash;
    const progressConfig: BookConfig = {
      bookHash,
      metaHash,
      progress: config.progress,
      location: config.location,
      updatedAt: config.updatedAt,
    };
    // The /api/sync POST handler piggybacks books.progress + books.updated_at
    // off this configs push (saves the separate syncBooks round-trip that
    // used to keep the library record fresh while a reader stayed open —
    // see issue #4198). useBooksSync still seeds new books rows when the
    // user is on the library page.
    await syncConfigs([progressConfig], bookHash, metaHash, 'push');
  };

  const pullConfig = async (bookKey: string) => {
    const book = getBookData(bookKey)?.book;
    if (!user || !book) return;
    const bookHash = bookKey.split('-')[0]!;
    const metaHash = book.metaHash;
    await syncConfigs([], bookHash, metaHash, 'pull');
  };

  // Drives the pull on book open. A successful pull is signalled by the
  // [syncedConfigs] effect below flipping `configPulled.current` to true and
  // clearing the retry state — so this function just kicks off the next
  // pull and (re)schedules a retry. If the gate is still closed after
  // PULL_RETRY_DELAYS_MS is exhausted, release it unconditionally so the
  // user's auto-push isn't blocked by a server outage. Re-entry while a
  // pull is in flight or a retry timer is pending is a no-op.
  const pullWithRetry = useCallback(async () => {
    if (configPulled.current) return;
    if (pullInFlight.current) return;
    if (pullRetryTimer.current !== null) return;
    pullInFlight.current = true;
    try {
      await pullConfig(bookKey);
    } finally {
      pullInFlight.current = false;
    }
    if (configPulled.current) return;
    if (pullAttempt.current >= PULL_RETRY_DELAYS_MS.length) {
      // Best-effort release. The server-side last-writer-wins compare still
      // protects the cross-device case (a stale local push with an older
      // updated_at will lose to a fresher server record).
      configPulled.current = true;
      return;
    }
    const delay = PULL_RETRY_DELAYS_MS[pullAttempt.current]!;
    pullAttempt.current += 1;
    pullRetryTimer.current = setTimeout(() => {
      pullRetryTimer.current = null;
      if (!configPulled.current) pullWithRetry();
    }, delay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookKey]);

  const syncConfig = async () => {
    if (!configPulled.current) {
      pullWithRetry();
    } else {
      const config = getConfig(bookKey);
      const book = getBookData(bookKey)?.book;
      if (config && book && config.progress && config.progress[0] > 0) {
        pushConfig(bookKey, config);
      }
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleAutoSync = useCallback(
    debounce(() => {
      syncConfig();
    }, SYNC_PROGRESS_INTERVAL_SEC * 1000),
    [],
  );

  const handleSyncBookProgress = async (event: CustomEvent) => {
    const { bookKey: syncBookKey } = event.detail;
    if (syncBookKey === bookKey) {
      // Flush any pending debounced push first so the latest local progress
      // reaches the cloud before we (re)pull. This covers the book-close case
      // (issue #4532): the reader can tear down inside the SYNC_PROGRESS_INTERVAL_SEC
      // auto-sync window, which would otherwise drop the pending push and leave
      // other devices on the previous cloud-synced position. Must run while the
      // gate below is still open so syncConfig takes the push branch.
      handleAutoSync.flush();
      // Manual pull-to-refresh: tear down any prior retry chain so the new
      // attempt starts fresh, rather than being short-circuited by the
      // "retry already pending" guard in pullWithRetry.
      configPulled.current = false;
      pullAttempt.current = 0;
      clearPendingPullRetry();
      await pullWithRetry();
    }
  };

  // Push: flush the pending push + pull when the book is closed or the user
  // taps the manual Sync button.
  useEffect(() => {
    eventDispatcher.on('sync-book-progress', handleSyncBookProgress);
    return () => {
      eventDispatcher.off('sync-book-progress', handleSyncBookProgress);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookKey]);

  // Push: auto-push progress when progress changes with a debounce
  useEffect(() => {
    if (!progress?.location || !user) return;
    handleAutoSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress?.location]);

  // Pull: pull progress once when the book is opened, with retry on failure
  useEffect(() => {
    if (!progress || hasPulledConfigOnce.current) return;
    hasPulledConfigOnce.current = true;
    pullWithRetry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress]);

  // Clean up any pending retry timer on unmount so it doesn't fire after the
  // reader has been torn down.
  useEffect(() => {
    return () => clearPendingPullRetry();
  }, []);

  const applyRemoteProgress = async (syncedConfigs: BookConfig[]) => {
    const config = getConfig(bookKey);
    const book = getBookData(bookKey)?.book;
    if (!syncedConfigs || syncedConfigs.length === 0 || !config || !book) return;

    const bookHash = bookKey.split('-')[0]!;
    const metaHash = book.metaHash;
    let syncedConfig = syncedConfigs.filter(
      (c) => c.bookHash === bookHash || c.metaHash === metaHash,
    )[0];
    if (syncedConfig) {
      // Discard a malformed synced location so it cannot move the reader or be persisted.
      if (syncedConfig.location && isMalformedLocationCfi(syncedConfig.location)) {
        syncedConfig = { ...syncedConfig, location: undefined };
      }
      const configCFI = config?.location;
      const remoteCFILocation = syncedConfig.location;
      const view = getView(bookKey);
      if (remoteCFILocation && configCFI) {
        if (CFI.compare(configCFI, remoteCFILocation) < 0) {
          if (view) {
            view.goTo(remoteCFILocation);
            setHoveredBookKey(null);
            eventDispatcher.dispatch('hint', {
              bookKey,
              message: _('Reading Progress Synced'),
            });
          }
        }
      }
    }
  };

  // Pull: proccess the pulled progress
  useEffect(() => {
    if (!configPulled.current && syncedConfigs) {
      configPulled.current = true;
      // Pull succeeded — cancel any in-flight retry chain and reset the
      // attempt counter so a future sync-book-progress event starts clean.
      pullAttempt.current = 0;
      clearPendingPullRetry();
      applyRemoteProgress(syncedConfigs).catch((error) => {
        console.error('Failed to apply remote progress', error);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncedConfigs]);
};
