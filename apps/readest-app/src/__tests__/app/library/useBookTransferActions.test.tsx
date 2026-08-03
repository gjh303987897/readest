import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

import type { Book } from '@/types/book';
import type { EnvConfigType } from '@/services/environment';
import type { AppService } from '@/types/system';

const authState = vi.hoisted(() => ({ user: null as { id: string } | null }));
const queueUpload = vi.hoisted(() => vi.fn(() => 'upload-1'));
const queueDownload = vi.hoisted(() => vi.fn(() => 'download-1'));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: authState.user }),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation:
    () =>
    (text: string, params?: Record<string, string>): string =>
      params ? text.replace('{{title}}', params['title'] ?? '') : text,
}));

vi.mock('@/services/transferManager', () => ({
  transferManager: { queueUpload, queueDownload },
}));

const { useBookTransferActions } = await import('@/app/library/hooks/useBookTransferActions');
const { eventDispatcher } = await import('@/utils/event');

const envConfig: EnvConfigType = { getAppService: async () => ({}) as AppService };
const book: Book = {
  hash: 'book-1',
  format: 'EPUB',
  title: 'Title',
  author: 'Author',
  createdAt: 1000,
  updatedAt: 1000,
};

const setup = (appService: AppService | null = null) => {
  const updateBook = vi.fn(async () => {});
  const updateProgress = vi.fn();
  const result = renderHook(() =>
    useBookTransferActions(envConfig, appService, updateBook, updateProgress),
  ).result;
  return { result, updateBook, updateProgress };
};

beforeEach(() => {
  vi.clearAllMocks();
  authState.user = null;
});

describe('account book backup and download', () => {
  it('requires a signed-in account', async () => {
    const dispatch = vi.spyOn(eventDispatcher, 'dispatch');
    const { result } = setup();

    await expect(result.current.handleBookUpload(book)).resolves.toBe(false);
    expect(queueUpload).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith('toast', {
      type: 'info',
      message: 'Sign in to back up books',
    });
  });

  it('queues uploads and downloads for signed-in users', async () => {
    authState.user = { id: 'user-1' };
    const { result } = setup();

    await expect(result.current.handleBookUpload(book)).resolves.toBe(true);
    await expect(result.current.handleBookDownload(book, { queued: true })).resolves.toBe(true);
    expect(queueUpload).toHaveBeenCalledWith(book, 1);
    expect(queueDownload).toHaveBeenCalledWith(book, 1);
  });

  it('supports immediate authenticated downloads', async () => {
    authState.user = { id: 'user-1' };
    const downloadBook = vi.fn(async () => {});
    const appService = { downloadBook } as unknown as AppService;
    const { result, updateBook } = setup(appService);

    await expect(result.current.handleBookDownload(book)).resolves.toBe(true);
    expect(downloadBook).toHaveBeenCalled();
    expect(updateBook).toHaveBeenCalledWith(envConfig, book);
  });
});
