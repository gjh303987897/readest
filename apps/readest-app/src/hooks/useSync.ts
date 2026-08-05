import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useEnv } from '@/context/EnvContext';
import { useSyncContext } from '@/context/SyncContext';
import type { SyncData, SyncOp, SyncResult, SyncType } from '@/libs/sync';
import { useSettingsStore } from '@/store/settingsStore';
import { useBookDataStore } from '@/store/bookDataStore';
import { transformBookConfigFromDB, transformBookFromDB } from '@/utils/transform';
import type { DBBook, DBBookConfig } from '@/types/records';
import type { Book, BookConfig, BookDataRecord } from '@/types/book';
import { navigateToLogin } from '@/utils/nav';
import { useReaderStore } from '@/store/readerStore';

export const computeMaxTimestamp = (records: BookDataRecord[]): number => {
  let maxTime = 0;
  for (const record of records) {
    if (record.synced_at) {
      maxTime = Math.max(maxTime, new Date(record.synced_at).getTime());
      continue;
    }
    if (record.updated_at) maxTime = Math.max(maxTime, new Date(record.updated_at).getTime());
    if (record.deleted_at) maxTime = Math.max(maxTime, new Date(record.deleted_at).getTime());
  }
  return maxTime;
};

export const countSyncedRecords = (
  type: SyncType,
  records: BookDataRecord[] | null | undefined,
): number => {
  if (!records?.length) return 0;
  return records.filter((record) => {
    return !record.deleted_at && (type !== 'books' || Boolean(record.uploaded_at));
  }).length;
};

export const BOOKS_PULL_PAGE_SIZE = 1000;

export async function pullBooksPaged(
  pull: (since: number, limit: number) => Promise<BookDataRecord[] | null | undefined>,
  since: number,
  onPage?: (cursor: number) => void,
  pageSize = BOOKS_PULL_PAGE_SIZE,
): Promise<BookDataRecord[]> {
  const byHash = new Map<string, BookDataRecord>();
  let cursor = since;

  for (;;) {
    let page: BookDataRecord[];
    try {
      page = (await pull(cursor, pageSize)) ?? [];
    } catch (error) {
      if (cursor === since) throw error;
      break;
    }

    for (const record of page) byHash.set(record.book_hash ?? record.id, record);

    const pageMax = computeMaxTimestamp(page);
    if (pageMax > cursor) {
      cursor = pageMax;
      onPage?.(cursor);
    } else if (page.length > 0) {
      break;
    }
    if (page.length < pageSize) break;
  }

  return [...byHash.values()];
}

const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;

export function useSync(bookKey?: string) {
  const router = useRouter();
  const { envConfig } = useEnv();
  const { settings, setSettings, saveSettings } = useSettingsStore();
  const { getConfig, setConfig } = useBookDataStore();
  const { setIsSyncing } = useReaderStore();
  const config = bookKey ? getConfig(bookKey) : null;
  const { syncClient } = useSyncContext();

  const [syncingBooks, setSyncingBooks] = useState(false);
  const [syncingConfigs, setSyncingConfigs] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncedAtBooks, setLastSyncedAtBooks] = useState(0);
  const [lastSyncedAtConfigs, setLastSyncedAtConfigs] = useState(0);
  const [lastSyncedAtInited, setLastSyncedAtInited] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult>({
    books: null,
    configs: null,
    notes: null,
  });
  const [syncedBooks, setSyncedBooks] = useState<Book[] | null>(null);
  const [syncedConfigs, setSyncedConfigs] = useState<BookConfig[] | null>(null);

  useEffect(() => {
    if (bookKey) setIsSyncing(bookKey, syncing);
  }, [bookKey, setIsSyncing, syncing]);

  useEffect(() => {
    if (!settings.version || lastSyncedAtInited) return;
    if (bookKey && !config?.location) return;

    const booksAt = settings.lastSyncedAtBooks ?? 0;
    const configsAt = config?.lastSyncedAtConfig ?? settings.lastSyncedAtConfigs ?? 0;
    const now = Date.now();
    setLastSyncedAtBooks(now - booksAt > 3 * ONE_DAY_IN_MS ? 0 : booksAt - ONE_DAY_IN_MS);
    setLastSyncedAtConfigs(now - configsAt > 3 * ONE_DAY_IN_MS ? 0 : configsAt - ONE_DAY_IN_MS);
    setLastSyncedAtInited(true);
  }, [bookKey, config?.lastSyncedAtConfig, config?.location, lastSyncedAtInited, settings]);

  const pullChanges = async (
    type: 'books' | 'configs',
    since: number,
    setLastSyncedAt: React.Dispatch<React.SetStateAction<number>>,
    setLaneSyncing: React.Dispatch<React.SetStateAction<boolean>>,
    bookId?: string,
    metaHash?: string,
  ) => {
    setLaneSyncing(true);
    setSyncError(null);

    try {
      let records: BookDataRecord[] | null | undefined;
      if (type === 'books' && !bookId && !metaHash) {
        records = await pullBooksPaged(
          async (cursor, limit) => {
            const result = await syncClient.pullChanges(cursor, type, undefined, undefined, limit);
            return result.books;
          },
          since,
          (cursor) => {
            setLastSyncedAt(cursor);
            const latest = useSettingsStore.getState().settings;
            latest.lastSyncedAtBooks = cursor;
            setSettings(latest);
          },
        );
      } else {
        const result = await syncClient.pullChanges(since, type, bookId, metaHash);
        records = result.configs;
      }

      setSyncResult((current) => ({ ...current, [type]: records }));
      if (since > 1000 && !records?.length) return 0;

      const maxTime = records?.length ? computeMaxTimestamp(records) : Date.now();
      setLastSyncedAt(maxTime);
      const latest = useSettingsStore.getState().settings;
      if (type === 'books') {
        latest.lastSyncedAtBooks = maxTime;
        setSettings(latest);
      } else if (bookId && bookKey) {
        setConfig(bookKey, { lastSyncedAtConfig: maxTime });
      } else {
        latest.lastSyncedAtConfigs = maxTime;
        setSettings(latest);
      }
      return countSyncedRecords(type, records);
    } catch (error: unknown) {
      console.error(error);
      const message = error instanceof Error ? error.message : `Error pulling ${type}`;
      const latest = useSettingsStore.getState().settings;
      if (message.includes('Not authenticated') && latest.keepLogin) {
        latest.keepLogin = false;
        setSettings(latest);
        navigateToLogin(router);
      }
      setSyncError(message);
      return 0;
    } finally {
      setLaneSyncing(false);
      saveSettings(envConfig, useSettingsStore.getState().settings);
    }
  };

  const pushChanges = async (payload: SyncData): Promise<boolean> => {
    setSyncing(true);
    setSyncError(null);
    try {
      setSyncResult(await syncClient.pushChanges(payload));
      return true;
    } catch (error: unknown) {
      console.error(error);
      setSyncError(error instanceof Error ? error.message : 'Error pushing changes');
      return false;
    } finally {
      setSyncing(false);
    }
  };

  const syncBooks = useCallback(
    async (books?: Book[], op: SyncOp = 'both', since?: number) => {
      if (!lastSyncedAtInited) return;
      if ((op === 'push' || op === 'both') && books?.length) await pushChanges({ books });
      if (op === 'pull' || op === 'both') {
        return pullChanges(
          'books',
          since ?? lastSyncedAtBooks + 1,
          setLastSyncedAtBooks,
          setSyncingBooks,
        );
      }
      return undefined;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lastSyncedAtBooks, lastSyncedAtInited],
  );

  const syncConfigs = useCallback(
    async (bookConfigs?: BookConfig[], bookId?: string, metaHash?: string, op: SyncOp = 'both') => {
      if (!bookId && !lastSyncedAtInited) return;
      if ((op === 'push' || op === 'both') && bookConfigs?.length) {
        const pushed = await pushChanges({ configs: bookConfigs });
        if (pushed && bookId && bookKey) setConfig(bookKey, { lastPushedAtConfig: Date.now() });
      }
      if (op === 'pull' || op === 'both') {
        await pullChanges(
          'configs',
          lastSyncedAtConfigs,
          setLastSyncedAtConfigs,
          setSyncingConfigs,
          bookId,
          metaHash,
        );
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lastSyncedAtConfigs, lastSyncedAtInited],
  );

  useEffect(() => {
    if (syncing) return;
    if (syncResult.books) {
      setSyncedBooks(
        syncResult.books.map((book) => transformBookFromDB(book as unknown as DBBook)),
      );
    }
    if (syncResult.configs) {
      setSyncedConfigs(
        syncResult.configs.map((config) =>
          transformBookConfigFromDB(config as unknown as DBBookConfig),
        ),
      );
    }
  }, [syncResult, syncing]);

  return {
    syncing: syncingBooks || syncingConfigs,
    syncError,
    syncResult,
    syncedBooks,
    syncedConfigs,
    lastSyncedAtBooks,
    lastSyncedAtConfigs,
    useSyncInited: lastSyncedAtInited,
    pullChanges,
    pushChanges,
    syncBooks,
    syncConfigs,
  };
}
