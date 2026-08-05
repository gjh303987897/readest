import { FormEvent, useEffect, useRef, useState } from 'react';
import { BookmarkPlus } from 'lucide-react';
import { createPortal } from 'react-dom';

import Dialog from '@/components/Dialog';
import { useTranslation } from '@/hooks/useTranslation';
import { useResponsiveSize } from '@/hooks/useResponsiveSize';
import { useBookProgress } from '@/store/readerProgressStore';
import { limitBookmarkTitle, MAX_BOOKMARK_TITLE_LENGTH } from '@/utils/bookmark';
import { useBookmarks } from '../hooks/useBookmarks';

interface BookmarkButtonProps {
  bookKey: string;
  onOpenChange?: (isOpen: boolean) => void;
}

const BookmarkButton: React.FC<BookmarkButtonProps> = ({ bookKey, onOpenChange }) => {
  const _ = useTranslation();
  const progress = useBookProgress(bookKey);
  const { addBookmark } = useBookmarks(bookKey);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const iconSize18 = useResponsiveSize(18);

  const setOpen = (open: boolean) => {
    setIsOpen(open);
    onOpenChange?.(open);
    if (!open) {
      setTitle('');
      setError('');
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 150);
    return () => clearTimeout(timer);
  }, [isOpen]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!progress?.location || isSaving) return;
    setIsSaving(true);
    setError('');
    try {
      await addBookmark(progress, title);
      setOpen(false);
    } catch (saveError) {
      console.error('Failed to save bookmark:', saveError);
      setError(_('Failed to save bookmark'));
      setIsSaving(false);
    }
  };

  const pageLabel = progress?.page ? _('Page {{number}}', { number: progress.page }) : '';
  const locationLabel = [progress?.sectionLabel, pageLabel].filter(Boolean).join(' / ');

  return (
    <>
      <button
        type='button'
        title={_('Add Bookmark')}
        aria-label={_('Add Bookmark')}
        className='btn btn-ghost h-8 min-h-8 w-8 p-0'
        disabled={!progress?.location}
        onClick={() => setOpen(true)}
      >
        <BookmarkPlus size={iconSize18} strokeWidth={1.8} />
      </button>
      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <Dialog
            id={`bookmark-dialog-${bookKey}`}
            isOpen={isOpen}
            title={_('Add Bookmark')}
            snapHeight={0.38}
            boxClassName='sm:!h-auto sm:!w-[420px]'
            contentClassName='!flex-grow-0 pb-5'
            onClose={() => setOpen(false)}
          >
            <form className='flex flex-col gap-4' onSubmit={handleSubmit}>
              {locationLabel && (
                <p className='text-base-content/65 line-clamp-2 text-sm'>{locationLabel}</p>
              )}
              <label className='form-control w-full'>
                <span className='label-text mb-2 text-sm'>{_('Bookmark Title')}</span>
                <input
                  ref={inputRef}
                  type='text'
                  className='input input-bordered w-full'
                  value={title}
                  maxLength={MAX_BOOKMARK_TITLE_LENGTH}
                  placeholder={_('Optional title')}
                  onChange={(event) => setTitle(limitBookmarkTitle(event.target.value))}
                />
                <span className='text-base-content/55 mt-1 self-end text-xs tabular-nums'>
                  {Array.from(title).length}/{MAX_BOOKMARK_TITLE_LENGTH}
                </span>
              </label>
              {error && <p className='text-error text-sm'>{error}</p>}
              <div className='flex justify-end gap-2'>
                <button
                  type='button'
                  className='btn btn-ghost btn-sm'
                  onClick={() => setOpen(false)}
                >
                  {_('Cancel')}
                </button>
                <button type='submit' className='btn btn-primary btn-sm' disabled={isSaving}>
                  {_('Save')}
                </button>
              </div>
            </form>
          </Dialog>,
          document.body,
        )}
    </>
  );
};

export default BookmarkButton;
