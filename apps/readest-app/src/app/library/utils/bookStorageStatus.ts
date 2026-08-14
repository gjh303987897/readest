import type { Book } from '@/types/book';

export type BookStorageStatus = 'local' | 'cloud' | 'syncing';

export const getBookStorageStatus = (
  book: Pick<Book, 'downloadedAt' | 'uploadedAt'>,
  isDownloading: boolean,
): BookStorageStatus => {
  if (isDownloading) return 'syncing';
  if (book.downloadedAt) return 'local';
  return 'cloud';
};
