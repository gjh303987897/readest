import type { ImgHTMLAttributes } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Book } from '@/types/book';
vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (key: string) => key }));
vi.mock('@/store/themeStore', () => ({ useThemeStore: () => ({ safeAreaInsets: {} }) }));
vi.mock('next/image', () => ({
  default: ({ fill, alt, ...props }: ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean }) => {
    void fill;
    return <img alt={alt} {...props} />;
  },
}));
import { Toast } from '@/components/Toast';
import BookCover from '@/components/BookCover';
import { eventDispatcher } from '@/utils/event';
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
});
it('resets an unspecified toast duration to five seconds', async () => {
  const { container } = render(<Toast />);
  await act(async () => eventDispatcher.dispatch('toast', { message: 'custom', timeout: 2000 }));
  await act(async () => vi.advanceTimersByTimeAsync(2300));
  await act(async () => eventDispatcher.dispatch('toast', { message: 'default' }));
  await act(async () => vi.advanceTimersByTimeAsync(2300));
  expect(container.textContent).toContain('default');
  await act(async () => vi.advanceTimersByTimeAsync(3000));
  expect(container.textContent).not.toContain('default');
});
it('prevents an old dismiss animation from clearing a replacement toast', async () => {
  const { container } = render(<Toast />);
  await act(async () => eventDispatcher.dispatch('toast', { message: 'old', timeout: 1000 }));
  await act(async () => vi.advanceTimersByTimeAsync(1100));
  await act(async () => eventDispatcher.dispatch('toast', { message: 'new' }));
  await act(async () => vi.advanceTimersByTimeAsync(300));
  expect(container.textContent).toContain('new');
});
it('resets dismissal for a repeated identical message', async () => {
  const { container } = render(<Toast />);
  await act(async () => eventDispatcher.dispatch('toast', { message: 'same', timeout: 1000 }));
  await act(async () => vi.advanceTimersByTimeAsync(800));
  await act(async () => eventDispatcher.dispatch('toast', { message: 'same', timeout: 1000 }));
  await act(async () => vi.advanceTimersByTimeAsync(600));
  expect(container.textContent).toContain('same');
});
it('keeps callbacks for replaced toasts but cancels them when Toast unmounts', async () => {
  const first = vi.fn(),
    second = vi.fn(),
    { unmount } = render(<Toast />);
  await act(async () =>
    eventDispatcher.dispatch('toast', { message: 'first', callback: first, timeout: 1000 }),
  );
  await act(async () =>
    eventDispatcher.dispatch('toast', { message: 'second', callback: second, timeout: 2000 }),
  );
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(first).toHaveBeenCalledTimes(1);
  unmount();
  await act(async () => vi.advanceTimersByTimeAsync(5000));
  expect(second).not.toHaveBeenCalled();
});
it('updates cover text and handlers even when updatedAt is unchanged', () => {
  const old = vi.fn(),
    fresh = vi.fn(),
    ratio = vi.fn();
  const book = {
    hash: 'cover',
    title: 'Old title',
    author: 'Old author',
    coverImageUrl: '/cover.png',
    updatedAt: 1,
  } as Book;
  const { container, rerender } = render(<BookCover book={book} onImageError={old} />);
  rerender(
    <BookCover
      book={{ ...book, title: 'New title', author: 'New author' }}
      onImageError={fresh}
      onAspectRatioChange={ratio}
    />,
  );
  expect(container.textContent).toContain('New title');
  expect(container.textContent).toContain('New author');
  const image = container.querySelector('img')!;
  fireEvent.error(image);
  expect(old).not.toHaveBeenCalled();
  expect(fresh).toHaveBeenCalledTimes(1);
  Object.defineProperties(image, { naturalWidth: { value: 100 }, naturalHeight: { value: 200 } });
  fireEvent.load(image);
  expect(ratio).toHaveBeenCalledWith(0.5);
});
