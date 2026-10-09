'use client';

import { useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';
import type { SavedOpdsLogin } from '@/services/opdsLoginService';
import { loadOpdsCover, type OpdsPublication } from '@/services/opdsService';
import { useTranslation } from '@/hooks/useTranslation';
import { useOpdsVisibility } from './useOpdsVisibility';

export function OpdsCover({
  book,
  login,
  className = '',
}: {
  book: OpdsPublication;
  login: SavedOpdsLogin;
  className?: string;
}) {
  const { ref, visible } = useOpdsVisibility();
  const [source, setSource] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setSource('');
    setFailed(false);
    if (!visible || !book.coverUrl) return;
    const controller = new AbortController();
    let objectUrl = '';
    const sameServer = new URL(book.coverUrl).origin === new URL(login.url).origin;
    void loadOpdsCover(
      book.coverUrl,
      sameServer ? { username: login.username, password: login.password } : {},
      controller.signal,
    )
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setSource(objectUrl);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [visible, book.coverUrl, login.url, login.username, login.password]);
  return (
    <div
      ref={ref}
      className={`eink-bordered border-base-300 bg-base-200 relative aspect-[2/3] overflow-hidden rounded-lg border ${className}`}
    >
      {source && !failed ? (
        <img
          src={source}
          alt={book.title}
          loading='lazy'
          className='h-full w-full object-cover'
          onError={() => setFailed(true)}
        />
      ) : (
        <div className='text-base-content/60 flex h-full flex-col items-center justify-center gap-4 px-4 text-center'>
          <BookOpen aria-hidden='true' className='h-8 w-8 opacity-40' />
          <span className='line-clamp-4 text-sm font-medium'>{book.title}</span>
        </div>
      )}
      <span className='bg-neutral/80 text-neutral-content absolute bottom-2 end-2 rounded-md px-1.5 py-0.5 text-[10px] font-semibold'>
        {book.format}
      </span>
    </div>
  );
}

export default function OpdsBookCard({
  book,
  login,
  onSelect,
}: {
  book: OpdsPublication;
  login: SavedOpdsLogin;
  onSelect: (book: OpdsPublication) => void;
}) {
  const _ = useTranslation();
  return (
    <button
      type='button'
      onClick={() => onSelect(book)}
      className='group w-full min-w-0 rounded-lg text-start outline-none focus-visible:ring-2 focus-visible:ring-base-content/15'
      aria-label={book.title}
    >
      <OpdsCover
        book={book}
        login={login}
        className='shadow-sm transition-colors duration-150 group-hover:border-base-content/40'
      />
      <span className='mt-3 block line-clamp-2 text-sm font-semibold leading-snug'>
        {book.title}
      </span>
      <span className='text-base-content/60 mt-1 block truncate text-xs'>
        {book.authors.join(', ') || _('Unknown author')}
      </span>
    </button>
  );
}
