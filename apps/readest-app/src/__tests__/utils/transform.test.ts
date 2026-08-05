import { describe, expect, it } from 'vitest';
import {
  transformBookConfigFromDB,
  transformBookConfigToDB,
  transformBookFromDB,
  transformBookmarkToBookNote,
  transformBookNoteFromDB,
  transformBookNoteToBookmark,
  transformBookNoteToDB,
  transformBookToDB,
} from '@/utils/transform';
import type { Book, BookBookmark, BookConfig } from '@/types/book';

describe('progress config transforms', () => {
  it('serializes only the remote reading-progress contract', () => {
    const config = {
      bookHash: 'hash-1',
      metaHash: 'meta-1',
      location: 'epubcfi(/6/4!/4/2/1:0)',
      progress: [12, 100],
      updatedAt: 1_700_000_000_000,
      searchConfig: { query: 'local only' },
      viewSettings: { fontSize: 22 },
    } as unknown as BookConfig;

    expect(transformBookConfigToDB(config, 'user-1')).toEqual({
      user_id: 'user-1',
      book_hash: 'hash-1',
      meta_hash: 'meta-1',
      location: 'epubcfi(/6/4!/4/2/1:0)',
      progress: JSON.stringify([12, 100]),
      updated_at: new Date(1_700_000_000_000).toISOString(),
    });
  });

  it('deserializes a remote progress record', () => {
    const config = transformBookConfigFromDB({
      user_id: 'user-1',
      book_hash: 'hash-1',
      meta_hash: 'meta-1',
      location: 'epubcfi(/6/8!/4/2/1:0)',
      progress: JSON.stringify([24, 100]),
      updated_at: '2026-08-03T00:00:00.000Z',
    });

    expect(config).toMatchObject({
      bookHash: 'hash-1',
      metaHash: 'meta-1',
      location: 'epubcfi(/6/8!/4/2/1:0)',
      progress: [24, 100],
      updatedAt: Date.parse('2026-08-03T00:00:00.000Z'),
    });
  });
});

describe('book transforms', () => {
  const baseBook: Book = {
    hash: 'hash-1',
    format: 'EPUB',
    title: 'A title',
    author: 'An author',
    createdAt: 1,
    updatedAt: 2,
  };

  it('round-trips remote library fields', () => {
    const timestamp = Date.UTC(2026, 7, 3, 12);
    const db = transformBookToDB(
      {
        ...baseBook,
        progress: [42, 100],
        uploadedAt: timestamp,
        coverHash: 'cover-hash',
        coverUpdatedAt: timestamp,
      },
      'user-1',
    );
    const restored = transformBookFromDB(db);

    expect(restored).toMatchObject({
      hash: 'hash-1',
      format: 'EPUB',
      title: 'A title',
      author: 'An author',
      progress: [42, 100],
      uploadedAt: timestamp,
      coverHash: 'cover-hash',
      coverUpdatedAt: timestamp,
    });
  });
});

describe('bookmark note transforms', () => {
  it('round-trips the bookmark sync contract and its deletion tombstone', () => {
    const bookmark: BookBookmark = {
      id: 'bookmark-1',
      location: 'epubcfi(/6/8!/4/2)',
      title: 'A short title',
      sectionLabel: 'Chapter 2',
      page: 17,
      createdAt: 1000,
      updatedAt: 2000,
      deletedAt: 3000,
    };

    const note = transformBookmarkToBookNote(bookmark, 'hash-1', 'meta-1');
    const dbNote = transformBookNoteToDB(note, 'user-1');
    const restored = transformBookNoteToBookmark(transformBookNoteFromDB(dbNote));

    expect(dbNote).toMatchObject({
      user_id: 'user-1',
      book_hash: 'hash-1',
      meta_hash: 'meta-1',
      id: 'bookmark-1',
      type: 'bookmark',
      cfi: bookmark.location,
      text: 'Chapter 2',
      note: 'A short title',
      page: 17,
      deleted_at: new Date(3000).toISOString(),
    });
    expect(restored).toMatchObject(bookmark);
  });
});
