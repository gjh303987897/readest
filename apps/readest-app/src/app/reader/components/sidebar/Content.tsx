import clsx from 'clsx';
import React from 'react';

import { BookDoc } from '@/libs/document';
import { OverlayScrollbarsComponent } from 'overlayscrollbars-react';
import 'overlayscrollbars/overlayscrollbars.css';

import TOCView from './TOCView';

const SidebarContent: React.FC<{
  bookDoc: BookDoc;
  sideBarBookKey: string;
}> = ({ bookDoc, sideBarBookKey }) => (
  <div
    className={clsx(
      'sidebar-content flex h-full min-h-0 flex-grow flex-col shadow-inner',
      'font-sans text-base font-normal sm:text-sm',
    )}
  >
    <OverlayScrollbarsComponent
      className='min-h-0 flex-1'
      options={{
        scrollbars: { autoHide: 'scroll', clickScroll: true },
        showNativeOverlaidScrollbars: false,
      }}
      defer
    >
      <div className='scroll-container h-full'>
        {bookDoc.toc && <TOCView toc={bookDoc.toc} bookKey={sideBarBookKey} />}
      </div>
    </OverlayScrollbarsComponent>
  </div>
);

export default SidebarContent;
