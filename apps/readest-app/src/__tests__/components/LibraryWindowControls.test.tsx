import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const libraryState = vi.hoisted(() => ({ loaded: false }));

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
  useLibrary: () => ({ libraryLoaded: libraryState.loaded }),
}));

vi.mock('@/hooks/useTheme', () => ({ useTheme: vi.fn() }));
vi.mock('@/hooks/useTransferQueue', () => ({ useTransferQueue: vi.fn() }));
vi.mock('@/hooks/useAppRouter', () => ({ useAppRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/hooks/useFileSelector', () => ({
  useFileSelector: () => ({ selectFiles: vi.fn() }),
}));

vi.mock('@/components/BookCover', () => ({ default: () => <div>Cover</div> }));

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
import { DropdownProvider } from '@/context/DropdownContext';
import { useLibraryStore } from '@/store/libraryStore';
import { usePrivacyStore } from '@/store/privacyStore';
import type { Book } from '@/types/book';
import { eventDispatcher } from '@/utils/event';

beforeEach(() => {
  libraryState.loaded = false;
  localStorage.clear();
  usePrivacyStore.setState(usePrivacyStore.getInitialState());
  useLibraryStore.setState({ library: [], visibleLibrary: [], checkOpenWithBooks: false });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Library privacy actions', () => {
  it('marks a book as private, hides it when locked, and restores it after PIN unlock', async () => {
    libraryState.loaded = true;
    const book = { hash: 'private', title: 'Private book', format: 'EPUB', author: '' } as Book;
    useLibraryStore.getState().setLibrary([book]);
    await usePrivacyStore.getState().setPin('1234');
    const dispatch = vi.spyOn(eventDispatcher, 'dispatch');
    render(
      <DropdownProvider>
        <LibraryPage />
      </DropdownProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Book Actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Hide in Privacy Mode' }));
    await waitFor(() => expect(screen.getByTitle('Hidden in Privacy Mode')).toBeTruthy());
    expect(usePrivacyStore.getState().hiddenBookHashes).toEqual(['private']);
    expect(dispatch).toHaveBeenCalledWith('toast', {
      type: 'info',
      message: 'Book will be hidden when Privacy Mode is locked',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Book Actions' }));
    expect(screen.getByRole('menuitem', { name: 'Remove from Privacy Mode' })).toBeTruthy();
    await act(async () => usePrivacyStore.getState().lock());
    expect(screen.queryByRole('button', { name: 'Open {{title}}' })).toBeNull();
    await act(async () => {
      expect(await usePrivacyStore.getState().unlock('1234')).toBe(true);
    });
    expect(screen.getByRole('button', { name: 'Open {{title}}' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Book Actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove from Privacy Mode' }));
    await waitFor(() => expect(screen.queryByTitle('Hidden in Privacy Mode')).toBeNull());
    await act(async () => usePrivacyStore.getState().lock());
    expect(screen.getByRole('button', { name: 'Open {{title}}' })).toBeTruthy();
  });

  it('requests PIN verification and retries hiding when unlocked without an encryption key', async () => {
    libraryState.loaded = true;
    useLibraryStore
      .getState()
      .setLibrary([{ hash: 'private', title: 'Private book', format: 'EPUB', author: '' } as Book]);
    await usePrivacyStore.getState().setPin('1234');
    usePrivacyStore.setState({ encryptionKey: null });
    render(
      <DropdownProvider>
        <LibraryPage />
      </DropdownProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Book Actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Hide in Privacy Mode' }));
    expect(usePrivacyStore.getState().hiddenBookHashes).toEqual([]);
    const input = screen.getByLabelText('Privacy PIN');
    fireEvent.change(input, { target: { value: '1234' } });
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => expect(usePrivacyStore.getState().hiddenBookHashes).toEqual(['private']));
    expect(screen.getByTitle('Hidden in Privacy Mode')).toBeTruthy();
  });

  it('reports a storage failure without marking the book as hidden', async () => {
    libraryState.loaded = true;
    useLibraryStore
      .getState()
      .setLibrary([{ hash: 'private', title: 'Private book', format: 'EPUB', author: '' } as Book]);
    await usePrivacyStore.getState().setPin('1234');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('Storage full');
    });
    const dispatch = vi.spyOn(eventDispatcher, 'dispatch');
    render(
      <DropdownProvider>
        <LibraryPage />
      </DropdownProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Book Actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Hide in Privacy Mode' }));
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith('toast', {
        type: 'error',
        message: 'Failed to update book privacy',
      }),
    );
    expect(usePrivacyStore.getState().hiddenBookHashes).toEqual([]);
    expect(screen.queryByTitle('Hidden in Privacy Mode')).toBeNull();
  });
});

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
