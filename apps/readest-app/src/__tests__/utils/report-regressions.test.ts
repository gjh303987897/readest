import { afterEach, expect, it, vi } from 'vitest';
import { getFilename } from '@/utils/path';
import { localizeNumber } from '@/utils/number';
import { getLanguageInfo } from '@/utils/lang';
import { validateAndNormalizeDate } from '@/utils/validation';
import { fetchWithAuth } from '@/utils/fetch';
import { createProgressHandler } from '@/libs/storage';
import { RemoteFile } from '@/utils/file';

vi.mock('@/utils/access', () => ({
  getAccessToken: async () => 'test',
  getUserID: async () => 'user',
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it.each([
  ['file:///books/50% off.epub', '50% off.epub'],
  ['https://books.example/test%2.epub', 'test%2.epub'],
  ['file:///books/hello%20world.epub', 'hello world.epub'],
  ['D:\\books\\50% off.epub', '50% off.epub'],
])('extracts a filename safely from %s', (path, filename) => {
  expect(getFilename(path)).toBe(filename);
});

it.each([
  [0, '零'],
  [10, '一十'],
  [10000, '一万'],
  [10001, '一万零一'],
  [100000000, '一亿'],
  [200005000, '二亿零五千'],
  [100010001, '一亿零一万零一'],
  [1000000000000, '一万亿'],
])('formats Chinese group boundaries for %s', (number, text) => {
  expect(localizeNumber(number as number, 'zh-CN')).toBe(text);
});
it('preserves index, traditional and non-Chinese number forms', () => {
  expect(localizeNumber(100000001, 'zh-TW', true)).toBe('壹億〇壹');
  expect(localizeNumber(2, 'zh-CN')).toBe('两');
  expect(localizeNumber(123456789, 'en')).toBe('123456789');
  expect(localizeNumber(1.5, 'zh-CN')).toBe('1.5');
});
it('classifies Korean as CJK and Kanuri as non-CJK', () => {
  expect(getLanguageInfo('ko-KR').isCJK).toBe(true);
  expect(getLanguageInfo('kr').isCJK).toBe(false);
});
it.each([
  '2023-02-29',
  '2023-02-31',
  '2024-04-31',
])('rejects impossible calendar date %s', (date) => {
  expect(validateAndNormalizeDate(date).isValid).toBe(false);
});
it.each(['2024-02-29', '2023-02-28', '2024', '2024-02'])('accepts valid date %s', (date) => {
  expect(validateAndNormalizeDate(date).isValid).toBe(true);
});
it.each([
  '<html>gateway</html>',
  '',
])('preserves HTTP status for a non-JSON error', async (body) => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(body, { status: 502, statusText: 'Bad Gateway' })),
  );
  await expect(fetchWithAuth('/test', {})).rejects.toThrow('502 Bad Gateway');
});
it('emits finite indeterminate progress for unknown or invalid totals', () => {
  const callback = vi.fn();
  const handler = createProgressHandler(1, { count: 0 }, callback);
  for (const total of [0, -1, NaN, Infinity]) {
    handler({ progress: 1, total, transferSpeed: 0 });
    expect(callback).toHaveBeenLastCalledWith({ progress: 0, total: 0, transferSpeed: 0 });
  }
  createProgressHandler(2, { count: 1 }, callback)({ progress: 5, total: 10, transferSpeed: 1 });
  expect(callback).toHaveBeenLastCalledWith({ progress: 75, total: 100, transferSpeed: 1 });
});
it.each([
  null,
  '',
  'abc',
  '-1',
  '1.5',
  '9007199254740992',
])('rejects invalid remote size %s', async (length) => {
  const headers: Record<string, string> = length === null ? {} : { 'Content-Length': length };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { headers })));
  await expect(new RemoteFile('https://test.invalid/book')._open_with_head()).rejects.toThrow(
    'file size',
  );
});
it('accepts zero-byte HEAD files and validated range sizes', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { headers: { 'Content-Length': '0' } }))
    .mockResolvedValueOnce(
      new Response(null, { status: 206, headers: { 'Content-Range': 'bytes 0-1023/2048' } }),
    );
  vi.stubGlobal('fetch', fetcher);
  expect((await new RemoteFile('https://test.invalid/book')._open_with_head()).size).toBe(0);
  expect((await new RemoteFile('https://test.invalid/book')._open_with_range()).size).toBe(2048);
});
it('rejects missing query and range sizes instead of inventing an empty file', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null)));
  await expect(new RemoteFile('https://test.invalid/book')._open_with_range()).rejects.toThrow(
    'Content-Range',
  );
  await expect(RemoteFile.fromNativePath('/test/book')._open_with_query()).rejects.toThrow(
    'file size',
  );
});
