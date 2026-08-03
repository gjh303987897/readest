import clsx from 'clsx';
import { useRef } from 'react';
import { Book } from '@/types/book';
import { useThemeStore } from '@/store/themeStore';
import { formatAuthors, formatTitle } from '@/utils/book';
import BookCover from '@/components/BookCover';

const BookCard = ({ book }: { book: Book }) => {
  const { title, author } = book;
  const { isDarkMode } = useThemeStore();
  const bookCoverRef = useRef<HTMLDivElement | null>(null);

  return (
    <div className='flex h-20 w-full items-center'>
      <div
        ref={bookCoverRef}
        className={clsx(
          'me-4 aspect-[28/41] max-h-16 w-[15%] max-w-12 overflow-hidden rounded-sm shadow-md',
          isDarkMode ? 'mix-blend-screen' : 'mix-blend-multiply',
        )}
      >
        <BookCover
          book={book}
          mode='list'
          coverFit='crop'
          imageClassName='rounded-sm'
          onImageError={() => (bookCoverRef.current!.style.display = 'none')}
        />
      </div>
      <div className='min-w-0 flex-1'>
        <h4 className='line-clamp-2 w-[90%] text-sm font-semibold'>
          {formatTitle(title).replace(/\u00A0/g, ' ')}
        </h4>
        <p className='truncate text-xs opacity-75'>{formatAuthors(author)}</p>
      </div>
    </div>
  );
};

export default BookCard;
