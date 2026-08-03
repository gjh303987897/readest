import type { Book } from '@/types/book';
import type { AppService } from '@/types/system';
import type { SystemSettings } from '@/types/settings';
import { transferManager } from '@/services/transferManager';

export interface IngestFileDeps {
  appService: AppService;
  settings: SystemSettings;
  isLoggedIn: boolean;
}

export interface IngestFileOptions {
  file: File | string;
  books: Book[];
}

export async function ingestFile(
  options: IngestFileOptions,
  dependencies: IngestFileDeps,
): Promise<Book | null> {
  const { appService, isLoggedIn } = dependencies;
  const book = await appService.importBook(options.file, options.books);
  if (!book) return null;

  if (isLoggedIn && !book.uploadedAt) {
    transferManager.queueUpload(book);
  }

  return book;
}
