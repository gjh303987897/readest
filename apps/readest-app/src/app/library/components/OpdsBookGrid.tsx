'use client';

import { useEffect, useRef, useState } from 'react';
import { FixedSizeGrid, type GridChildComponentProps } from 'react-window';
import { BookOpen, LoaderCircle } from 'lucide-react';
import type { SavedOpdsLogin } from '@/services/opdsLoginService';
import type { OpdsPublication, ParsedOpdsFeed } from '@/services/opdsService';
import { useTranslation } from '@/hooks/useTranslation';
import OpdsBookCard from './OpdsBookCard';
import { useOpdsBooks } from './useOpdsBooks';

interface GridData {
  books: OpdsPublication[];
  columns: number;
  login: SavedOpdsLogin;
  onSelect: (book: OpdsPublication) => void;
}

const BookCell = ({ columnIndex, rowIndex, style, data }: GridChildComponentProps<GridData>) => {
  const book = data.books[rowIndex * data.columns + columnIndex];
  return book ? (
    <div style={style} className='px-2 pb-5 pt-1 sm:px-3'>
      <OpdsBookCard book={book} login={data.login} onSelect={data.onSelect} />
    </div>
  ) : null;
};

export default function OpdsBookGrid({
  url,
  login,
  onSelect,
  initialPage,
}: {
  url: string;
  login: SavedOpdsLogin;
  onSelect: (book: OpdsPublication) => void;
  initialPage?: ParsedOpdsFeed;
}) {
  const _ = useTranslation();
  const container = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 600, height: 480 });
  const { books, loading, error, hasMore, loadMore } = useOpdsBooks(
    url,
    login,
    true,
    24,
    initialPage,
  );
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const update = () =>
      setSize({ width: element.clientWidth || 600, height: element.clientHeight || 480 });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const columns = Math.max(2, Math.floor(size.width / 184));
  const columnWidth = size.width / columns;
  const rowCount = Math.max(1, Math.ceil((books.length + (hasMore ? columns : 0)) / columns));
  return (
    <div className='flex min-h-0 flex-1 flex-col'>
      <div ref={container} className='relative min-h-0 flex-1'>
        <FixedSizeGrid
          direction={document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr'}
          columnCount={columns}
          columnWidth={columnWidth}
          rowCount={rowCount}
          rowHeight={(columnWidth - 24) * 1.5 + 88}
          width={size.width}
          height={size.height}
          itemData={{ books, columns, login, onSelect }}
          itemKey={({ columnIndex, rowIndex, data }) =>
            data.books[rowIndex * columns + columnIndex]?.downloadUrl ??
            `loading-${rowIndex}-${columnIndex}`
          }
          overscanRowCount={1}
          onItemsRendered={({ visibleRowStopIndex }) => {
            if (visibleRowStopIndex >= rowCount - 2 && hasMore && !loading && !error)
              void loadMore();
          }}
        >
          {BookCell}
        </FixedSizeGrid>
        {!loading && !error && books.length === 0 && !hasMore && (
          <div className='text-base-content/50 absolute inset-0 flex items-center justify-center gap-2 text-sm'>
            <BookOpen className='h-5 w-5' />
            {_('No books found')}
          </div>
        )}
      </div>
      {(loading || error || hasMore) && (
        <div className='flex shrink-0 items-center justify-center gap-3 py-2 text-sm'>
          {loading ? (
            <>
              <LoaderCircle aria-hidden='true' className='h-4 w-4 animate-spin opacity-60' />
              <span className='text-base-content/60'>{_('Loading books…')}</span>
            </>
          ) : (
            <>
              {error && (
                <span role='alert' className='text-error'>
                  {_(error)}
                </span>
              )}
              <button
                type='button'
                className='btn btn-ghost eink-bordered btn-sm'
                onClick={() => void loadMore()}
              >
                {error ? _('Retry') : _('Load more')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
