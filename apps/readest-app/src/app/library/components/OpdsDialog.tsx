'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookText,
  ChevronLeft,
  Download,
  LoaderCircle,
  Pencil,
  Save,
  Search,
  Server,
  Trash2,
  X,
} from 'lucide-react';

import Dialog from '@/components/Dialog';
import OpdsProviderSelect from './OpdsProviderSelect';
import { useTranslation } from '@/hooks/useTranslation';
import {
  downloadOpdsPublication,
  loadOpdsPublications,
  type OpdsCatalog,
  type OpdsCredentials,
  type OpdsProvider,
} from '@/services/opdsService';
import { eventDispatcher } from '@/utils/event';

interface OpdsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImportFiles: (files: File[]) => Promise<number>;
}

interface SavedOpdsLogin {
  provider?: OpdsProvider;
  url: string;
  username: string;
  password: string;
  title: string;
}

const SAVED_LOGINS_KEY = 'readest-opds-logins-v1';

const readSavedLogins = (): SavedOpdsLogin[] => {
  try {
    const stored = JSON.parse(localStorage.getItem(SAVED_LOGINS_KEY) ?? '[]');
    if (!Array.isArray(stored)) return [];
    return stored.filter((entry): entry is SavedOpdsLogin => {
      if (
        !entry ||
        typeof entry.url !== 'string' ||
        typeof entry.username !== 'string' ||
        typeof entry.password !== 'string' ||
        typeof entry.title !== 'string' ||
        (entry.provider !== undefined &&
          entry.provider !== 'calibre-web' &&
          entry.provider !== 'kavita')
      ) {
        return false;
      }
      try {
        return ['http:', 'https:'].includes(new URL(entry.url).protocol);
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
};

const OpdsDialog: React.FC<OpdsDialogProps> = ({ isOpen, onClose, onImportFiles }) => {
  const _ = useTranslation();
  const [provider, setProvider] = useState<OpdsProvider | ''>('');
  const [catalogUrl, setCatalogUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [saveLogin, setSaveLogin] = useState(false);
  const [savedLogins, setSavedLogins] = useState<SavedOpdsLogin[]>(readSavedLogins);
  const [editingLogin, setEditingLogin] = useState<SavedOpdsLogin | null>(null);
  const providerInput = useRef<HTMLButtonElement | null>(null);
  const [catalog, setCatalog] = useState<OpdsCatalog | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState('');
  const loadingController = useRef<AbortController | null>(null);
  useEffect(() => () => loadingController.current?.abort(), []);
  useEffect(() => {
    if (!isOpen) loadingController.current?.abort();
  }, [isOpen]);

  const handleClose = () => {
    if (!downloading) {
      loadingController.current?.abort();
      onClose();
    }
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

  const persistSavedLogins = (next: SavedOpdsLogin[]) => {
    try {
      localStorage.setItem(SAVED_LOGINS_KEY, JSON.stringify(next));
      setSavedLogins(next);
      return true;
    } catch {
      setError(_('Could not update saved logins on this device'));
      return false;
    }
  };

  const connect = async (
    url: string,
    login: OpdsCredentials,
    remember: boolean,
    selectedProvider: OpdsProvider,
  ) => {
    if (!url.trim() || loading) return;
    setCatalogUrl(url);
    setUsername(login.username ?? '');
    setPassword(login.password ?? '');
    setProvider(selectedProvider);
    setLoading(true);
    setError('');
    const controller = new AbortController();
    loadingController.current = controller;
    try {
      const loadedCatalog = await loadOpdsPublications(
        url,
        login,
        undefined,
        controller.signal,
        selectedProvider,
      );
      if (controller.signal.aborted) return;
      setCatalog(loadedCatalog);
      if (loadedCatalog.truncated)
        setError(_('Catalog limit reached. Only part of the catalog is shown.'));
      setSelected(new Set());
      setQuery('');
      if (remember) {
        const saved = {
          provider: selectedProvider,
          url: new URL(url.trim()).toString(),
          username: login.username ?? '',
          password: login.password ?? '',
          title: loadedCatalog.title,
        };
        persistSavedLogins([
          saved,
          ...savedLogins.filter(
            (entry) =>
              entry.url !== saved.url ||
              entry.username !== saved.username ||
              (entry.provider !== undefined && entry.provider !== saved.provider),
          ),
        ]);
        setSaveLogin(false);
      }
    } catch (loadError) {
      if (controller.signal.aborted) return;
      setError(
        loadError instanceof Error ? _(loadError.message) : _('Failed to load OPDS catalog'),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!provider) return;
    if (editingLogin) {
      let url: URL;
      try {
        url = new URL(catalogUrl.trim());
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
      } catch {
        setError(_('OPDS catalog URL must use HTTP or HTTPS'));
        return;
      }
      const updated: SavedOpdsLogin = {
        ...editingLogin,
        provider,
        url: url.toString(),
        username: username.trim(),
        password,
      };
      if (
        savedLogins.some(
          (entry) =>
            entry !== editingLogin &&
            new URL(entry.url).toString() === updated.url &&
            entry.username === updated.username &&
            (entry.provider === undefined || entry.provider === updated.provider),
        )
      ) {
        setError(_('A login for this provider, URL and username already exists.'));
        return;
      }
      if (
        persistSavedLogins(savedLogins.map((entry) => (entry === editingLogin ? updated : entry)))
      ) {
        setEditingLogin(null);
        setError('');
      }
      return;
    }
    void connect(catalogUrl, credentials, saveLogin, provider);
  };

  const editSavedLogin = (login: SavedOpdsLogin) => {
    setEditingLogin(login);
    setProvider(login.provider ?? '');
    setCatalogUrl(login.url);
    setUsername(login.username);
    setPassword(login.password);
    setSaveLogin(false);
    setError('');
    providerInput.current?.focus();
  };

  const cancelEdit = () => {
    setEditingLogin(null);
    setProvider('');
    setCatalogUrl('');
    setUsername('');
    setPassword('');
    setError('');
  };

  const removeSavedLogin = (login: SavedOpdsLogin) => {
    persistSavedLogins(
      savedLogins.filter(
        (entry) =>
          entry.url !== login.url ||
          entry.username !== login.username ||
          entry.provider !== login.provider,
      ),
    );
  };

  const selectSavedLogin = (login: SavedOpdsLogin) => {
    if (login.provider) {
      void connect(
        login.url,
        { username: login.username, password: login.password },
        false,
        login.provider,
      );
      return;
    }
    // Older saved logins retain their credentials until the provider is chosen.
    setCatalogUrl(login.url);
    setUsername(login.username);
    setPassword(login.password);
    setProvider('');
    setSaveLogin(true);
    setError(_('Choose a provider for this saved login, then connect.'));
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
    const downloadedFiles: File[] = [];
    const failed = new Set<string>();
    try {
      for (let index = 0; index < selectedPublications.length; index += 1) {
        const publication = selectedPublications[index]!;
        setDownloadProgress({ current: index + 1, total: selectedPublications.length });
        try {
          downloadedFiles.push(await downloadOpdsPublication(publication, credentials));
        } catch {
          failed.add(publication.id);
        }
      }
      const imported = downloadedFiles.length ? await onImportFiles(downloadedFiles) : 0;
      if (imported > 0) {
        eventDispatcher.dispatch('toast', {
          type: 'info',
          message: _('{{count}} book(s) imported', { count: imported }),
        });
      }
      const messages = [];
      if (failed.size)
        messages.push(_('{{count}} book(s) could not be downloaded', { count: failed.size }));
      if (imported < downloadedFiles.length) {
        messages.push(
          _('{{count}} book(s) could not be imported', {
            count: downloadedFiles.length - imported,
          }),
        );
      } else {
        setSelected(failed);
      }
      setError(messages.join(' '));
    } catch (importError) {
      setError(
        importError instanceof Error
          ? _('Failed to import books') + ': ' + importError.message
          : _('Failed to import books'),
      );
    } finally {
      setDownloading(false);
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
      title={editingLogin ? _('Edit OPDS Catalog') : _('OPDS Catalog')}
      header={
        editingLogin
          ? (requestClose) => (
              <div className='grid h-11 w-full grid-cols-[2rem_minmax(0,1fr)_2rem] items-center gap-2'>
                <button
                  type='button'
                  onClick={cancelEdit}
                  className='btn btn-ghost btn-circle h-8 min-h-8 w-8 focus-visible:ring-2 focus-visible:ring-base-content/15'
                  title={_('Back')}
                  aria-label={_('Back')}
                >
                  <ChevronLeft aria-hidden='true' className='h-4 w-4 rtl:rotate-180' />
                </button>
                <span className='truncate text-center font-bold'>{_('Edit OPDS Catalog')}</span>
                <button
                  type='button'
                  onClick={requestClose}
                  className='bg-base-300/65 btn btn-ghost btn-circle h-6 min-h-6 w-6 justify-self-end focus-visible:ring-2 focus-visible:ring-base-content/15'
                  title={_('Close')}
                  aria-label={_('Close')}
                >
                  <X aria-hidden='true' className='h-4 w-4' />
                </button>
              </div>
            )
          : undefined
      }
      dismissible={!downloading}
      onClose={handleClose}
      boxClassName='sm:h-[78%] sm:w-[min(820px,90vw)] sm:max-w-[820px]'
      useOverlayScroll={!catalog}
      contentClassName={
        catalog ? '!flex !min-h-0 !flex-col !overflow-hidden !px-4 sm:!px-6' : '!px-4 sm:!px-6'
      }
    >
      {!catalog ? (
        <form
          className='view-switch-enter mx-auto flex w-full max-w-lg flex-col gap-4 px-1 py-4'
          onSubmit={handleSubmit}
        >
          <div className='flex flex-col gap-1.5'>
            <span className='text-sm font-medium'>{_('OPDS provider')}</span>
            <OpdsProviderSelect
              value={provider}
              onChange={setProvider}
              disabled={loading}
              buttonRef={providerInput}
            />
          </div>
          <label className='flex flex-col gap-1.5'>
            <span className='text-sm font-medium'>{_('Catalog URL')}</span>
            <div className='eink-bordered border-base-300 bg-base-100 flex h-11 items-center gap-2 rounded-lg border px-3 focus-within:ring-2 focus-within:ring-base-content/15'>
              <Server aria-hidden='true' className='h-4 w-4 shrink-0 opacity-60' />
              <input
                type='url'
                required
                disabled={loading}
                value={catalogUrl}
                onChange={(event) => setCatalogUrl(event.target.value)}
                className='min-w-0 flex-1 bg-transparent text-sm outline-none'
                aria-label={_('Catalog URL')}
                placeholder={
                  provider === 'kavita'
                    ? 'https://example.com/api/opds/your-key'
                    : 'https://example.com/opds'
                }
                autoCapitalize='none'
                autoCorrect='off'
              />
            </div>
            {provider && (
              <span className='text-base-content/60 text-xs'>
                {provider === 'kavita'
                  ? _('Paste the full OPDS URL from Kavita user settings, including your key.')
                  : _('Enter your Calibre-Web server address or OPDS URL.')}
              </span>
            )}
          </label>

          <div className='grid gap-4 sm:grid-cols-2'>
            <label className='flex min-w-0 flex-col gap-1.5'>
              <span className='text-sm font-medium'>{_('Username')}</span>
              <input
                value={username}
                disabled={loading}
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
                disabled={loading}
                onChange={(event) => setPassword(event.target.value)}
                className='input input-bordered eink-bordered h-11 w-full rounded-lg text-sm'
                aria-label={_('Password')}
                autoComplete='current-password'
              />
            </label>
          </div>

          <div>
            {!editingLogin && (
              <label className='flex cursor-pointer items-center gap-2 text-sm'>
                <input
                  type='checkbox'
                  className='checkbox checkbox-sm'
                  checked={saveLogin}
                  disabled={loading}
                  onChange={(event) => setSaveLogin(event.target.checked)}
                />
                <span>{_('Save login')}</span>
              </label>
            )}
            <p className='text-base-content/60 mt-1 text-xs'>
              {_('Saved passwords are stored unencrypted on this device.')}
            </p>
          </div>

          {error && <p className='text-error text-sm'>{error}</p>}
          <div className='mt-1 flex items-center justify-end gap-2'>
            <button
              type='submit'
              className='btn btn-contrast'
              disabled={loading || !provider || !catalogUrl.trim()}
            >
              {loading ? (
                <LoaderCircle aria-hidden='true' className='h-4 w-4 animate-spin' />
              ) : editingLogin ? (
                <Save aria-hidden='true' className='h-4 w-4' />
              ) : (
                <Server aria-hidden='true' className='h-4 w-4' />
              )}
              {editingLogin ? _('Save Changes') : _('Connect')}
            </button>
          </div>

          {!editingLogin && savedLogins.length > 0 && (
            <section className='border-base-200 mt-2 border-t pt-4'>
              <h2 className='mb-2 text-sm font-semibold'>{_('Saved logins')}</h2>
              <div className='flex flex-col gap-2'>
                {savedLogins.map((login) => (
                  <div
                    key={`${login.provider ?? ''}\u0000${login.url}\u0000${login.username}`}
                    className='eink-bordered border-base-300 flex min-w-0 items-center rounded-lg border'
                  >
                    <button
                      type='button'
                      className='hover:bg-base-200/60 flex min-w-0 flex-1 items-center gap-3 rounded-s-lg px-3 py-2 text-start transition-colors'
                      onClick={() => selectSavedLogin(login)}
                      disabled={loading || !!editingLogin}
                    >
                      <Server aria-hidden='true' className='h-4 w-4 shrink-0 opacity-60' />
                      <span className='min-w-0 flex-1'>
                        <span className='block truncate text-sm font-medium'>{login.title}</span>
                        <span className='text-base-content/60 block text-xs'>
                          {login.provider === 'calibre-web'
                            ? 'Calibre-Web'
                            : login.provider === 'kavita'
                              ? 'Kavita'
                              : _('Select an OPDS provider')}
                        </span>
                        <span className='text-base-content/60 block truncate text-xs'>
                          {login.username ? `${login.username} @ ${login.url}` : login.url}
                        </span>
                      </span>
                    </button>
                    <button
                      type='button'
                      className='btn btn-ghost btn-square h-9 min-h-9 w-9 shrink-0'
                      onClick={() => editSavedLogin(login)}
                      disabled={loading || !!editingLogin}
                      title={_('Edit saved login for {{title}}', { title: login.title })}
                      aria-label={_('Edit saved login for {{title}}', { title: login.title })}
                    >
                      <Pencil aria-hidden='true' className='h-4 w-4' />
                    </button>
                    <button
                      type='button'
                      className='btn btn-ghost btn-square h-9 min-h-9 w-9 shrink-0'
                      onClick={() => removeSavedLogin(login)}
                      disabled={loading || !!editingLogin}
                      title={_('Remove saved login for {{title}}', { title: login.title })}
                      aria-label={_('Remove saved login for {{title}}', { title: login.title })}
                    >
                      <Trash2 aria-hidden='true' className='h-4 w-4' />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </form>
      ) : (
        <div className='view-switch-enter flex min-h-0 flex-1 flex-col'>
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
