import { useCallback, useMemo } from 'react';

import { useEnv } from '@/context/EnvContext';
import { useBookDataStore } from '@/store/bookDataStore';
import { useSettingsStore } from '@/store/settingsStore';
import { BookBookmark, BookProgress } from '@/types/book';
import {
  addBookmarkToList,
  createBookmark,
  getActiveBookmarks,
  removeBookmarkFromList,
  renameBookmarkInList,
} from '@/utils/bookmark';

const EMPTY_BOOKMARKS: BookBookmark[] = [];

export const useBookmarks = (bookKey: string) => {
  const { envConfig } = useEnv();
  const bookId = bookKey.split('-')[0]!;
  const storedBookmarks = useBookDataStore(
    (state) => state.booksData[bookId]?.config?.bookmarks ?? EMPTY_BOOKMARKS,
  );
  const bookmarks = useMemo(() => getActiveBookmarks(storedBookmarks), [storedBookmarks]);
  const getConfig = useBookDataStore((state) => state.getConfig);
  const setConfig = useBookDataStore((state) => state.setConfig);
  const saveConfig = useBookDataStore((state) => state.saveConfig);
  const settings = useSettingsStore((state) => state.settings);

  const persist = useCallback(
    async (update: (current: BookBookmark[]) => BookBookmark[]) => {
      const config = getConfig(bookKey);
      if (!config) throw new Error('Book config is not available');

      const previous = config.bookmarks ?? EMPTY_BOOKMARKS;
      const next = update(previous);
      const nextConfig = { ...config, bookmarks: next };
      setConfig(bookKey, { bookmarks: next });

      try {
        await saveConfig(envConfig, bookKey, nextConfig, settings);
      } catch (error) {
        if (getConfig(bookKey)?.bookmarks === next) {
          setConfig(bookKey, { bookmarks: previous });
        }
        throw error;
      }
    },
    [bookKey, envConfig, getConfig, saveConfig, setConfig, settings],
  );

  const addBookmark = useCallback(
    async (progress: BookProgress, title: string) => {
      if (!progress.location) throw new Error('Reading location is not available');
      const bookmark = createBookmark(progress, title);
      await persist((current) => addBookmarkToList(current, bookmark));
      return bookmark;
    },
    [persist],
  );

  const renameBookmark = useCallback(
    async (id: string, title: string) => {
      await persist((current) => renameBookmarkInList(current, id, title));
    },
    [persist],
  );

  const removeBookmark = useCallback(
    async (id: string) => {
      await persist((current) => removeBookmarkFromList(current, id));
    },
    [persist],
  );

  return { bookmarks, addBookmark, renameBookmark, removeBookmark };
};
