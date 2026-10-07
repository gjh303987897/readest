import { afterEach, expect, it, vi } from 'vitest';
import { saveLibraryBooks } from '@/services/libraryService';
import type { Book } from '@/types/book';
import type { FileSystem } from '@/types/system';

const book = (hash: string, updatedAt = 1, title = hash): Book => ({
  hash,
  title,
  updatedAt,
  author: '',
  format: 'EPUB',
  createdAt: 1,
});
const filesystem = () => {
  const files = new Map<string, string>();
  const readFile = vi.fn(async (name: string) => files.get(name) ?? '');
  const writeFile = vi.fn(async (name: string, _base: string, data: string) => {
    files.set(name, data);
  });
  return { files, readFile, writeFile, fs: { readFile, writeFile } as unknown as FileSystem };
};
afterEach(() => vi.restoreAllMocks());

it('serializes overlapping saves and preserves all additions and the newest edit', async () => {
  const fixture = filesystem();
  let finish!: () => void;
  fixture.writeFile.mockImplementationOnce(async (name, _base, data) => {
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    fixture.files.set(name, data);
  });
  const first = saveLibraryBooks(fixture.fs, [book('edited'), book('first')]);
  await vi.waitFor(() => expect(fixture.writeFile).toHaveBeenCalledOnce());
  const second = saveLibraryBooks(fixture.fs, [book('edited', 2, 'new title'), book('second')]);
  await Promise.resolve();
  expect(fixture.writeFile).toHaveBeenCalledOnce();
  finish();
  await Promise.all([first, second]);
  const saved: Book[] = JSON.parse(fixture.files.get('library.json')!);
  expect(saved.map((book) => book.hash)).toEqual(['edited', 'first', 'second']);
  expect(saved[0]!.title).toBe('new title');
});

it('does not overwrite a newer on-disk row with a later stale snapshot', async () => {
  const fixture = filesystem();
  await saveLibraryBooks(fixture.fs, [book('edited', 3, 'new title')]);
  await saveLibraryBooks(fixture.fs, [book('edited', 1, 'old title')]);
  expect(JSON.parse(fixture.files.get('library.json')!)[0].title).toBe('new title');
});

it('allows a later save to proceed after an earlier write failed', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const fixture = filesystem();
  fixture.writeFile.mockRejectedValueOnce(new Error('disk failure'));
  const failed = expect(saveLibraryBooks(fixture.fs, [book('failed')])).rejects.toThrow(
    'disk failure',
  );
  const successful = saveLibraryBooks(fixture.fs, [book('saved')]);
  await failed;
  await successful;
  expect(JSON.parse(fixture.files.get('library.json')!).map((book: Book) => book.hash)).toEqual([
    'saved',
  ]);
});
