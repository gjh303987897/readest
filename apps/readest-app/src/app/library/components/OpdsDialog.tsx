'use client';

import { useMemo, useState } from 'react';
import { BookText, ChevronLeft, Download, LoaderCircle, Search, Server } from 'lucide-react';

import Dialog from '@/components/Dialog';
import { useTranslation } from '@/hooks/useTranslation';
import {
  downloadOpdsPublication,
  loadOpdsPublications,
  type OpdsCatalog,
  type OpdsCredentials,
} from '@/services/opdsService';
import { eventDispatcher } from '@/utils/event';

interface OpdsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImportFile: (file: File) => Promise<boolean>;
}

const OpdsDialog: React.FC<OpdsDialogProps> = ({ isOpen, onClose, onImportFile }) => {
  const _ = useTranslation();
  const [catalogUrl, setCatalogUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [catalog, setCatalog] = useState<OpdsCatalog | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState('');

  const handleClose = () => {
    if (!downloading) onClose();
  };

  const credentials: OpdsCredentials = { username: username.trim(), password };
  const publications = catalog?.publications ?? [];
  const visiblePublications = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!term) return publications;
    return publications.filter((publication) =>
      [publication.title, publication.authors.join(' '), publication.format].some((value) =>
        value.toLocaleLowerCase().includes(term),
      ),
    );
  }, [publications, query]);

  const handleConnect = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!catalogUrl.trim() || loading) return;
    setLoading(true);
    setError('');
    try {
      const loadedCatalog = await loadOpdsPublications(catalogUrl, credentials);
      setCatalog(loadedCatalog);
      setSelected(new Set());
      setQuery('');
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : 'Failed to load OPDS catalog';
      setError(_(message));
    } finally {
      setLoading(false);
    }
  };

  const togglePublication = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((current) =>
      current.size === publications.length
        ? new Set()
        : new Set(publications.map((publication) => publication.id)),
    );
  };

  const handleDownload = async () => {
    if (downloading || selected.size === 0) return;
    const selectedPublications = publications.filter((publication) => selected.has(publication.id));
    setDownloading(true);
    setError('');
    setDownloadProgress({ current: 0, total: selectedPublications.length });
    let imported = 0;

    for (let index = 0; index < selectedPublications.length; index += 1) {
      const publication = selectedPublications[index]!;
      setDownloadProgress({ current: index + 1, total: selectedPublications.length });
      try {
        const file = await downloadOpdsPublication(publication, credentials);
        if (await onImportFile(file)) imported += 1;
      } catch (downloadError) {
        console.error('Failed to import OPDS publication', downloadError);
      }
    }

    setDownloading(false);
    if (imported > 0) {
      eventDispatcher.dispatch('toast', {
        type: 'info',
        message: _('{{count}} book(s) imported', { count: imported }),
      });
      setSelected(new Set());
    }
    if (imported !== selectedPublications.length) {
      setError(
        _('{{count}} book(s) could not be imported', {
          count: selectedPublications.length - imported,
        }),
      );
    }
  };

  const resetCatalog = () => {
    if (downloading) return;
    setCatalog(null);
    setSelected(new Set());
    setQuery('');
    setError('');
  };

  return (
    <Dialog
      id='opds-catalog-dialog'
      isOpen={isOpen}
      title={_('OPDS Catalog')}
      dismissible={!downloading}
      onClose={handleClose}
      boxClassName='sm:h-[78%] sm:w-[min(820px,90vw)] sm:max-w-[820px]'
      contentClassName='!flex !min-h-0 !flex-col !overflow-hidden !px-4 sm:!px-6'
    >
      {!catalog ? (
        <form className='mx-auto flex w-full max-w-lg flex-col gap-4 py-4' onSubmit={handleConnect}>
          <label className='flex flex-col gap-1.5'>
            <span className='text-sm font-medium'>{_('Catalog URL')}</span>
            <div className='eink-bordered border-base-300 bg-base-100 flex h-11 items-center gap-2 rounded-lg border px-3 focus-within:ring-2 focus-within:ring-base-content/15'>
              <Server aria-hidden='true' className='h-4 w-4 shrink-0 opacity-60' />
              <input
                type='url'
                required
                value={catalogUrl}
                onChange={(event) => setCatalogUrl(event.target.value)}
                className='min-w-0 flex-1 bg-transparent text-sm outline-none'
                aria-label={_('Catalog URL')}
                placeholder='https://example.com/opds'
                autoCapitalize='none'
                autoCorrect='off'
              />
            </div>
          </label>

          <div className='grid gap-4 sm:grid-cols-2'>
            <label className='flex min-w-0 flex-col gap-1.5'>
              <span className='text-sm font-medium'>{_('Username')}</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className='input input-bordered eink-bordered h-11 w-full rounded-lg text-sm'
                aria-label={_('Username')}
                autoCapitalize='none'
                autoComplete='username'
              />
            </label>
            <label className='flex min-w-0 flex-col gap-1.5'>
              <span className='text-sm font-medium'>{_('Password')}</span>
              <input
                type='password'
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className='input input-bordered eink-bordered h-11 w-full rounded-lg text-sm'
                aria-label={_('Password')}
                autoComplete='current-password'
              />
            </label>
          </div>

          {error && <p className='text-error text-sm'>{error}</p>}
          <button
            type='submit'
            className='btn btn-contrast mt-1 self-end'
            disabled={loading || !catalogUrl.trim()}
          >
            {loading ? (
              <LoaderCircle aria-hidden='true' className='h-4 w-4 animate-spin' />
            ) : (
              <Server aria-hidden='true' className='h-4 w-4' />
            )}
            {_('Connect')}
          </button>
        </form>
      ) : (
        <div className='flex min-h-0 flex-1 flex-col'>
          <div className='border-base-200 flex shrink-0 items-center gap-3 border-b pb-3'>
            <button
              type='button'
              className='btn btn-ghost btn-circle h-8 min-h-8 w-8 shrink-0'
              onClick={resetCatalog}
              disabled={downloading}
              title={_('Change catalog')}
              aria-label={_('Change catalog')}
            >
              <ChevronLeft aria-hidden='true' className='h-4 w-4 rtl:rotate-180' />
            </button>
            <div className='min-w-0 flex-1'>
              <h2 className='truncate text-base font-semibold'>{catalog.title}</h2>
              <p className='text-base-content/60 text-xs'>
                {_('{{count}} book(s)', { count: publications.length })}
              </p>
            </div>
            <label className='bg-base-200 focus-within:ring-base-content/15 flex h-9 min-w-0 max-w-64 flex-1 items-center gap-2 rounded-lg px-3 focus-within:ring-2'>
              <Search aria-hidden='true' className='h-4 w-4 shrink-0 opacity-60' />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className='min-w-0 flex-1 bg-transparent text-sm outline-none'
                aria-label={_('Search OPDS books')}
                placeholder={_('Search')}
              />
            </label>
          </div>

          <label className='border-base-200 flex h-11 shrink-0 cursor-pointer items-center gap-3 border-b px-2 text-sm font-medium'>
            <input
              type='checkbox'
              className='checkbox checkbox-sm'
              checked={publications.length > 0 && selected.size === publications.length}
              onChange={toggleAll}
              disabled={downloading || publications.length === 0}
              aria-label={_('Select all books')}
            />
            <span>{_('Select all books')}</span>
          </label>

          <div className='min-h-0 flex-1 overflow-y-auto' role='list'>
            {visiblePublications.map((publication) => (
              <label
                key={publication.id}
                className='border-base-200 hover:bg-base-200/60 flex min-h-14 cursor-pointer items-center gap-3 border-b px-2 py-2 transition-colors duration-150'
              >
                <input
                  type='checkbox'
                  className='checkbox checkbox-sm shrink-0'
                  checked={selected.has(publication.id)}
                  onChange={() => togglePublication(publication.id)}
                  disabled={downloading}
                  aria-label={_('Select {{title}}', { title: publication.title })}
                />
                <span className='bg-base-200 flex h-9 w-9 shrink-0 items-center justify-center rounded-md'>
                  <BookText aria-hidden='true' className='h-4 w-4 opacity-60' />
                </span>
                <span className='min-w-0 flex-1'>
                  <span className='block truncate text-sm font-medium'>{publication.title}</span>
                  <span className='text-base-content/60 block truncate text-xs'>
                    {publication.authors.join(', ') || _('Unknown author')}
                  </span>
                </span>
                <span className='text-base-content/60 shrink-0 text-xs'>{publication.format}</span>
              </label>
            ))}
            {visiblePublications.length === 0 && (
              <div className='text-base-content/60 flex h-32 items-center justify-center text-sm'>
                {_('No books found')}
              </div>
            )}
          </div>

          {error && <p className='text-error shrink-0 pt-2 text-sm'>{error}</p>}
          <div className='border-base-200 flex min-h-14 shrink-0 items-center justify-between gap-3 border-t pt-3'>
            <span className='text-base-content/60 min-w-0 text-sm'>
              {downloading
                ? _('Downloading {{current}} of {{total}}', downloadProgress)
                : _('{{count}} selected', { count: selected.size })}
            </span>
            <button
              type='button'
              className='btn btn-contrast shrink-0'
              onClick={() => void handleDownload()}
              disabled={downloading || selected.size === 0}
            >
              {downloading ? (
                <LoaderCircle aria-hidden='true' className='h-4 w-4 animate-spin' />
              ) : (
                <Download aria-hidden='true' className='h-4 w-4' />
              )}
              {_('Download selected')}
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
};

export default OpdsDialog;
