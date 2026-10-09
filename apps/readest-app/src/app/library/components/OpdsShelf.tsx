'use client';

import { BookOpen, ChevronRight, LoaderCircle } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import type { SavedOpdsLogin } from '@/services/opdsLoginService';
import type { OpdsNavigationLink, OpdsPublication } from '@/services/opdsService';
import OpdsBookCard from './OpdsBookCard';
import { useOpdsVisibility } from './useOpdsVisibility';
import { useOpdsBooks } from './useOpdsBooks';

export default function OpdsShelf({
  link,
  login,
  onBrowse,
  onSelect,
}: {
  link: OpdsNavigationLink;
  login: SavedOpdsLogin;
  onBrowse: (link: OpdsNavigationLink) => void;
  onSelect: (book: OpdsPublication) => void;
}) {
  const _ = useTranslation();
  const { ref, visible } = useOpdsVisibility();
  const { books, hasMore, loading, error, loadMore } = useOpdsBooks(link.url, login, visible, 8);
  return (
    <div ref={ref} className='min-w-0 py-3'>
      <button
        type='button'
        aria-label={link.title}
        onClick={() => onBrowse(link)}
        className='group mb-5 flex max-w-full items-center gap-3 rounded-md text-start focus-visible:ring-2 focus-visible:ring-base-content/15'
      >
        <span className='min-w-0'>
          <span className='block text-lg font-semibold tracking-tight'>{link.title}</span>
          <span className='text-base-content/60 mt-1 block text-xs'>
            {link.summary || _('Browse this category')}
          </span>
        </span>
        <ChevronRight
          aria-hidden='true'
          className='h-4 w-4 shrink-0 opacity-40 group-hover:opacity-80 rtl:rotate-180'
        />
      </button>
      <div className='flex min-h-48 gap-5 overflow-x-auto px-1 pb-4 pt-1 sm:gap-6'>
        {books.map((book) => (
          <div key={book.downloadUrl} className='w-36 shrink-0 sm:w-44'>
            <OpdsBookCard book={book} login={login} onSelect={onSelect} />
          </div>
        ))}
        {(loading || !visible) &&
          books.length === 0 &&
          [0, 1, 2].map((key) => (
            <div key={key} className='w-36 shrink-0 sm:w-44'>
              <div className='bg-base-200 aspect-[2/3] rounded-lg' />
              <div className='bg-base-200 mt-3 h-4 w-3/4 rounded' />
            </div>
          ))}
        {books.length > 0 && (
          <button
            type='button'
            onClick={() => onBrowse(link)}
            className='eink-bordered border-base-300 hover:bg-base-200/60 flex w-28 shrink-0 flex-col items-center justify-center gap-2 self-start rounded-lg border py-16 text-xs transition-colors duration-150'
          >
            <ChevronRight aria-hidden='true' className='h-5 w-5 rtl:rotate-180' />
            {_('View all')}
          </button>
        )}
        {!loading && visible && books.length === 0 && !error && !hasMore && (
          <div className='text-base-content/50 flex min-h-48 w-full items-center justify-center gap-2 text-sm'>
            <BookOpen aria-hidden='true' className='h-5 w-5' />
            {_('No books found')}
          </div>
        )}
        {(error || (!loading && books.length === 0 && hasMore && visible)) && (
          <div className='flex min-h-48 w-full flex-col items-center justify-center gap-3 text-center'>
            {error && (
              <p role='alert' className='text-error text-sm'>
                {_(error)}
              </p>
            )}
            <button
              type='button'
              className='btn btn-ghost eink-bordered btn-sm'
              onClick={() => void loadMore()}
              disabled={loading}
            >
              {loading ? (
                <LoaderCircle className='h-4 w-4 animate-spin' />
              ) : error ? (
                _('Retry')
              ) : (
                _('Load more')
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
