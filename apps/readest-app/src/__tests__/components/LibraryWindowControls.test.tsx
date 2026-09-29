import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (value: string) => value,
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({
    envConfig: {},
    appService: { hasWindowBar: true },
  }),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: null, logout: vi.fn() }),
}));

vi.mock('@/hooks/useLibrary', () => ({
  useLibrary: () => ({ libraryLoaded: false }),
}));

vi.mock('@/hooks/useTheme', () => ({ useTheme: vi.fn() }));
vi.mock('@/hooks/useTransferQueue', () => ({ useTransferQueue: vi.fn() }));
vi.mock('@/hooks/useAppRouter', () => ({ useAppRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/hooks/useFileSelector', () => ({
  useFileSelector: () => ({ selectFiles: vi.fn() }),
}));

vi.mock('@/store/libraryStore', () => {
  const state = {
    visibleLibrary: [],
    library: [],
    updateBook: vi.fn(),
    updateBooks: vi.fn(),
    checkOpenWithBooks: false,
    setCheckOpenWithBooks: vi.fn(),
  };
  const useLibraryStore = Object.assign(
    (selector: (value: typeof state) => unknown) => selector(state),
    { getState: () => state },
  );
  return { useLibraryStore };
});

vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: (selector: (state: { clearBookData: () => void }) => unknown) =>
    selector({ clearBookData: vi.fn() }),
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({ settings: {} }),
}));

vi.mock('@/app/library/hooks/useBooksSync', () => ({
  useBooksSync: () => ({ pullLibrary: vi.fn(), pushLibrary: vi.fn() }),
}));

vi.mock('@/app/library/hooks/useBookTransferActions', () => ({
  useBookTransferActions: () => ({
    handleBookUpload: vi.fn(),
    handleBookDownload: vi.fn(),
  }),
}));

vi.mock('@/components/Spinner', () => ({ default: () => <div>Loading</div> }));
vi.mock('@/components/Toast', () => ({ Toast: () => null }));

import LibraryPage from '@/app/library/page';

afterEach(cleanup);

describe('Library window controls', () => {
  it('renders the desktop minimize, maximize, and close buttons in the library header', () => {
    render(<LibraryPage />);

    expect(screen.getByRole('button', { name: 'Minimize' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Maximize or Restore' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  });
});

describe('Library header search', () => {
  it('starts as a button and expands into a focused search field', async () => {
    const { container } = render(<LibraryPage />);

    expect(screen.queryByRole('textbox', { name: 'Search Books' })).toBeNull();
    const button = screen.getByRole('button', { name: 'Search Books' });
    const search = container.querySelector('.library-search');
    expect(search).not.toBeNull();
    expect(search?.className).toContain('transition-[width]');

    fireEvent.click(button);

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Search Books' })).toBe(document.activeElement),
    );
    expect(search?.className).toContain('w-full');
  });

  it('keeps a nonempty query visible and clears it when dismissed', async () => {
    render(<LibraryPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Search Books' }));
    const input = screen.getByRole('textbox', { name: 'Search Books' }) as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'Alice' } });
    fireEvent.blur(input);
    expect(screen.getByRole('textbox', { name: 'Search Books' })).toBeTruthy();

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('textbox', { name: 'Search Books' })).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Search Books' })).toBe(document.activeElement),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Search Books' }));
    expect((screen.getByRole('textbox', { name: 'Search Books' }) as HTMLInputElement).value).toBe(
      '',
    );
  });

  it('keeps the close button reachable and collapses when focus leaves an empty search', () => {
    render(<LibraryPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Search Books' }));
    const closeButton = screen.getByRole('button', { name: 'Close Search' });
    fireEvent.blur(screen.getByRole('textbox', { name: 'Search Books' }), {
      relatedTarget: closeButton,
    });
    expect(screen.getByRole('textbox', { name: 'Search Books' })).toBeTruthy();
    fireEvent.blur(closeButton);

    expect(screen.queryByRole('textbox', { name: 'Search Books' })).toBeNull();
  });
});
