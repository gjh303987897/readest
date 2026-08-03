import { describe, it, expect } from 'vitest';
import { isSafeObjectKeyName } from '@/utils/object';

// GHSA-mfmj-2frf-vhgw: the storage object key is built as `${user.id}/${fileName}`
// from a client-controlled `fileName`. The R2 signer interpolates it into
// `new Request(url)`, whose URL parser collapses `../` before signing — so a
// crafted name escapes the caller's `${user.id}/` prefix into another tenant's
// namespace. Only managed book files and their covers may be stored remotely.
describe('isSafeObjectKeyName', () => {
  it('accepts supported books and covers under a full book hash', () => {
    const hash = '0123456789abcdef0123456789abcdef';
    expect(isSafeObjectKeyName(`Readest/Books/${hash}/My Book (2024).epub`, hash)).toBe(true);
    expect(isSafeObjectKeyName(`Readest/Books/${hash}/cover.png`, hash)).toBe(true);
    expect(isSafeObjectKeyName(`Readest/Books/${hash}/A&B.pdf`, hash)).toBe(true);
    for (const extension of ['mobi', 'azw', 'azw3', 'fb2', 'fbz', 'cbz', 'txt', 'md']) {
      expect(isSafeObjectKeyName(`Readest/Books/${hash}/book.${extension}`, hash)).toBe(true);
    }
  });

  it('rejects non-book objects, unsupported formats, and hash mismatches', () => {
    const hash = '0123456789abcdef0123456789abcdef';
    expect(isSafeObjectKeyName('Readest/Replicas/dict/id-1/data.bin')).toBe(false);
    expect(isSafeObjectKeyName('cover.png')).toBe(false);
    expect(isSafeObjectKeyName(`Readest/Books/${hash}/book.exe`, hash)).toBe(false);
    expect(isSafeObjectKeyName(`Readest/Books/${hash}/book.epub`, 'f'.repeat(32))).toBe(false);
  });

  it('rejects parent-directory traversal segments', () => {
    expect(isSafeObjectKeyName('../victim/Readest/Book/h/book.epub')).toBe(false);
    expect(isSafeObjectKeyName('Readest/../../victim/book.epub')).toBe(false);
    expect(isSafeObjectKeyName('..')).toBe(false);
    expect(isSafeObjectKeyName('a/../b')).toBe(false);
  });

  it('rejects percent-encoded traversal', () => {
    expect(isSafeObjectKeyName('%2e%2e/victim/book.epub')).toBe(false);
    expect(isSafeObjectKeyName('a/%2e%2e/b')).toBe(false);
  });

  it('rejects absolute paths, backslashes, NUL and empty segments', () => {
    expect(isSafeObjectKeyName('/etc/passwd')).toBe(false);
    expect(isSafeObjectKeyName('a\\b')).toBe(false);
    expect(isSafeObjectKeyName('a\0b')).toBe(false);
    expect(isSafeObjectKeyName('a//b')).toBe(false);
    expect(isSafeObjectKeyName('a/')).toBe(false);
  });

  it('rejects empty / non-string input', () => {
    expect(isSafeObjectKeyName('')).toBe(false);
    // @ts-expect-error runtime guard for untrusted req.body values
    expect(isSafeObjectKeyName(undefined)).toBe(false);
    // @ts-expect-error runtime guard for untrusted req.body values
    expect(isSafeObjectKeyName(123)).toBe(false);
  });
});
