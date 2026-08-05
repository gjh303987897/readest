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

export const getActiveBookmarks = (bookmarks: BookBookmark[]): BookBookmark[] =>
  bookmarks.filter((bookmark) => !bookmark.deletedAt);

const getBookmarkTimestamp = (bookmark: BookBookmark): number =>
  Math.max(bookmark.updatedAt, bookmark.deletedAt ?? 0);

export const mergeBookmarks = (
  localBookmarks: BookBookmark[],
  remoteBookmarks: BookBookmark[],
): BookBookmark[] => {
  const merged = new Map<string, BookBookmark>();
  const order: string[] = [];

  for (const bookmark of localBookmarks) {
    if (!merged.has(bookmark.id)) order.push(bookmark.id);
    const existing = merged.get(bookmark.id);
    if (!existing || getBookmarkTimestamp(bookmark) >= getBookmarkTimestamp(existing)) {
      merged.set(bookmark.id, bookmark);
    }
  }

  for (const bookmark of remoteBookmarks) {
    if (!merged.has(bookmark.id)) order.push(bookmark.id);
    const existing = merged.get(bookmark.id);
    // The server wins ties so every device converges on the authoritative row.
    if (!existing || getBookmarkTimestamp(bookmark) >= getBookmarkTimestamp(existing)) {
      merged.set(bookmark.id, {
        ...bookmark,
        // fraction is a local display hint and has no book_notes column.
        fraction: bookmark.fraction ?? existing?.fraction,
      });
    }
  }

  return order.map((id) => merged.get(id)!);
};

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

export const removeBookmarkFromList = (
  bookmarks: BookBookmark[],
  id: string,
  now = Date.now(),
): BookBookmark[] =>
  bookmarks.map((bookmark) =>
    bookmark.id === id ? { ...bookmark, updatedAt: now, deletedAt: now } : bookmark,
  );
