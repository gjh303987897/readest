import { Book, BookConfig, BookFormat } from '@/types/book';
import { DBBookConfig, DBBook } from '@/types/records';
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
