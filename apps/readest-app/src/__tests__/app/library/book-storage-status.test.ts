import { describe, expect, it } from 'vitest';

import type { Book } from '@/types/book';
import { getBookStorageStatus } from '@/app/library/utils/bookStorageStatus';

const book = (fields: Partial<Book>): Book => ({
  hash: 'book-1',
  format: 'EPUB',
  title: 'Book',
  author: 'Author',
  createdAt: 1,
  updatedAt: 1,
  ...fields,
});

describe('book storage status', () => {
  it('prioritizes an active cloud download over stored timestamps', () => {
    expect(getBookStorageStatus(book({ uploadedAt: 1 }), true)).toBe('syncing');
  });

  it('reports any available device copy as local', () => {
    expect(getBookStorageStatus(book({ downloadedAt: 1 }), false)).toBe('local');
    expect(getBookStorageStatus(book({ downloadedAt: 1, uploadedAt: 1 }), false)).toBe('local');
  });

  it('reports a remote-only copy as cloud', () => {
    expect(getBookStorageStatus(book({ downloadedAt: null, uploadedAt: 1 }), false)).toBe('cloud');
  });
});
