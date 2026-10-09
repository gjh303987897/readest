import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareOpdsReadingBook } from '@/services/opdsReadingService';
import { useOpdsReadingCacheStore } from '@/store/opdsReadingCacheStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useBookDataStore } from '@/store/bookDataStore';
import type { Book } from '@/types/book';
import type { AppService } from '@/types/system';
const makeBook = (hash = 'hash'): Book => ({
  hash,
  title: 'Book',
  author: 'Author',
  format: 'EPUB',
  createdAt: 1,
  updatedAt: 1,
  downloadedAt: 1,
  deletedAt: null,
});
const makeService = () => ({
  createDir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  deleteFile: vi.fn().mockResolvedValue(undefined),
  resolveFilePath: vi.fn(async (path: string) => '/cache/' + path),
  readDirectory: vi.fn().mockResolvedValue([]),
  importBook: vi.fn(
    async (path: string | File, _books: Book[]): Promise<Book> => ({
      ...makeBook(),
      filePath: typeof path === 'string' ? path : undefined,
    }),
  ),
});
const file = () => ({ name: 'book.epub', arrayBuffer: async () => new ArrayBuffer(8) }) as File;
beforeEach(() => {
  useOpdsReadingCacheStore.setState({ books: {} });
  useBookDataStore.setState({ booksData: {} });
  useLibraryStore.getState().setLibrary([]);
});
describe('OPDS reading storage', () => {
  it('downloads only into Cache and registers a transient reader entry outside the library', async () => {
    const service = makeService();
    const { book } = await prepareOpdsReadingBook(
      service as unknown as AppService,
      file(),
      false,
      [],
    );
    expect(service.writeFile.mock.calls[0]?.[1]).toBe('Cache');
    expect(service.importBook).toHaveBeenCalledWith(
      expect.stringContaining('/cache/opds-reading/'),
      [],
      { transient: true, saveBook: false, saveCover: false },
    );
    expect(book.cacheOnly).toBe(true);
    expect(useLibraryStore.getState().library).toEqual([]);
    expect(useLibraryStore.getState().getBookByHash('hash')).toBe(book);
  });
  it('imports a cloned library only when the user explicitly chooses to save', async () => {
    const service = makeService();
    const local = makeBook();
    useOpdsReadingCacheStore.getState().remember({ ...local, cacheOnly: true });
    service.importBook.mockImplementation(async (_file, books) => {
      books[0]!.title = 'Updated';
      return books[0]!;
    });
    const { book } = await prepareOpdsReadingBook(service as unknown as AppService, file(), true, [
      local,
    ]);
    expect(book.title).toBe('Updated');
    expect(local.title).toBe('Book');
    expect(service.writeFile).not.toHaveBeenCalled();
    expect(useOpdsReadingCacheStore.getState().books['hash']).toBeUndefined();
  });
  it('evicts old cache files by quota while protecting open books', async () => {
    const service = makeService();
    const active = {
      ...makeBook('active'),
      filePath: '/cache/opds-reading/000-active.epub',
      cacheOnly: true,
    };
    useOpdsReadingCacheStore.getState().remember(active);
    service.readDirectory.mockResolvedValue([
      ...Array.from({ length: 11 }, (_, i) => ({
        path: '100-' + String(i).padStart(2, '0') + '.epub',
        size: 8,
      })),
      { path: '000-active.epub', size: 8 },
    ]);
    await prepareOpdsReadingBook(service as unknown as AppService, file(), false, [], ['active']);
    expect(service.deleteFile).toHaveBeenCalledWith('opds-reading/100-00.epub', 'Cache');
    expect(service.deleteFile).not.toHaveBeenCalledWith('opds-reading/000-active.epub', 'Cache');
  });
  it('keeps a successfully imported book readable when maintenance fails', async () => {
    const service = makeService();
    service.readDirectory.mockRejectedValue(new Error('cleanup unavailable'));
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { book } = await prepareOpdsReadingBook(
      service as unknown as AppService,
      file(),
      false,
      [],
    );
    expect(book.cacheOnly).toBe(true);
    expect(service.deleteFile).not.toHaveBeenCalled();
    log.mockRestore();
  });
  it('deletes a failed temporary import without registering it', async () => {
    const service = makeService();
    service.importBook.mockRejectedValue(new Error('invalid book'));
    await expect(
      prepareOpdsReadingBook(service as unknown as AppService, file(), false, []),
    ).rejects.toThrow('invalid book');
    expect(service.deleteFile).toHaveBeenCalledWith(
      expect.stringContaining('opds-reading/'),
      'Cache',
    );
    expect(useOpdsReadingCacheStore.getState().books).toEqual({});
  });
  it('keeps progress changes in memory and leaves a local book with the same hash untouched', async () => {
    const local = makeBook();
    useLibraryStore.getState().setLibrary([local]);
    const cached = { ...local, cacheOnly: true };
    useBookDataStore.setState({
      booksData: {
        hash: {
          id: 'hash',
          book: cached,
          file: null,
          bookDoc: null,
          isFixedLayout: false,
          config: { updatedAt: 1 },
        },
      },
    });
    const getAppService = vi.fn();
    await useBookDataStore
      .getState()
      .saveConfig(
        { getAppService },
        'hash-view0',
        { updatedAt: 2, progress: [3, 10] },
        {} as never,
      );
    expect(getAppService).not.toHaveBeenCalled();
    expect(useBookDataStore.getState().getConfig('hash-view0')?.progress).toEqual([3, 10]);
    expect(useLibraryStore.getState().library[0]).toBe(local);
    expect(local.progress).toBeUndefined();
  });
});

it.each([0, 60000])('retires replaced hashes even with a %i ms clock offset', async (offset) => {
  const service = makeService();
  const local = { ...makeBook('oldhash'), updatedAt: Date.now() + offset };
  useLibraryStore.getState().setLibrary([local]);
  service.importBook.mockImplementation(async (_file, books) => {
    books[0]!.hash = 'newhash';
    return books[0]!;
  });
  const result = await prepareOpdsReadingBook(service as unknown as AppService, file(), true, [
    local,
  ]);
  expect(result.library?.find((b) => b.hash === 'oldhash')?.deletedAt).toBeGreaterThan(0);
  expect(result.library?.find((b) => b.hash === 'oldhash')?.downloadedAt).toBeNull();
  expect(result.library?.find((b) => b.hash === 'newhash')).toBe(result.book);
  expect(local.deletedAt).toBeNull();
  await useLibraryStore
    .getState()
    .updateBooks(
      { getAppService: async () => ({ saveLibraryBooks: vi.fn() }) } as never,
      result.library!,
    );
  expect(
    useLibraryStore
      .getState()
      .getVisibleLibrary()
      .map((book) => book.hash),
  ).toEqual(['newhash']);
});

it('leaves the original library unchanged when a permanent import fails after rekeying its clone', async () => {
  const service = makeService();
  const local = makeBook('oldhash');
  useLibraryStore.getState().setLibrary([local]);
  service.importBook.mockImplementation(async (_file, books) => {
    books[0]!.hash = 'newhash';
    throw new Error('import failed');
  });
  await expect(
    prepareOpdsReadingBook(service as unknown as AppService, file(), true, [local]),
  ).rejects.toThrow('import failed');
  expect(useLibraryStore.getState().getVisibleLibrary()).toEqual([local]);
  expect(local.hash).toBe('oldhash');
  expect(local.deletedAt).toBeNull();
});
