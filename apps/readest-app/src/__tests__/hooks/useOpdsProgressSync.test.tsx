import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Book, BookProgress } from '@/types/book';
import { setBookProgress, useReaderProgressStore } from '@/store/readerProgressStore';

const h = vi.hoisted(() => ({
  push: vi.fn().mockResolvedValue(undefined),
  sources: vi.fn(() => [{ provider: 'kavita' }]),
  primary: true,
  toast: vi.fn(),
  book: { hash: 'hash', cacheOnly: false } as Pick<Book, 'hash' | 'cacheOnly'>,
}));
vi.mock('@/services/opdsProgressService', () => ({
  pushOpdsProgress: h.push,
  getOpdsProgressSources: h.sources,
}));
vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: { getState: () => ({ getBookData: () => ({ book: h.book }) }) },
}));
vi.mock('@/store/readerStore', () => ({
  useReaderStore: { getState: () => ({ getViewState: () => ({ isPrimary: h.primary }) }) },
}));
vi.mock('@/utils/event', () => ({ eventDispatcher: { dispatch: h.toast } }));
vi.mock('@/hooks/useTranslation', () => {
  const translate = (text: string) => text;
  return { useTranslation: () => translate };
});
import {
  flushOpdsReadingProgress,
  useOpdsProgressSync,
} from '@/app/reader/hooks/useOpdsProgressSync';

const bookKey = 'hash-view';
const progress = (location: string, fraction = 0.1) =>
  ({ location, fraction, pageinfo: { current: fraction * 100, total: 100 } }) as BookProgress;
const turn = async (location: string, fraction = 0.2) => {
  await act(async () => {
    setBookProgress(bookKey, progress(location, fraction));
  });
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  h.push.mockResolvedValue(undefined);
  h.sources.mockReturnValue([{ provider: 'kavita' }]);
  h.primary = true;
  h.book = { hash: 'hash', cacheOnly: false };
  useReaderProgressStore.setState({ progresses: { [bookKey]: progress('initial') } });
});
afterEach(async () => {
  cleanup();
  await Promise.resolve();
  vi.useRealTimers();
});

it.each([
  false,
  true,
])('coalesces actual reading changes and flushes final progress for cacheOnly=%s', async (cacheOnly) => {
  h.book.cacheOnly = cacheOnly;
  const { unmount } = renderHook(() => useOpdsProgressSync(bookKey));
  await act(async () => {
    vi.advanceTimersByTime(5000);
  });
  expect(h.push).not.toHaveBeenCalled();
  await turn('page2', 0.2);
  await turn('page3', 0.3);
  await act(async () => {
    vi.advanceTimersByTime(5000);
  });
  expect(h.push).toHaveBeenCalledTimes(1);
  expect(h.push).toHaveBeenLastCalledWith(h.book, expect.objectContaining({ fraction: 0.3 }));
  await turn('last-page', 0.4);
  await act(async () => {
    await flushOpdsReadingProgress(bookKey);
  });
  expect(h.push).toHaveBeenLastCalledWith(h.book, expect.objectContaining({ fraction: 0.4 }));
  unmount();
  await flushOpdsReadingProgress(bookKey);
  expect(h.push).toHaveBeenCalledTimes(2);
});
it('retries failed writes while keeping reading usable and avoids repeated error notifications', async () => {
  h.push.mockRejectedValue(new Error('offline'));
  const { unmount } = renderHook(() => useOpdsProgressSync(bookKey));
  await turn('page2');
  await act(async () => {
    await flushOpdsReadingProgress(bookKey);
  });
  await act(async () => {
    await flushOpdsReadingProgress(bookKey);
  });
  expect(h.toast).toHaveBeenCalledTimes(1);
  h.push.mockResolvedValue(undefined);
  await act(async () => {
    window.dispatchEvent(new Event('online'));
  });
  expect(h.push).toHaveBeenCalledTimes(3);
  unmount();
  expect(h.push).toHaveBeenCalledTimes(3);
});
it('ignores resize relocations, books without a source and secondary reader views', async () => {
  renderHook(() => useOpdsProgressSync(bookKey));
  await turn('initial', 0.2);
  await flushOpdsReadingProgress(bookKey);
  h.sources.mockReturnValue([]);
  await turn('page2');
  await flushOpdsReadingProgress(bookKey);
  h.sources.mockReturnValue([{ provider: 'kavita' }]);
  h.primary = false;
  await turn('page3');
  await flushOpdsReadingProgress(bookKey);
  expect(h.push).not.toHaveBeenCalled();
});
it('sends the captured final position on unmount before the reader store is cleared', async () => {
  const { unmount } = renderHook(() => useOpdsProgressSync(bookKey));
  await turn('last-page', 0.75);
  unmount();
  useReaderProgressStore.setState({ progresses: {} });
  expect(h.push).toHaveBeenLastCalledWith(h.book, expect.objectContaining({ fraction: 0.75 }));
});
