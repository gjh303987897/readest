import { describe, expect, it } from 'vitest';

import { BookProgress } from '@/types/book';
import {
  addBookmarkToList,
  createBookmark,
  limitBookmarkTitle,
  MAX_BOOKMARK_TITLE_LENGTH,
  normalizeBookmarkTitle,
  removeBookmarkFromList,
  renameBookmarkInList,
} from '@/utils/bookmark';

const progress = {
  location: 'epubcfi(/6/8!/4/2)',
  sectionLabel: 'Chapter 1',
  page: 12,
  pageinfo: { current: 12, total: 100 },
  fraction: 0.12,
} as BookProgress;

describe('bookmark helpers', () => {
  it('limits and normalizes bookmark titles to 50 characters', () => {
    const longTitle = `  ${'书'.repeat(MAX_BOOKMARK_TITLE_LENGTH + 5)}  `;

    expect(Array.from(limitBookmarkTitle(longTitle)).length).toBe(MAX_BOOKMARK_TITLE_LENGTH);
    expect(normalizeBookmarkTitle(longTitle)).toBe('书'.repeat(MAX_BOOKMARK_TITLE_LENGTH));
  });

  it('creates a bookmark from the current reader location', () => {
    const bookmark = createBookmark(progress, '  Important page  ', 1234);

    expect(bookmark).toMatchObject({
      location: progress.location,
      title: 'Important page',
      sectionLabel: 'Chapter 1',
      page: 12,
      fraction: 0.12,
      createdAt: 1234,
      updatedAt: 1234,
    });
  });

  it('keeps multiple bookmarks at the same location', () => {
    const first = createBookmark(progress, 'First', 1000);
    const second = createBookmark(progress, 'Second', 2000);
    const bookmarks = addBookmarkToList(addBookmarkToList([], first), second);

    expect(bookmarks).toHaveLength(2);
    expect(bookmarks.map((bookmark) => bookmark.location)).toEqual([
      progress.location,
      progress.location,
    ]);
    expect(bookmarks.map((bookmark) => bookmark.title)).toEqual(['Second', 'First']);
  });

  it('renames and removes only the selected bookmark', () => {
    const first = createBookmark(progress, 'First', 1000);
    const second = createBookmark(progress, 'Second', 2000);
    const bookmarks = [first, second];
    const renamed = renameBookmarkInList(bookmarks, first.id, '  Renamed  ', 3000);

    expect(renamed[0]).toMatchObject({ title: 'Renamed', updatedAt: 3000 });
    expect(renamed[1]).toBe(second);
    expect(removeBookmarkFromList(renamed, first.id)).toEqual([second]);
  });
});
