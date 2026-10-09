'use client';

import { useEffect, useState } from 'react';
import { BookOpen, ChevronLeft, Folder, LoaderCircle, Server } from 'lucide-react';
import { useOpdsBrowserStore } from '@/store/opdsBrowserStore';
import {
  getOpdsRootUrl,
  loadOpdsFeedPage,
  type OpdsPublication,
  type ParsedOpdsFeed,
  type OpdsNavigationLink,
} from '@/services/opdsService';
import { useTranslation } from '@/hooks/useTranslation';
import OpdsBookDetails from './OpdsBookDetails';
import OpdsBookGrid from './OpdsBookGrid';
import OpdsShelf from './OpdsShelf';

export default function OpdsBrowser({
  onChooseService,
  onRead,
}: {
  onChooseService: () => void;
  onRead: (book: OpdsPublication, save: boolean) => Promise<void>;
}) {
  const _ = useTranslation();
  const { login, path, navigate, leave } = useOpdsBrowserStore();
  const [feed, setFeed] = useState<ParsedOpdsFeed | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<OpdsPublication | null>(null);
  let root = '';
  let rootError = '';
  try {
    root = login?.provider ? getOpdsRootUrl(login.url, login.provider) : '';
  } catch (error) {
    rootError = error instanceof Error ? error.message : 'Failed to load OPDS catalog';
  }
  const url = path.at(-1)?.url ?? root;
  useEffect(() => {
    if (!login || !url) {
      setSelected(null);
      setLoading(false);
      setError(rootError);
      return;
    }
    const controller = new AbortController();
    setFeed(null);
    setLoading(true);
    setError('');
    setSelected(null);
    void loadOpdsFeedPage(
      url,
      { username: login.username, password: login.password },
      controller.signal,
    )
      .then((feed) => {
        if (!controller.signal.aborted) setFeed(feed);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(error instanceof Error ? error.message : 'Failed to load OPDS catalog');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [url, login?.username, login?.password, rootError, attempt]);
  if (!login) return null;
  const browse = (link: OpdsNavigationLink) => {
    if (new URL(link.url).origin !== new URL(root).origin) {
      setError('Catalog link belongs to a different server');
      return;
    }
    navigate([...path, link]);
  };
  if (selected)
    return (
      <OpdsBookDetails
        key={selected.downloadUrl}
        book={selected}
        login={login}
        onBack={() => setSelected(null)}
        onRead={onRead}
      />
    );
  return (
    <section className='view-switch-enter flex min-h-0 flex-1 flex-col'>
      <div className='border-base-200 flex shrink-0 items-center gap-3 border-b px-4 py-3 sm:px-6'>
        <button
          type='button'
          onClick={() => (path.length ? navigate(path.slice(0, -1)) : leave())}
          className='btn btn-ghost btn-circle h-8 min-h-8 w-8 shrink-0'
          title={path.length ? _('Back') : _('Back to local library')}
          aria-label={path.length ? _('Back') : _('Back to local library')}
        >
          <ChevronLeft aria-hidden='true' className='h-4 w-4 rtl:rotate-180' />
        </button>
        <div className='min-w-0 flex-1'>
          <h2 className='truncate text-base font-semibold'>{path.at(-1)?.title ?? login.title}</h2>
          <p className='text-base-content/50 mt-0.5 truncate text-xs'>
            {path.length ? login.title : _('Browse your online library')}
          </p>
        </div>
        <button
          type='button'
          onClick={onChooseService}
          aria-label={_('Change service')}
          className='btn btn-ghost btn-sm gap-2'
        >
          <Server aria-hidden='true' className='h-4 w-4' />
          <span className='hidden sm:inline'>{_('Change service')}</span>
        </button>
      </div>
      {loading || error || rootError ? (
        <div className='flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 text-center'>
          {loading ? (
            <LoaderCircle
              aria-label={_('Loading books…')}
              className='h-7 w-7 animate-spin opacity-50'
            />
          ) : (
            <>
              <p role='alert' className='text-error text-sm'>
                {_(error || rootError)}
              </p>
              <button
                type='button'
                className='btn btn-contrast'
                onClick={() => setAttempt((attempt) => attempt + 1)}
              >
                {_('Retry')}
              </button>
            </>
          )}
        </div>
      ) : feed && path.length === 0 && feed.navigation.length ? (
        <div className='min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-8'>
          <div className='mx-auto flex w-full max-w-7xl flex-col gap-8'>
            {Array.from(new Map(feed.navigation.map((link) => [link.url, link])).values())
              .filter((link) => new URL(link.url).origin === new URL(root).origin)
              .map((link) => (
                <OpdsShelf
                  key={link.url}
                  link={link}
                  login={login}
                  onBrowse={browse}
                  onSelect={setSelected}
                />
              ))}
            {feed.nextUrl && (
              <button
                type='button'
                className='btn btn-ghost eink-bordered self-center'
                onClick={() =>
                  browse({ url: feed.nextUrl!, title: _('More categories'), acquisition: false })
                }
              >
                {_('More categories')}
              </button>
            )}
          </div>
        </div>
      ) : feed ? (
        <div className='flex min-h-0 flex-1 flex-col px-2 pt-4 sm:px-5'>
          {feed.navigation.length > 0 && (
            <div className='mb-4 flex max-h-28 shrink-0 flex-wrap gap-2 overflow-y-auto px-2'>
              {feed.navigation.map((link) => (
                <button
                  key={link.url}
                  type='button'
                  onClick={() => browse(link)}
                  className='eink-bordered border-base-300 hover:bg-base-200/60 flex max-w-64 items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors duration-150'
                >
                  <Folder aria-hidden='true' className='h-3.5 w-3.5 shrink-0 opacity-60' />
                  <span className='truncate'>{link.title}</span>
                </button>
              ))}
              {feed.nextUrl && (
                <button
                  type='button'
                  className='btn btn-ghost btn-xs'
                  onClick={() =>
                    browse({ url: feed.nextUrl!, title: _('More categories'), acquisition: false })
                  }
                >
                  {_('More categories')}
                </button>
              )}
            </div>
          )}
          <OpdsBookGrid
            key={url}
            url={url}
            login={login}
            initialPage={feed}
            onSelect={setSelected}
          />
        </div>
      ) : (
        <div className='text-base-content/50 flex flex-1 items-center justify-center gap-2'>
          <BookOpen className='h-5 w-5' />
          {_('No books found')}
        </div>
      )}
    </section>
  );
}
