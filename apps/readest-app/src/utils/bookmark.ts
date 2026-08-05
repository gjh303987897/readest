import { BookBookmark, BookProgress } from '@/types/book';
import { uniqueId } from '@/utils/misc';

export const MAX_BOOKMARK_TITLE_LENGTH = 50;

export const limitBookmarkTitle = (title: string): string =>
  Array.from(title).slice(0, MAX_BOOKMARK_TITLE_LENGTH).join('');

export const normalizeBookmarkTitle = (title: string): string => limitBookmarkTitle(title.trim());

export const createBookmark = (
  progress: BookProgress,
  title: string,
  now = Date.now(),
): BookBookmark => ({
  id: `${now}-${uniqueId()}`,
  location: progress.location,
  title: normalizeBookmarkTitle(title),
  sectionLabel: progress.sectionLabel || undefined,
  page: progress.page || progress.pageinfo?.current || undefined,
  fraction: progress.fraction,
  createdAt: now,
  updatedAt: now,
});

export const addBookmarkToList = (
  bookmarks: BookBookmark[],
  bookmark: BookBookmark,
): BookBookmark[] => [bookmark, ...bookmarks];

export const renameBookmarkInList = (
  bookmarks: BookBookmark[],
  id: string,
  title: string,
  now = Date.now(),
): BookBookmark[] =>
  bookmarks.map((bookmark) =>
    bookmark.id === id
      ? { ...bookmark, title: normalizeBookmarkTitle(title), updatedAt: now }
      : bookmark,
  );

export const removeBookmarkFromList = (bookmarks: BookBookmark[], id: string): BookBookmark[] =>
  bookmarks.filter((bookmark) => bookmark.id !== id);
