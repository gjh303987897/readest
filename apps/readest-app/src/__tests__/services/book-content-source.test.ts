import { describe, expect, test, vi } from 'vitest';
import { getLocalBookFilename } from '@/utils/book';
import { resolveBookContentSource } from '@/services/bookContent';
import { getBookFileSize } from '@/services/bookService';
import type { Book } from '@/types/book';
import type { BaseDir, FileSystem } from '@/types/system';

function makeBook(overrides: Partial<Book> = {}): Book {
  return {
    hash: 'bookhash',
    format: 'EPUB',
    title: 'sample',
    author: 'Author',
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    downloadedAt: 1,
    ...overrides,
  };
}

function makeFs(options: {
  existing?: Array<[string, BaseDir]>;
  files?: Record<string, File>;
}): FileSystem {
  const existing = new Set((options.existing ?? []).map(([path, base]) => `${base}:${path}`));
  const files = options.files ?? {};
  return {
    resolvePath: vi.fn(),
    getURL: vi.fn(),
    getBlobURL: vi.fn(),
    openFile: vi.fn(async (path: string, base: BaseDir) => {
      const file = files[`${base}:${path}`];
      if (!file) throw new Error(`missing ${base}:${path}`);
      return file;
    }),
    copyFile: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    removeFile: vi.fn(),
    readDir: vi.fn().mockResolvedValue([]),
    createDir: vi.fn(),
    removeDir: vi.fn(),
    exists: vi.fn(async (path: string, base: BaseDir) => existing.has(`${base}:${path}`)),
    stats: vi.fn(),
    getPrefix: vi.fn(),
  };
}

describe('book content source resolution', () => {
  test('getBookFileSize reads external in-place sources when no managed copy exists', async () => {
    const book = makeBook({ filePath: '/Users/me/Library/sample.epub' });
    const fs = makeFs({
      existing: [[book.filePath!, 'None']],
      files: {
        'None:/Users/me/Library/sample.epub': new File(['external content'], 'sample.epub'),
      },
    });

    await expect(getBookFileSize(fs, book)).resolves.toBe('external content'.length);
    expect(fs.openFile).toHaveBeenCalledWith('/Users/me/Library/sample.epub', 'None');
  });
});

test('cache-only books always read their cache path even if a local copy shares their hash', async () => {
  const book = makeBook({ cacheOnly: true, filePath: '/cache/book.epub' });
  const fs = makeFs({
    existing: [
      [book.filePath!, 'None'],
      [getLocalBookFilename(book), 'Books'],
    ],
  });
  expect(await resolveBookContentSource(fs, book)).toEqual({
    kind: 'external',
    path: '/cache/book.epub',
    base: 'None',
  });
  expect(fs.exists).not.toHaveBeenCalledWith(getLocalBookFilename(book), 'Books');
});
test('an expired cache never falls back to a local book with the same hash', async () => {
  const book = makeBook({ cacheOnly: true, filePath: '/cache/missing.epub' });
  const fs = makeFs({ existing: [[getLocalBookFilename(book), 'Books']] });
  expect(await resolveBookContentSource(fs, book)).toEqual({ kind: 'missing' });
});
