import { useCallback, useEffect, useRef, useState } from 'react';
import type { SavedOpdsLogin } from '@/services/opdsLoginService';
import {
  createOpdsBrowseSession,
  type OpdsPublication,
  type ParsedOpdsFeed,
} from '@/services/opdsService';

export const useOpdsBooks = (
  url: string,
  login: SavedOpdsLogin,
  visible = true,
  pageSize = 24,
  initialPage?: ParsedOpdsFeed,
) => {
  const session = useRef<ReturnType<typeof createOpdsBrowseSession> | null>(null);
  const controller = useRef<AbortController | null>(null);
  const [books, setBooks] = useState<OpdsPublication[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const loadMore = useCallback(async () => {
    const current = session.current;
    if (!current || controller.current) return;
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    setError('');
    try {
      const result = await current.next(pageSize, request.signal);
      if (request.signal.aborted || session.current !== current) return;
      setBooks((books) => [...books, ...result.books]);
      setHasMore(result.hasMore);
    } catch (error) {
      if (!request.signal.aborted)
        setError(error instanceof Error ? error.message : 'Failed to load OPDS catalog');
    } finally {
      if (controller.current === request) {
        controller.current = null;
        setLoading(false);
      }
    }
  }, [pageSize]);
  useEffect(() => {
    setBooks([]);
    setHasMore(true);
    setError('');
    setLoading(false);
    const sameServer = new URL(url).origin === new URL(login.url).origin;
    session.current = createOpdsBrowseSession(
      url,
      sameServer ? { username: login.username, password: login.password } : {},
      undefined,
      initialPage,
    );
    if (visible) void loadMore();
    return () => {
      controller.current?.abort();
      controller.current = null;
      session.current = null;
    };
  }, [url, login.url, login.username, login.password, visible, loadMore, initialPage]);
  return { books, hasMore, loading, error, loadMore };
};
