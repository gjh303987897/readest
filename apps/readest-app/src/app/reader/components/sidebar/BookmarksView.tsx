import { FormEvent, useState } from 'react';
import clsx from 'clsx';
import { Bookmark, Check, Pencil, Trash2, X } from 'lucide-react';

import { useTranslation } from '@/hooks/useTranslation';
import { useBookProgress } from '@/store/readerProgressStore';
import { useReaderStore } from '@/store/readerStore';
import { BookBookmark } from '@/types/book';
import { limitBookmarkTitle, MAX_BOOKMARK_TITLE_LENGTH } from '@/utils/bookmark';
import { eventDispatcher } from '@/utils/event';
import { useBookmarks } from '../../hooks/useBookmarks';

const BookmarksView: React.FC<{ bookKey: string }> = ({ bookKey }) => {
  const _ = useTranslation();
  const progress = useBookProgress(bookKey);
  const getView = useReaderStore((state) => state.getView);
  const { bookmarks, renameBookmark, removeBookmark } = useBookmarks(bookKey);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const getDisplayTitle = (bookmark: BookBookmark) =>
    bookmark.title ||
    (bookmark.page ? _('Page {{number}}', { number: bookmark.page }) : _('Bookmark'));

  const handleNavigate = (bookmark: BookBookmark) => {
    eventDispatcher.dispatch('navigate', { bookKey, cfi: bookmark.location });
    getView(bookKey)?.goTo(bookmark.location);
  };

  const beginRename = (bookmark: BookBookmark) => {
    setEditingId(bookmark.id);
    setEditingTitle(bookmark.title);
    setError('');
  };

  const handleRename = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingId || pendingId) return;
    setPendingId(editingId);
    setError('');
    try {
      await renameBookmark(editingId, editingTitle);
      setEditingId(null);
    } catch (saveError) {
      console.error('Failed to rename bookmark:', saveError);
      setError(_('Failed to save bookmark'));
    } finally {
      setPendingId(null);
    }
  };

  const handleRemove = async (id: string) => {
    if (pendingId) return;
    setPendingId(id);
    setError('');
    try {
      await removeBookmark(id);
      if (editingId === id) setEditingId(null);
    } catch (removeError) {
      console.error('Failed to remove bookmark:', removeError);
      setError(_('Failed to remove bookmark'));
    } finally {
      setPendingId(null);
    }
  };

  if (bookmarks.length === 0) {
    return (
      <div className='text-base-content/60 flex min-h-48 flex-col items-center justify-center gap-3 px-6 text-center'>
        <Bookmark size={28} strokeWidth={1.5} />
        <span className='text-sm'>{_('No Bookmarks')}</span>
      </div>
    );
  }

  return (
    <div className='bookmark-list divide-base-300/70 divide-y py-1'>
      {error && <p className='text-error px-4 py-2 text-sm'>{error}</p>}
      {bookmarks.map((bookmark) => {
        const isCurrent = progress?.location === bookmark.location;
        const isEditing = editingId === bookmark.id;
        const isPending = pendingId === bookmark.id;
        const pageLabel = bookmark.page ? _('Page {{number}}', { number: bookmark.page }) : '';
        const detail = [bookmark.sectionLabel, pageLabel].filter(Boolean).join(' / ');

        return (
          <div
            key={bookmark.id}
            className={clsx(
              'group flex min-h-16 items-center gap-2 px-2 py-2 transition-colors',
              isCurrent ? 'bg-primary/10' : 'hover:bg-base-300/50',
            )}
          >
            {isEditing ? (
              <form className='flex min-w-0 flex-1 items-center gap-1' onSubmit={handleRename}>
                <input
                  autoFocus
                  aria-label={_('Bookmark Title')}
                  className='input input-bordered input-sm min-w-0 flex-1'
                  value={editingTitle}
                  maxLength={MAX_BOOKMARK_TITLE_LENGTH}
                  disabled={isPending}
                  onChange={(event) => setEditingTitle(limitBookmarkTitle(event.target.value))}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setEditingId(null);
                  }}
                />
                <button
                  type='submit'
                  title={_('Save')}
                  aria-label={_('Save')}
                  className='btn btn-ghost h-8 min-h-8 w-8 p-0'
                  disabled={isPending}
                >
                  <Check size={16} />
                </button>
                <button
                  type='button'
                  title={_('Cancel')}
                  aria-label={_('Cancel')}
                  className='btn btn-ghost h-8 min-h-8 w-8 p-0'
                  disabled={isPending}
                  onClick={() => setEditingId(null)}
                >
                  <X size={16} />
                </button>
              </form>
            ) : (
              <>
                <button
                  type='button'
                  className='flex min-w-0 flex-1 items-center gap-3 rounded p-2 text-start'
                  aria-current={isCurrent ? 'location' : undefined}
                  onClick={() => handleNavigate(bookmark)}
                >
                  <Bookmark
                    size={18}
                    className={clsx('shrink-0', isCurrent && 'fill-primary text-primary')}
                  />
                  <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
                    <span className='line-clamp-2 text-sm font-medium'>
                      {getDisplayTitle(bookmark)}
                    </span>
                    {detail && (
                      <span className='text-base-content/60 line-clamp-1 text-xs'>{detail}</span>
                    )}
                  </span>
                </button>
                <div className='flex shrink-0 items-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100'>
                  <button
                    type='button'
                    title={_('Edit')}
                    aria-label={_('Edit')}
                    className='btn btn-ghost h-8 min-h-8 w-8 p-0'
                    disabled={isPending}
                    onClick={() => beginRename(bookmark)}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type='button'
                    title={_('Remove Bookmark')}
                    aria-label={_('Remove Bookmark')}
                    className='btn btn-ghost text-error h-8 min-h-8 w-8 p-0'
                    disabled={isPending}
                    onClick={() => void handleRemove(bookmark.id)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default BookmarksView;
