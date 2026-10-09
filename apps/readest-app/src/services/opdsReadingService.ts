import type { Book } from '@/types/book';
import type { AppService } from '@/types/system';
import { useOpdsReadingCacheStore } from '@/store/opdsReadingCacheStore';
import { stubTranslation as _ } from '@/utils/misc';

const CACHE_DIRECTORY = 'opds-reading';
const CACHE_BYTES = 512 * 1024 * 1024;
const CACHE_FILES = 10;

export class OpdsSaveCancelledError extends Error {}

export const prepareOpdsReadingBook = async (
  service: AppService,
  file: File,
  saveToLibrary: boolean,
  library: Book[],
  activeHashes: string[] = [],
  confirmExisting?: (books: Book[]) => Promise<boolean>,
): Promise<{ book: Book; library?: Book[] }> => {
  if (saveToLibrary) {
    // The importer may mutate its deduplication candidates; persist only after success.
    const importedLibrary = structuredClone(library);
    let cancelled = false;
    const book = await service.importBook(file, importedLibrary, {
      ...(confirmExisting
        ? {
            confirmExisting: async (books: Book[]) => {
              const accepted = await confirmExisting(books);
              cancelled = !accepted;
              return accepted;
            },
          }
        : {}),
    });
    if (cancelled) throw new OpdsSaveCancelledError();
    if (!book) throw new Error(_('Unable to open book'));
    // The importer can change an existing entry's hash. Retire the old key so
    // library and cloud merges cannot keep a record whose file was replaced.
    const importedHashes = new Set(importedLibrary.map((entry) => entry.hash));
    for (const original of library) {
      if (importedHashes.has(original.hash)) continue;
      const retiredAt = Math.max(
        Date.now(),
        original.updatedAt ?? original.lastUpdated ?? 0,
        original.deletedAt ?? 0,
      );
      importedLibrary.push({
        ...original,
        deletedAt: retiredAt,
        updatedAt: retiredAt,
        downloadedAt: null,
      });
    }
    useOpdsReadingCacheStore.getState().forget(book.hash);
    return { book, library: importedLibrary };
  }

  await service.createDir(CACHE_DIRECTORY, 'Cache', true);
  const name = `${Date.now()}-${crypto.randomUUID()}-${file.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(-120)}`;
  const relativePath = `${CACHE_DIRECTORY}/${name}`;
  await service.writeFile(relativePath, 'Cache', await file.arrayBuffer());
  const path = await service.resolveFilePath(relativePath, 'Cache');
  try {
    const book = await service.importBook(path, [], {
      transient: true,
      saveBook: false,
      saveCover: false,
    });
    if (!book) throw new Error(_('Unable to open book'));
    book.cacheOnly = true;
    useOpdsReadingCacheStore.getState().remember(book);

    try {
      // Bound disk usage across sessions; never evict a book currently open in the reader.
      const keep = new Set([book.hash, ...activeHashes]);
      const protectedPaths = new Set(
        Object.values(useOpdsReadingCacheStore.getState().books)
          .filter((entry) => keep.has(entry.hash))
          .map((entry) => entry.filePath),
      );
      const files = (await service.readDirectory(CACHE_DIRECTORY, 'Cache')).sort((a, b) =>
        b.path.localeCompare(a.path),
      );
      let bytes = 0;
      let count = 0;
      for (const entry of files) {
        const entryRelativePath = `${CACHE_DIRECTORY}/${entry.path}`;
        const entryPath = await service.resolveFilePath(entryRelativePath, 'Cache');
        bytes += entry.size;
        count++;
        if ((count > CACHE_FILES || bytes > CACHE_BYTES) && !protectedPaths.has(entryPath)) {
          await service.deleteFile(entryRelativePath, 'Cache');
          bytes -= entry.size;
          count--;
          for (const cached of Object.values(useOpdsReadingCacheStore.getState().books)) {
            if (cached.filePath === entryPath)
              useOpdsReadingCacheStore.getState().forget(cached.hash);
          }
        }
      }
    } catch (error) {
      console.warn('Failed to clean OPDS reading cache', error);
    }
    return { book };
  } catch (error) {
    await service.deleteFile(relativePath, 'Cache').catch(() => {});
    throw error;
  }
};
