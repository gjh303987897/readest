import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpdsPublication, ParsedOpdsFeed } from '@/services/opdsService';
const mocks = vi.hoisted(() => ({
  page: vi.fn(),
  session: vi.fn(),
  details: vi.fn(),
  cover: vi.fn(),
}));
vi.mock('@/services/opdsService', async () => ({
  ...(await vi.importActual<typeof import('@/services/opdsService')>('@/services/opdsService')),
  loadOpdsFeedPage: mocks.page,
  createOpdsBrowseSession: mocks.session,
  loadOpdsDetails: mocks.details,
  loadOpdsCover: mocks.cover,
}));
vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (s: string) => s }));
vi.mock('@/components/Dialog', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div role='dialog'>{children}</div>,
}));
import OpdsBrowser from '@/app/library/components/OpdsBrowser';
import OpdsServicePicker from '@/app/library/components/OpdsServicePicker';
import OpdsBookDetails from '@/app/library/components/OpdsBookDetails';
import OpdsBookGrid from '@/app/library/components/OpdsBookGrid';
import OpdsOverwriteDialog from '@/app/library/components/OpdsOverwriteDialog';
import { OpdsSaveCancelledError } from '@/services/opdsReadingService';
import { useOpdsBrowserStore } from '@/store/opdsBrowserStore';
import { SAVED_LOGINS_KEY } from '@/services/opdsLoginService';
const login = {
  provider: 'calibre-web' as const,
  title: 'Home library',
  url: 'https://books.example/opds',
  username: 'reader',
  password: 'secret',
};
const book: OpdsPublication = {
  id: 'book',
  title: 'A novel',
  authors: ['Writer'],
  format: 'EPUB',
  downloadUrl: 'https://books.example/download.epub',
  summary: 'Book description',
  publisher: 'Press',
};
const observers: { element?: Element; callback: IntersectionObserverCallback }[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useOpdsBrowserStore.getState().select(login);
  observers.length = 0;
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      entry: { element?: Element; callback: IntersectionObserverCallback };
      constructor(callback: IntersectionObserverCallback) {
        this.entry = { callback };
        observers.push(this.entry);
      }
      observe(el: Element) {
        this.entry.element = el;
      }
      disconnect() {}
    },
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  mocks.details.mockImplementation(async (b: OpdsPublication) => b);
  mocks.session.mockImplementation(() => ({
    next: vi.fn().mockResolvedValue({ books: [book], hasMore: false }),
  }));
  mocks.page.mockResolvedValue({
    title: 'Catalog',
    publications: [],
    navigation: [
      { title: 'Categories', url: login.url + '/categories', acquisition: false },
      { title: 'Languages', url: login.url + '/languages', acquisition: false },
    ],
  } satisfies ParsedOpdsFeed);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const showShelf = async (title: string) => {
  await screen.findByRole('button', { name: title });
  const shelf = observers.find((o) => o.element?.tagName === 'DIV')!;
  shelf.callback(
    [{ isIntersecting: true, target: shelf.element } as IntersectionObserverEntry],
    {} as IntersectionObserver,
  );
};
describe('OPDS view', () => {
  it('shows saved providers, selects a service and offers login management', () => {
    localStorage.setItem(SAVED_LOGINS_KEY, JSON.stringify([login]));
    const select = vi.fn(),
      manage = vi.fn();
    render(<OpdsServicePicker onSelect={select} onClose={() => {}} onManage={manage} />);
    fireEvent.click(screen.getByRole('button', { name: /Home library/ }));
    expect(select).toHaveBeenCalledWith(login);
    fireEvent.click(screen.getByRole('button', { name: 'Manage OPDS logins' }));
    expect(manage).toHaveBeenCalled();
    expect(screen.queryByText('secret')).toBeNull();
  });
  it('loads category previews only when the shelf enters the viewport, then opens details', async () => {
    render(<OpdsBrowser onChooseService={() => {}} onRead={async () => {}} />);
    await screen.findByRole('button', { name: 'Categories' });
    expect(mocks.session.mock.calls).toHaveLength(2);
    expect(mocks.session.mock.results.every((r) => r.value.next.mock.calls.length === 0)).toBe(
      true,
    );
    await showShelf('Categories');
    await screen.findByRole('button', { name: 'A novel' });
    expect(mocks.session.mock.results.filter((r) => r.value.next.mock.calls.length)).toHaveLength(
      1,
    );
    fireEvent.click(screen.getByRole('button', { name: 'A novel' }));
    await screen.findByText('Book description');
    expect(
      (screen.getByRole('checkbox', { name: 'Save to local library' }) as HTMLInputElement).checked,
    ).toBe(false);
  });
  it('passes the save choice to reading and shows recoverable download failures', async () => {
    const read = vi
      .fn()
      .mockRejectedValueOnce(new Error('Download failed'))
      .mockResolvedValue(undefined);
    render(<OpdsBookDetails book={book} login={login} onBack={() => {}} onRead={read} />);
    expect(screen.getByRole('note').textContent).toContain('does not save reading progress');
    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Read' }) as HTMLButtonElement).disabled).toBe(
        false,
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Read' }));
    await screen.findByRole('alert');
    expect(read).toHaveBeenLastCalledWith(book, false);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Save to local library' }));
    expect(screen.queryByRole('note')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Read' }));
    await waitFor(() => expect(read).toHaveBeenLastCalledWith(book, true));
  });
  it('provides retry after catalog errors and handles invalid saved provider URLs without crashing', async () => {
    mocks.page.mockRejectedValueOnce(new Error('Offline'));
    render(<OpdsBrowser onChooseService={() => {}} onRead={async () => {}} />);
    await screen.findByText('Offline');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByRole('button', { name: 'Categories' });
    useOpdsBrowserStore.getState().select({ ...login, provider: 'kavita' });
    await screen.findByRole('alert');
    expect(screen.getByRole('alert').textContent).toContain('full Kavita OPDS URL');
  });
  it('virtualizes large catalogs instead of mounting every book card', async () => {
    const books = Array.from({ length: 500 }, (_, i) => ({
      ...book,
      id: String(i),
      title: 'Book ' + i,
      downloadUrl: login.url + '/' + i + '.epub',
    }));
    mocks.session.mockReturnValue({ next: vi.fn().mockResolvedValue({ books, hasMore: false }) });
    render(<OpdsBookGrid url={login.url} login={login} onSelect={() => {}} />);
    await screen.findByRole('button', { name: 'Book 0' });
    expect(screen.getAllByRole('button').length).toBeLessThan(20);
    expect(screen.queryByRole('button', { name: 'Book 499' })).toBeNull();
  });
});

it('allows cancelling or confirming an existing book with an explicit warning', () => {
  const confirm = vi.fn();
  const cancel = vi.fn();
  render(<OpdsOverwriteDialog title='Existing novel' onConfirm={confirm} onCancel={cancel} />);
  expect(screen.getByText(/may overwrite its reading progress and bookmarks/)).toBeTruthy();
  expect(confirm).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(cancel).toHaveBeenCalledOnce();
  expect(confirm).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Save anyway' }));
  expect(confirm).toHaveBeenCalledOnce();
});

it('does not show a download error when saving an existing book is cancelled', async () => {
  const read = vi.fn().mockRejectedValue(new OpdsSaveCancelledError());
  render(<OpdsBookDetails book={book} login={login} onBack={() => {}} onRead={read} />);
  fireEvent.click(screen.getByRole('button', { name: 'Read' }));
  await waitFor(() => expect(read).toHaveBeenCalledOnce());
  expect(screen.queryByRole('alert')).toBeNull();
});

it('does not load foreign catalog previews using the saved service credentials', async () => {
  mocks.page.mockResolvedValue({
    title: 'Catalog',
    publications: [],
    navigation: [
      { title: 'Foreign', url: 'https://foreign.example/books', acquisition: false },
      { title: 'Categories', url: login.url + '/categories', acquisition: false },
    ],
  });
  render(<OpdsBrowser onChooseService={() => {}} onRead={async () => {}} />);
  await screen.findByRole('button', { name: 'Categories' });
  expect(screen.queryByRole('button', { name: 'Foreign' })).toBeNull();
  expect(mocks.session).not.toHaveBeenCalledWith(
    expect.stringContaining('foreign.example'),
    expect.anything(),
    undefined,
    undefined,
  );
});
