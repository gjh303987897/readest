import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BookDoc } from '@/libs/document';
import SidebarContent from '@/app/reader/components/sidebar/Content';

vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (key: string) => key }));
vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: (selector: (state: unknown) => unknown) =>
    selector({ booksData: { book: { config: { bookmarks: [] } } } }),
}));
vi.mock('overlayscrollbars-react', () => ({
  OverlayScrollbarsComponent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock('@/app/reader/components/sidebar/TOCView', () => ({
  default: () => <div>TOC content</div>,
}));
vi.mock('@/app/reader/components/sidebar/BookmarksView', () => ({
  default: () => <div>Bookmarks content</div>,
}));

afterEach(cleanup);

describe('SidebarContent tab transitions', () => {
  it('restarts the content entrance when switching tabs', () => {
    const bookDoc = { toc: [{ href: '#chapter', label: 'Chapter' }] } as unknown as BookDoc;
    render(<SidebarContent bookDoc={bookDoc} sideBarBookKey='book-view' />);
    const firstPanel = screen.getByRole('tabpanel');
    fireEvent.click(screen.getByRole('tab', { name: 'Bookmarks' }));

    const nextPanel = screen.getByRole('tabpanel');
    expect(nextPanel).not.toBe(firstPanel);
    expect(nextPanel.classList.contains('view-switch-enter')).toBe(true);
    expect(screen.getByText('Bookmarks content')).toBeTruthy();
  });
});
