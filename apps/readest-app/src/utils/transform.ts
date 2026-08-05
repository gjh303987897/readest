import { Book, BookBookmark, BookConfig, BookFormat, BookNote } from '@/types/book';
import { DBBookConfig, DBBook, DBBookNote } from '@/types/records';
import { sanitizeString } from './sanitize';

export const transformBookConfigToDB = (bookConfig: unknown, userId: string): DBBookConfig => {
  const { bookHash, metaHash, progress, location, updatedAt } = bookConfig as BookConfig;

  return {
    user_id: userId,
    book_hash: bookHash!,
    meta_hash: metaHash,
    location: location,
    progress: progress && JSON.stringify(progress),
    updated_at: new Date(updatedAt ?? Date.now()).toISOString(),
  };
};

export const transformBookConfigFromDB = (dbBookConfig: DBBookConfig): BookConfig => {
  const { book_hash, meta_hash, progress, location, updated_at } = dbBookConfig;
  return {
    bookHash: book_hash,
    metaHash: meta_hash,
    location,
    progress: progress && JSON.parse(progress),
    updatedAt: new Date(updated_at!).getTime(),
  } as BookConfig;
};

export const transformBookToDB = (book: unknown, userId: string): DBBook => {
  const {
    hash,
    metaHash,
    format,
    title,
    sourceTitle,
    author,
    progress,
    coverHash,
    coverUpdatedAt,
    metadata,
    createdAt,
    updatedAt,
    deletedAt,
    uploadedAt,
  } = book as Book;

  return {
    user_id: userId,
    book_hash: hash,
    meta_hash: metaHash,
    format,
    title: sanitizeString(title)!,
    author: sanitizeString(author)!,
    progress: progress,
    cover_hash: coverHash ?? null,
    cover_updated_at: coverUpdatedAt ? new Date(coverUpdatedAt).toISOString() : null,
    source_title: sanitizeString(sourceTitle),
    metadata: metadata ? sanitizeString(JSON.stringify(metadata)) : null,
    created_at: new Date(createdAt ?? Date.now()).toISOString(),
    updated_at: new Date(updatedAt ?? Date.now()).toISOString(),
    deleted_at: deletedAt ? new Date(deletedAt).toISOString() : null,
    uploaded_at: uploadedAt ? new Date(uploadedAt).toISOString() : null,
  };
};

export const transformBookFromDB = (dbBook: DBBook): Book => {
  const {
    book_hash,
    meta_hash,
    format,
    title,
    author,
    progress,
    cover_hash,
    cover_updated_at,
    source_title,
    metadata,
    created_at,
    updated_at,
    deleted_at,
    uploaded_at,
  } = dbBook;

  const book: Book = {
    hash: book_hash,
    metaHash: meta_hash,
    format: format as BookFormat,
    title,
    author,
    progress: progress,
    coverHash: cover_hash ?? null,
    coverUpdatedAt: cover_updated_at ? new Date(cover_updated_at).getTime() : null,
    sourceTitle: source_title,
    metadata: metadata ? JSON.parse(metadata) : null,
    createdAt: new Date(created_at!).getTime(),
    updatedAt: new Date(updated_at!).getTime(),
    deletedAt: deleted_at ? new Date(deleted_at).getTime() : null,
    uploadedAt: uploaded_at ? new Date(uploaded_at).getTime() : null,
  };
  return book;
};

export const transformBookNoteToDB = (bookNote: unknown, userId: string): DBBookNote => {
  const note = bookNote as BookNote;
  return {
    user_id: userId,
    book_hash: note.bookHash,
    meta_hash: note.metaHash,
    id: note.id,
    type: note.type,
    cfi: sanitizeString(note.cfi),
    xpointer0: sanitizeString(note.xpointer0),
    xpointer1: sanitizeString(note.xpointer1),
    text: sanitizeString(note.text),
    style: sanitizeString(note.style),
    color: sanitizeString(note.color),
    note: sanitizeString(note.note),
    page: note.page,
    global: note.global,
    created_at: new Date(note.createdAt ?? Date.now()).toISOString(),
    updated_at: new Date(note.updatedAt ?? Date.now()).toISOString(),
    deleted_at: note.deletedAt ? new Date(note.deletedAt).toISOString() : null,
  };
};

export const transformBookNoteFromDB = (dbBookNote: DBBookNote): BookNote => ({
  bookHash: dbBookNote.book_hash,
  metaHash: dbBookNote.meta_hash,
  id: dbBookNote.id,
  type: dbBookNote.type === 'bookmark' ? 'bookmark' : 'annotation',
  cfi: dbBookNote.cfi,
  xpointer0: dbBookNote.xpointer0,
  xpointer1: dbBookNote.xpointer1,
  text: dbBookNote.text,
  style: dbBookNote.style,
  color: dbBookNote.color,
  note: dbBookNote.note,
  page: dbBookNote.page,
  global: dbBookNote.global,
  createdAt: dbBookNote.created_at ? new Date(dbBookNote.created_at).getTime() : Date.now(),
  updatedAt: dbBookNote.updated_at ? new Date(dbBookNote.updated_at).getTime() : Date.now(),
  deletedAt: dbBookNote.deleted_at ? new Date(dbBookNote.deleted_at).getTime() : null,
});

export const transformBookmarkToBookNote = (
  bookmark: BookBookmark,
  bookHash: string,
  metaHash?: string,
): BookNote => ({
  bookHash,
  metaHash,
  id: bookmark.id,
  type: 'bookmark',
  cfi: bookmark.location,
  text: bookmark.sectionLabel,
  note: bookmark.title,
  page: bookmark.page,
  createdAt: bookmark.createdAt,
  updatedAt: bookmark.updatedAt,
  deletedAt: bookmark.deletedAt,
});

export const transformBookNoteToBookmark = (bookNote: BookNote): BookBookmark | null => {
  if (bookNote.type !== 'bookmark' || !bookNote.cfi) return null;
  return {
    id: bookNote.id,
    location: bookNote.cfi,
    title: Array.from(bookNote.note ?? '')
      .slice(0, 50)
      .join(''),
    sectionLabel: bookNote.text,
    page: bookNote.page,
    createdAt: bookNote.createdAt,
    updatedAt: bookNote.updatedAt,
    deletedAt: bookNote.deletedAt,
  };
};
