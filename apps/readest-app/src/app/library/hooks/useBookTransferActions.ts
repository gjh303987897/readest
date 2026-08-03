import { useCallback } from 'react';
import type { Book } from '@/types/book';
import type { EnvConfigType } from '@/services/environment';
import type { AppService } from '@/types/system';
import type { ProgressPayload } from '@/utils/transfer';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuth } from '@/context/AuthContext';
import { eventDispatcher } from '@/utils/event';
import { transferManager } from '@/services/transferManager';

interface BookDownloadOptions {
  redownload?: boolean;
  queued?: boolean;
}

export const useBookTransferActions = (
  envConfig: EnvConfigType,
  appService: AppService | null,
  updateBook: (envConfig: EnvConfigType, book: Book) => Promise<void>,
  updateBookTransferProgress: (bookHash: string, progress: ProgressPayload) => void,
) => {
  const _ = useTranslation();
  const { user } = useAuth();

  const handleBookUpload = useCallback(
    async (book: Book, _syncBooks = true) => {
      if (!user) {
        eventDispatcher.dispatch('toast', { type: 'info', message: _('Sign in to back up books') });
        return false;
      }
      const queued = Boolean(transferManager.queueUpload(book, 1));
      eventDispatcher.dispatch('toast', {
        type: queued ? 'info' : 'error',
        timeout: 2000,
        message: queued
          ? _('Upload queued: {{title}}', { title: book.title })
          : _('Failed to upload book: {{title}}', { title: book.title }),
      });
      return queued;
    },
    [_, user],
  );

  const handleBookDownload = useCallback(
    async (book: Book, options: BookDownloadOptions = {}) => {
      if (!user) {
        eventDispatcher.dispatch('toast', {
          type: 'info',
          message: _('Sign in to download books'),
        });
        return false;
      }
      const { redownload = false, queued = false } = options;
      if (!redownload && queued) {
        const transferId = transferManager.queueDownload(book, 1);
        if (transferId) {
          eventDispatcher.dispatch('toast', {
            type: 'info',
            timeout: 2000,
            message: _('Download queued: {{title}}', { title: book.title }),
          });
          return true;
        }
        return false;
      }

      try {
        await appService?.downloadBook(book, false, redownload, (progress) => {
          updateBookTransferProgress(book.hash, progress);
        });
        await updateBook(envConfig, book);
        eventDispatcher.dispatch('toast', {
          type: 'info',
          timeout: 2000,
          message: _('Book downloaded: {{title}}', { title: book.title }),
        });
        return true;
      } catch {
        eventDispatcher.dispatch('toast', {
          type: 'error',
          message: _('Failed to download book: {{title}}', { title: book.title }),
        });
        return false;
      }
    },
    [_, appService, envConfig, updateBook, updateBookTransferProgress, user],
  );

  return { handleBookUpload, handleBookDownload };
};
