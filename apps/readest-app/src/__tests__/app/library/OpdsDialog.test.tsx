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
    header,
    onClose,
  }: {
    isOpen: boolean;
    children: React.ReactNode;
    title: string;
    header?: React.ReactNode | ((onClose: () => void) => React.ReactNode);
    onClose: () => void;
  }) =>
    isOpen ? (
      <div role='dialog' aria-label={title}>
        {typeof header === 'function' ? header(onClose) : header}
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

const selectProvider = (name: 'Calibre-Web' | 'Kavita') => {
  fireEvent.click(screen.getByRole('combobox', { name: 'OPDS provider' }));
  fireEvent.click(screen.getByRole('option', { name }));
};

describe('OPDS catalog dialog', () => {
  it('selects providers with the keyboard without submitting the login form', () => {
    render(<OpdsDialog isOpen onClose={() => {}} onImportFiles={async () => 0} />);
    const picker = screen.getByRole('combobox', { name: 'OPDS provider' });
    picker.focus();
    fireEvent.keyDown(picker, { key: 'ArrowDown' });
    expect(screen.getAllByRole('option')).toHaveLength(2);
    fireEvent.keyDown(picker, { key: 'End' });
    expect((picker as HTMLButtonElement).value).toBe('');
    fireEvent.keyDown(picker, { key: 'Enter' });
    expect((picker as HTMLButtonElement).value).toBe('kavita');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(picker);
    expect(loadOpdsPublications).not.toHaveBeenCalled();
    fireEvent.click(picker);
    expect(screen.getByRole('option', { name: 'Kavita' }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  it('dismisses unconfirmed provider changes with Escape, outside click and Tab', () => {
    const onClose = vi.fn();
    render(<OpdsDialog isOpen onClose={onClose} onImportFiles={async () => 0} />);
    selectProvider('Calibre-Web');
    const picker = screen.getByRole('combobox', { name: 'OPDS provider' });
    fireEvent.click(picker);
    fireEvent.keyDown(picker, { key: 'ArrowDown' });
    const escapeEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    fireEvent(picker, escapeEvent);
    expect(escapeEvent.defaultPrevented).toBe(true);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect((picker as HTMLButtonElement).value).toBe('calibre-web');
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(picker);
    fireEvent.pointerDown(screen.getByLabelText('Catalog URL'));
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.click(picker);
    fireEvent.keyDown(picker, { key: 'Tab' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect((picker as HTMLButtonElement).value).toBe('calibre-web');
  });

  it('requires manual provider selection before connecting', () => {
    render(<OpdsDialog isOpen onClose={() => {}} onImportFiles={async () => 0} />);
    fireEvent.change(screen.getByLabelText('Catalog URL'), {
      target: { value: 'https://books.example.com/opds' },
    });
    expect((screen.getByRole('button', { name: 'Connect' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(loadOpdsPublications).not.toHaveBeenCalled();
  });

  it('saves and restores the selected Kavita provider', async () => {
    const props = { isOpen: true, onClose: () => {}, onImportFiles: async () => 0 };
    const { unmount } = render(<OpdsDialog {...props} />);
    const url = 'https://books.example.com/api/opds/user-key';
    selectProvider('Kavita');
    fireEvent.change(screen.getByLabelText('Catalog URL'), { target: { value: url } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Save login' }));
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByText('First Book');
    expect(JSON.parse(localStorage.getItem('readest-opds-logins-v1')!)).toEqual([
      expect.objectContaining({ provider: 'kavita', url }),
    ]);
    unmount();
    render(<OpdsDialog {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /^All Books/ }));
    await screen.findByText('First Book');
    expect(loadOpdsPublications).toHaveBeenLastCalledWith(
      url,
      { username: '', password: '' },
      undefined,
      expect.any(AbortSignal),
      'kavita',
    );
  });

  it('keeps legacy saved credentials and lets users assign their provider', async () => {
    const url = 'https://books.example.com/opds';
    localStorage.setItem(
      'readest-opds-logins-v1',
      JSON.stringify([{ url, username: 'alice', password: 'secret', title: 'Old Library' }]),
    );
    render(<OpdsDialog isOpen onClose={() => {}} onImportFiles={async () => 0} />);
    fireEvent.click(screen.getByRole('button', { name: /^Old Library/ }));
    expect(loadOpdsPublications).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Username') as HTMLInputElement).value).toBe('alice');
    expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('secret');
    selectProvider('Calibre-Web');
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByText('First Book');
    expect(JSON.parse(localStorage.getItem('readest-opds-logins-v1')!)).toEqual([
      expect.objectContaining({ provider: 'calibre-web', username: 'alice', password: 'secret' }),
    ]);
  });

  it('animates the content when switching between login and catalog views', async () => {
    render(<OpdsDialog isOpen onClose={() => {}} onImportFiles={async () => 0} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('form')?.classList.contains('view-switch-enter')).toBe(true);

    selectProvider('Calibre-Web');
    fireEvent.change(screen.getByLabelText('Catalog URL'), {
      target: { value: 'https://books.example.com/opds' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(await screen.findByText('First Book')).toBeTruthy();
    expect(dialog.querySelector('.view-switch-enter')?.textContent).toContain('First Book');

    fireEvent.click(screen.getByRole('button', { name: 'Change catalog' }));
    expect(dialog.querySelector('form')?.classList.contains('view-switch-enter')).toBe(true);
  });

  it('loads the catalog and imports every selected publication', async () => {
    const onImportFiles = vi.fn(async (files: File[]) => files.length);
    render(<OpdsDialog isOpen onClose={() => {}} onImportFiles={onImportFiles} />);

    selectProvider('Calibre-Web');
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

    selectProvider('Calibre-Web');
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
    expect(loadOpdsPublications).toHaveBeenLastCalledWith(
      'https://books.example.com/opds',
      {
        username: 'alice',
        password: 'secret',
      },
      undefined,
      expect.any(AbortSignal),
      'calibre-web',
    );
  });

  it('keeps failed logins out of the saved list and lets users remove saved entries', async () => {
    const props = { isOpen: true, onClose: () => {}, onImportFiles: async () => 0 };
    loadOpdsPublications.mockRejectedValueOnce(new Error('OPDS authentication failed'));
    const { unmount } = render(<OpdsDialog {...props} />);

    selectProvider('Calibre-Web');
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
    selectProvider('Calibre-Web');
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
    selectProvider('Calibre-Web');
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
    expect(loadOpdsPublications).toHaveBeenLastCalledWith(
      'https://books.example.com/opds',
      {
        username: 'alice',
        password: 'new-password',
      },
      undefined,
      expect.any(AbortSignal),
      'calibre-web',
    );
  });
});

describe('editing saved OPDS logins', () => {
  const original = {
    provider: 'calibre-web',
    url: 'https://books.example.com/opds',
    username: 'alice',
    password: 'old-password',
    title: 'My Library',
  };
  const other = {
    ...original,
    url: 'https://other.example.com/opds',
    title: 'Other Library',
  };
  const readLogins = () => JSON.parse(localStorage.getItem('readest-opds-logins-v1')!);

  beforeEach(() => {
    localStorage.setItem('readest-opds-logins-v1', JSON.stringify([original, other]));
  });

  it('replaces the original login when its provider, URL and credentials change, then reconnects', async () => {
    const props = { isOpen: true, onClose: () => {}, onImportFiles: async () => 0 };
    const { unmount } = render(<OpdsDialog {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit saved login for My Library' }));
    expect((screen.getByLabelText('OPDS provider') as HTMLButtonElement).value).toBe('calibre-web');
    expect((screen.getByLabelText('Catalog URL') as HTMLInputElement).value).toBe(original.url);
    expect((screen.getByLabelText('Username') as HTMLInputElement).value).toBe('alice');
    expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('old-password');

    const url = 'https://new.example.com/api/opds/new-key';
    selectProvider('Kavita');
    fireEvent.change(screen.getByLabelText('Catalog URL'), { target: { value: url } });
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: ' bob ' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'new-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(readLogins()).toEqual([
      { ...original, provider: 'kavita', url, username: 'bob', password: 'new-password' },
      other,
    ]);
    expect(loadOpdsPublications).not.toHaveBeenCalled();
    unmount();
    render(<OpdsDialog {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /^My Library/ }));
    await screen.findByText('First Book');
    expect(loadOpdsPublications).toHaveBeenLastCalledWith(
      url,
      { username: 'bob', password: 'new-password' },
      undefined,
      expect.any(AbortSignal),
      'kavita',
    );
  });

  it('returns to saved logins without saving edits and still connects with the original login', async () => {
    render(<OpdsDialog isOpen onClose={() => {}} onImportFiles={async () => 0} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit saved login for My Library' }));
    expect(screen.getByRole('dialog', { name: 'Edit OPDS Catalog' })).toBeTruthy();
    expect(screen.queryByText('Saved logins')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'unsaved-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('dialog', { name: 'OPDS Catalog' })).toBeTruthy();
    expect(screen.getByText('Saved logins')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    expect(readLogins()).toEqual([original, other]);
    fireEvent.click(screen.getByRole('button', { name: /^My Library/ }));
    await screen.findByText('First Book');
    expect(loadOpdsPublications).toHaveBeenLastCalledWith(
      original.url,
      { username: original.username, password: original.password },
      undefined,
      expect.any(AbortSignal),
      original.provider,
    );
  });

  it('preserves the original record and edited fields when storage fails, allowing retry', () => {
    render(<OpdsDialog isOpen onClose={() => {}} onImportFiles={async () => 0} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit saved login for My Library' }));
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'new-password' } });
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('disk full');
    });
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
      expect(screen.getByText('Could not update saved logins on this device')).toBeTruthy();
      expect(readLogins()).toEqual([original, other]);
      expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('new-password');
      fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
      expect(readLogins()).toEqual([{ ...original, password: 'new-password' }, other]);
      expect(screen.queryByText('Could not update saved logins on this device')).toBeNull();
    } finally {
      write.mockRestore();
    }
  });

  it('rejects duplicate login identities without overwriting either saved record', () => {
    render(<OpdsDialog isOpen onClose={() => {}} onImportFiles={async () => 0} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit saved login for My Library' }));
    fireEvent.change(screen.getByLabelText('Catalog URL'), { target: { value: other.url } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(
      screen.getByText('A login for this provider, URL and username already exists.'),
    ).toBeTruthy();
    expect(readLogins()).toEqual([original, other]);
  });

  it('requires a provider for legacy logins and saves the assigned provider in place', () => {
    const { provider: _provider, ...legacy } = original;
    localStorage.setItem('readest-opds-logins-v1', JSON.stringify([legacy, other]));
    render(<OpdsDialog isOpen onClose={() => {}} onImportFiles={async () => 0} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit saved login for My Library' }));
    expect(
      (screen.getByRole('button', { name: 'Save Changes' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    selectProvider('Calibre-Web');
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(readLogins()).toEqual([original, other]);
    expect(loadOpdsPublications).not.toHaveBeenCalled();
  });

  it('rejects non-HTTP catalog URLs without modifying saved logins', () => {
    render(<OpdsDialog isOpen onClose={() => {}} onImportFiles={async () => 0} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit saved login for My Library' }));
    fireEvent.change(screen.getByLabelText('Catalog URL'), {
      target: { value: 'ftp://books.example.com/opds' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(screen.getByText('OPDS catalog URL must use HTTP or HTTPS')).toBeTruthy();
    expect(readLogins()).toEqual([original, other]);
  });
});

it('recovers from failed OPDS persistence and leaves retry available', async () => {
  const importFiles = vi.fn().mockRejectedValue(new Error('disk full'));
  render(<OpdsDialog isOpen onClose={() => {}} onImportFiles={importFiles} />);
  selectProvider('Calibre-Web');
  fireEvent.change(screen.getByLabelText('Catalog URL'), {
    target: { value: 'https://books.example.com/opds' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
  await screen.findByText('First Book');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select all books' }));
  fireEvent.click(screen.getByRole('button', { name: 'Download selected' }));
  expect(await screen.findByText('Failed to import books: disk full')).toBeTruthy();
  expect(
    (screen.getByRole('button', { name: 'Download selected' }) as HTMLButtonElement).disabled,
  ).toBe(false);
});

it('reports all download failures without attempting an empty import', async () => {
  downloadOpdsPublication
    .mockRejectedValueOnce(new Error('offline'))
    .mockRejectedValueOnce(new Error('offline'));
  const importFiles = vi.fn();
  render(<OpdsDialog isOpen onClose={() => {}} onImportFiles={importFiles} />);
  selectProvider('Calibre-Web');
  fireEvent.change(screen.getByLabelText('Catalog URL'), {
    target: { value: 'https://books.example.com/opds' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
  await screen.findByText('First Book');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select all books' }));
  fireEvent.click(screen.getByRole('button', { name: 'Download selected' }));
  expect(await screen.findByText('2 book(s) could not be downloaded')).toBeTruthy();
  expect(importFiles).not.toHaveBeenCalled();
  expect(
    (screen.getByRole('button', { name: 'Download selected' }) as HTMLButtonElement).disabled,
  ).toBe(false);
});
