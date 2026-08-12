import { describe, expect, it } from 'vitest';

import {
  createPrivacyCredential,
  filterAccessibleBooks,
  verifyPrivacyPin,
} from '@/services/privacyService';
import type { Book } from '@/types/book';

const makeBook = (hash: string): Book => ({
  hash,
  format: 'EPUB',
  title: hash,
  author: 'Author',
  createdAt: 1,
  updatedAt: 1,
});

describe('privacyService', () => {
  it('stores a salted verifier instead of the PIN and verifies it', async () => {
    const credential = await createPrivacyCredential('1234');

    expect(JSON.stringify(credential)).not.toContain('1234');
    await expect(verifyPrivacyPin('1234', credential)).resolves.toBe(true);
    await expect(verifyPrivacyPin('4321', credential)).resolves.toBe(false);
  });

  it('rejects corrupted credentials without throwing', async () => {
    const credential = await createPrivacyCredential('1234');

    await expect(verifyPrivacyPin('1234', { ...credential, verifier: 'not-base64' })).resolves.toBe(
      false,
    );
  });

  it('filters hidden books while privacy mode is locked', () => {
    const books = [makeBook('public'), makeBook('private')];

    expect(filterAccessibleBooks(books, ['private'], false).map((book) => book.hash)).toEqual([
      'public',
    ]);
    expect(filterAccessibleBooks(books, ['private'], true).map((book) => book.hash)).toEqual([
      'public',
      'private',
    ]);
  });
});
