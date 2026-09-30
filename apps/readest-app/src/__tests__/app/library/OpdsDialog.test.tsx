import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loadOpdsPublications = vi.hoisted(() => vi.fn());
const downloadOpdsPublication = vi.hoisted(() => vi.fn());

vi.mock('@/services/opdsService', () => ({
  loadOpdsPublications,
  downloadOpdsPublication,
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (text: string, params?: Record<string, string | number>) =>
    Object.entries(params ?? {}).reduce(
      (translated, [key, value]) => translated.replace(`{{${key}}}`, String(value)),
      text,
    ),
}));

vi.mock('@/components/Dialog', () => ({
  default: ({
    isOpen,
    children,
    title,
  }: {
    isOpen: boolean;
    children: React.ReactNode;
    title: string;
  }) =>
    isOpen ? (
      <div role='dialog' aria-label={title}>
        {children}
      </div>
    ) : null,
}));

const { default: OpdsDialog } = await import('@/app/library/components/OpdsDialog');

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  loadOpdsPublications.mockResolvedValue({
    title: 'All Books',
    publications: [
      {
        id: 'book-1',
        title: 'First Book',
        authors: ['First Author'],
        format: 'EPUB',
        downloadUrl: 'https://example.com/1.epub',
      },
      {
        id: 'book-2',
        title: 'Second Book',
        authors: ['Second Author'],
        format: 'PDF',
        downloadUrl: 'https://example.com/2.pdf',
      },
    ],
  });
  downloadOpdsPublication.mockImplementation(
    async (publication: { title: string }) => new File(['book'], `${publication.title}.epub`),
  );
});

afterEach(cleanup);

describe('OPDS catalog dialog', () => {
  it('loads the catalog and imports every selected publication', async () => {
    const onImportFiles = vi.fn(async (files: File[]) => files.length);
    render(<OpdsDialog isOpen onClose={() => {}} onImportFiles={onImportFiles} />);

    fireEvent.change(screen.getByLabelText('Catalog URL'), {
      target: { value: 'https://books.example.com/opds' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    expect(await screen.findByText('First Book')).toBeTruthy();
    expect(screen.getByText('Second Book')).toBeTruthy();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all books' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download selected' }));

    await waitFor(() => expect(onImportFiles).toHaveBeenCalledTimes(1));
    expect(onImportFiles).toHaveBeenCalledWith(
      expect.arrayContaining([expect.any(File), expect.any(File)]),
    );
    expect(downloadOpdsPublication).toHaveBeenCalledTimes(2);
  });

  it('saves a successful login and reconnects when its saved entry is clicked', async () => {
    const props = { isOpen: true, onClose: () => {}, onImportFiles: async () => 0 };
    const { unmount } = render(<OpdsDialog {...props} />);

    fireEvent.change(screen.getByLabelText('Catalog URL'), {
      target: { value: 'https://books.example.com/opds' },
    });
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Save login' }));
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(await screen.findByText('First Book')).toBeTruthy();

    unmount();
    render(<OpdsDialog {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /^All Books/ }));

    expect(await screen.findByText('First Book')).toBeTruthy();
    expect(loadOpdsPublications).toHaveBeenLastCalledWith('https://books.example.com/opds', {
      username: 'alice',
      password: 'secret',
    });
  });

  it('keeps failed logins out of the saved list and lets users remove saved entries', async () => {
    const props = { isOpen: true, onClose: () => {}, onImportFiles: async () => 0 };
    loadOpdsPublications.mockRejectedValueOnce(new Error('OPDS authentication failed'));
    const { unmount } = render(<OpdsDialog {...props} />);

    fireEvent.change(screen.getByLabelText('Catalog URL'), {
      target: { value: 'https://books.example.com/opds' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Save login' }));
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(await screen.findByText('OPDS authentication failed')).toBeTruthy();
    expect(screen.queryByText('Saved logins')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(await screen.findByText('First Book')).toBeTruthy();
    unmount();

    render(<OpdsDialog {...props} />);
    expect(screen.getByText('Saved logins')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove saved login for All Books' }));
    expect(screen.queryByText('Saved logins')).toBeNull();
  });

  it('updates the password for an existing catalog and username', async () => {
    const props = { isOpen: true, onClose: () => {}, onImportFiles: async () => 0 };
    const first = render(<OpdsDialog {...props} />);
    fireEvent.change(screen.getByLabelText('Catalog URL'), {
      target: { value: 'https://books.example.com/opds' },
    });
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'old-password' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Save login' }));
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(await screen.findByText('First Book')).toBeTruthy();
    first.unmount();

    const second = render(<OpdsDialog {...props} />);
    fireEvent.change(screen.getByLabelText('Catalog URL'), {
      target: { value: 'https://books.example.com/opds' },
    });
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'new-password' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Save login' }));
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(await screen.findByText('First Book')).toBeTruthy();
    second.unmount();

    render(<OpdsDialog {...props} />);
    expect(screen.getAllByRole('button', { name: /^All Books/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /^All Books/ }));
    expect(await screen.findByText('First Book')).toBeTruthy();
    expect(loadOpdsPublications).toHaveBeenLastCalledWith('https://books.example.com/opds', {
      username: 'alice',
      password: 'new-password',
    });
  });
});
