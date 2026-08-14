import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadOpdsPublications = vi.hoisted(() => vi.fn());
const downloadOpdsPublication = vi.hoisted(() => vi.fn());

vi.mock('@/services/opdsService', () => ({
  loadOpdsPublications,
  downloadOpdsPublication,
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (text: string, params?: Record<string, number>) =>
    params
      ? text
          .replace('{{current}}', String(params['current']))
          .replace('{{total}}', String(params['total']))
      : text,
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

describe('OPDS catalog dialog', () => {
  it('loads the catalog and imports every selected publication', async () => {
    const onImportFile = vi.fn(async () => true);
    render(<OpdsDialog isOpen onClose={() => {}} onImportFile={onImportFile} />);

    fireEvent.change(screen.getByLabelText('Catalog URL'), {
      target: { value: 'https://books.example.com/opds' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    expect(await screen.findByText('First Book')).toBeTruthy();
    expect(screen.getByText('Second Book')).toBeTruthy();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all books' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download selected' }));

    await waitFor(() => expect(onImportFile).toHaveBeenCalledTimes(2));
    expect(downloadOpdsPublication).toHaveBeenCalledTimes(2);
  });
});
