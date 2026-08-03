import { cleanup, render, screen } from '@testing-library/react';
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
