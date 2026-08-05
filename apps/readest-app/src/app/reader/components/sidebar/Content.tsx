import clsx from 'clsx';
import { Bookmark, ListTree } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { OverlayScrollbarsComponent } from 'overlayscrollbars-react';
import 'overlayscrollbars/overlayscrollbars.css';

import { useTranslation } from '@/hooks/useTranslation';
import { BookDoc } from '@/libs/document';
import { useBookDataStore } from '@/store/bookDataStore';
import BookmarksView from './BookmarksView';
import TOCView from './TOCView';

type SidebarTab = 'toc' | 'bookmarks';

const SidebarContent: React.FC<{
  bookDoc: BookDoc;
  sideBarBookKey: string;
}> = ({ bookDoc, sideBarBookKey }) => {
  const _ = useTranslation();
  const bookId = sideBarBookKey.split('-')[0]!;
  const bookmarkCount = useBookDataStore(
    (state) => state.booksData[bookId]?.config?.bookmarks?.length ?? 0,
  );
  const hasTOC = Boolean(bookDoc.toc?.length);
  const [activeTab, setActiveTab] = useState<SidebarTab>(hasTOC ? 'toc' : 'bookmarks');

  useEffect(() => {
    setActiveTab(hasTOC ? 'toc' : 'bookmarks');
  }, [sideBarBookKey, hasTOC]);

  return (
    <div
      className={clsx(
        'sidebar-content flex h-full min-h-0 flex-grow flex-col shadow-inner',
        'font-sans text-base font-normal sm:text-sm',
      )}
    >
      <div className='border-base-300/70 border-b px-3 py-2'>
        <div className='bg-base-300/70 grid h-9 grid-cols-2 rounded p-0.5' role='tablist'>
          <button
            type='button'
            role='tab'
            aria-selected={activeTab === 'toc'}
            className={clsx(
              'flex min-w-0 items-center justify-center gap-2 rounded px-2 text-sm transition-colors',
              activeTab === 'toc' ? 'bg-base-100 shadow-sm' : 'hover:bg-base-200/70',
            )}
            disabled={!hasTOC}
            onClick={() => setActiveTab('toc')}
          >
            <ListTree size={16} />
            <span className='truncate'>{_('Table of Contents')}</span>
          </button>
          <button
            type='button'
            role='tab'
            aria-selected={activeTab === 'bookmarks'}
            className={clsx(
              'flex min-w-0 items-center justify-center gap-2 rounded px-2 text-sm transition-colors',
              activeTab === 'bookmarks' ? 'bg-base-100 shadow-sm' : 'hover:bg-base-200/70',
            )}
            onClick={() => setActiveTab('bookmarks')}
          >
            <Bookmark size={16} />
            <span className='truncate'>{_('Bookmarks')}</span>
            {bookmarkCount > 0 && (
              <span className='bg-base-content/10 min-w-5 rounded px-1 text-xs tabular-nums'>
                {bookmarkCount}
              </span>
            )}
          </button>
        </div>
      </div>
      <OverlayScrollbarsComponent
        className='min-h-0 flex-1'
        options={{
          scrollbars: { autoHide: 'scroll', clickScroll: true },
          showNativeOverlaidScrollbars: false,
        }}
        defer
      >
        <div className='scroll-container h-full' role='tabpanel'>
          {activeTab === 'toc' && bookDoc.toc && (
            <TOCView toc={bookDoc.toc} bookKey={sideBarBookKey} />
          )}
          {activeTab === 'bookmarks' && <BookmarksView bookKey={sideBarBookKey} />}
        </div>
      </OverlayScrollbarsComponent>
    </div>
  );
};

export default SidebarContent;
