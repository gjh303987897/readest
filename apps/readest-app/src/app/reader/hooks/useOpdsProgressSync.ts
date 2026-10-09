import { useEffect, useMemo } from 'react';
import { useBookDataStore } from '@/store/bookDataStore';
import { useReaderStore } from '@/store/readerStore';
import { getBookProgress, useBookProgress } from '@/store/readerProgressStore';
import { getOpdsProgressSources, pushOpdsProgress } from '@/services/opdsProgressService';
import { eventDispatcher } from '@/utils/event';
import { useTranslation } from '@/hooks/useTranslation';
import type { Book, BookProgress } from '@/types/book';

const flushers = new Map<string, () => Promise<void>>();
export const flushOpdsReadingProgress = (bookKey: string) =>
  flushers.get(bookKey)?.() ?? Promise.resolve();

export const useOpdsProgressSync = (bookKey: string) => {
  const _ = useTranslation();
  const progress = useBookProgress(bookKey);
  const session = useMemo(() => {
    let initial = true;
    let lastLocation: string | undefined;
    let dirty: { book: Book; progress: Pick<BookProgress, 'fraction' | 'pageinfo'> } | undefined;
    let sending: Promise<void> | undefined;
    let warned = false;
    const flush = (): Promise<void> => {
      if (sending) return sending.then(flush);
      const snapshot = dirty;
      if (!snapshot || !navigator.onLine) return Promise.resolve();
      sending = pushOpdsProgress(snapshot.book, snapshot.progress)
        .then(() => {
          if (dirty === snapshot) dirty = undefined;
          warned = false;
        })
        .catch(() => {
          if (!warned) {
            warned = true;
            eventDispatcher.dispatch('toast', {
              type: 'error',
              message: _(
                'Could not send reading progress to the OPDS service. It will be retried while this book is open.',
              ),
              timeout: 5000,
            });
          }
        })
        .finally(() => {
          sending = undefined;
        });
      return sending;
    };
    const update = (progress: BookProgress | null) => {
      if (!progress?.location) return;
      // Opening/resizing the book must not reset a server's existing progress.
      if (initial) {
        initial = false;
        lastLocation = progress.location;
        return;
      }
      if (lastLocation === progress.location) return;
      lastLocation = progress.location;
      const { book } = useBookDataStore.getState().getBookData(bookKey) ?? {};
      if (
        !book ||
        !useReaderStore.getState().getViewState(bookKey)?.isPrimary ||
        !getOpdsProgressSources(book).length
      )
        return;
      dirty = {
        book,
        progress: { fraction: progress.fraction, pageinfo: { ...progress.pageinfo } },
      };
    };
    return { flush, update };
  }, [bookKey, _]);

  useEffect(() => {
    session.update(progress);
  }, [progress, session]);
  useEffect(() => {
    const flushLatest = () => {
      session.update(getBookProgress(bookKey));
      return session.flush();
    };
    flushers.set(bookKey, flushLatest);
    const timer = setInterval(() => {
      void session.flush();
    }, 5000);
    const online = () => {
      void session.flush();
    };
    const hidden = () => {
      if (document.visibilityState === 'hidden') void session.flush();
    };
    window.addEventListener('online', online);
    window.addEventListener('pagehide', online);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', online);
      window.removeEventListener('pagehide', online);
      document.removeEventListener('visibilitychange', hidden);
      if (flushers.get(bookKey) === flushLatest) flushers.delete(bookKey);
      void flushLatest();
    };
  }, [bookKey, session]);
};
