'use client';

import clsx from 'clsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Cloud,
  CloudDownload,
  CloudUpload,
  HardDrive,
  LibraryBig,
  LoaderCircle,
  Lock,
  LockOpen,
  LogIn,
  LogOut,
  MoreVertical,
  RefreshCw,
  Search,
  Settings,
  Trash2,
  Upload,
} from 'lucide-react';

import type { Book } from '@/types/book';
import { useEnv } from '@/context/EnvContext';
import { useAuth } from '@/context/AuthContext';
import { useLibrary } from '@/hooks/useLibrary';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { useFileSelector } from '@/hooks/useFileSelector';
import { useTransferQueue } from '@/hooks/useTransferQueue';
import { useAppRouter } from '@/hooks/useAppRouter';
import { useLibraryStore } from '@/store/libraryStore';
import { useBookDataStore } from '@/store/bookDataStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTransferStore } from '@/store/transferStore';
import { ingestFile } from '@/services/ingestService';
import { eventDispatcher } from '@/utils/event';
import { formatAuthors } from '@/utils/book';
import { navigateToLogin, navigateToReader } from '@/utils/nav';
import { parseOpenWithFiles } from '@/helpers/openWith';
import BookCover from '@/components/BookCover';
import Spinner from '@/components/Spinner';
import { Toast } from '@/components/Toast';
import WindowButtons from '@/components/WindowButtons';
import SettingsDialog from '@/components/settings/SettingsDialog';
import Dropdown from '@/components/Dropdown';
import MenuItem from '@/components/MenuItem';
import PrivacyUnlockDialog from '@/components/PrivacyUnlockDialog';
import OpdsDialog from './components/OpdsDialog';
import { usePrivacyStore } from '@/store/privacyStore';
import { useBooksSync } from './hooks/useBooksSync';
import { useBookTransferActions } from './hooks/useBookTransferActions';
import { getBookStorageStatus } from './utils/bookStorageStatus';

const progressPercent = (book: Book) => {
  const [current, total] = book.progress ?? [0, 0];
  return total > 0 ? Math.min(100, Math.max(0, Math.round((current / total) * 100))) : 0;
};

const LibraryPage = () => {
  const _ = useTranslation();
  const router = useAppRouter();
  const { envConfig, appService } = useEnv();
  const { user, logout } = useAuth();
  const { settings, isSettingsDialogOpen, setSettingsDialogBookKey, setSettingsDialogOpen } =
    useSettingsStore();
  const { libraryLoaded } = useLibrary();
  const library = useLibraryStore((state) => state.visibleLibrary);
  const updateBook = useLibraryStore((state) => state.updateBook);
  const updateBooks = useLibraryStore((state) => state.updateBooks);
  const checkOpenWithBooks = useLibraryStore((state) => state.checkOpenWithBooks);
  const setCheckOpenWithBooks = useLibraryStore((state) => state.setCheckOpenWithBooks);
  const clearBookData = useBookDataStore((state) => state.clearBookData);
  const { hasPin, isUnlocked, hiddenBookHashes, lock, hideBook, unhideBook } = usePrivacyStore();
  const { selectFiles } = useFileSelector(appService, _);
  const { pullLibrary, pushLibrary } = useBooksSync();
  const [query, setQuery] = useState('');
  const [importing, setImporting] = useState(false);
  const [busyBookHash, setBusyBookHash] = useState<string | null>(null);
  const [isUnlockDialogOpen, setUnlockDialogOpen] = useState(false);
  const [isOpdsDialogOpen, setOpdsDialogOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const showWindowControls = !!appService?.hasWindowBar && !appService.hasTrafficLight;

  useTheme({ systemUIVisible: true, appThemeColor: 'base-100' });
  useTransferQueue(libraryLoaded);
  const transfers = useTransferStore((state) => state.transfers);
  const downloadingBookHashes = useMemo(
    () =>
      new Set(
        Object.values(transfers)
          .filter(
            (transfer) =>
              transfer.type === 'download' &&
              (transfer.status === 'pending' || transfer.status === 'in_progress'),
          )
          .map((transfer) => transfer.bookHash),
      ),
    [transfers],
  );

  useEffect(() => {
    if (!isUnlocked) setQuery('');
  }, [isUnlocked]);

  const { handleBookUpload, handleBookDownload } = useBookTransferActions(
    envConfig,
    appService,
    updateBook,
    () => {},
  );

  const visibleBooks = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!term) return library;
    return library.filter((book) =>
      [book.title, formatAuthors(book.author, book.primaryLanguage), book.format]
        .filter(Boolean)
        .some((value) => value.toLocaleLowerCase().includes(term)),
    );
  }, [library, query]);

  const notifyError = (message: string) => {
    eventDispatcher.dispatch('toast', { type: 'error', message });
  };

  const importFiles = async (files: Array<File | string>) => {
    if (!appService) return;
    const imported: Book[] = [];
    for (const file of files) {
      try {
        const book = await ingestFile(
          { file, books: [...useLibraryStore.getState().library, ...imported] },
          { appService, settings, isLoggedIn: !!user },
        );
        if (book) imported.push(book);
      } catch (error) {
        console.error('Failed to import book', error);
      }
    }

    if (imported.length > 0) {
      await updateBooks(envConfig, imported);
      eventDispatcher.dispatch('toast', {
        type: 'info',
        message: _('{{count}} book(s) imported', { count: imported.length }),
      });
    }
  };

  const handleImport = async () => {
    if (!appService || importing) return;
    setImporting(true);
    try {
      const result = await selectFiles({ type: 'books', multiple: true });
      if (result.error) {
        notifyError(result.error);
        return;
      }
      const files = result.files
        .map((selected) => ('file' in selected ? selected.file : selected.path))
        .filter((file): file is File | string => !!file);
      await importFiles(files);
    } finally {
      setImporting(false);
    }
  };

  const importOpdsFile = async (file: File): Promise<boolean> => {
    if (!appService) return false;
    try {
      const book = await ingestFile(
        { file, books: useLibraryStore.getState().library },
        { appService, settings, isLoggedIn: !!user },
      );
      if (!book) return false;
      await updateBook(envConfig, book);
      return true;
    } catch (error) {
      console.error('Failed to import OPDS book', error);
      return false;
    }
  };

  useEffect(() => {
    if (!libraryLoaded || !appService || !checkOpenWithBooks || importing) return;
    setCheckOpenWithBooks(false);
    void parseOpenWithFiles(appService).then(async (files) => {
      window.OPEN_WITH_FILES = null;
      if (!files?.length) return;
      setImporting(true);
      try {
        await importFiles(files);
      } finally {
        setImporting(false);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appService, checkOpenWithBooks, importing, libraryLoaded]);

  const handleOpen = async (book: Book) => {
    if (!appService || busyBookHash) return;
    setBusyBookHash(book.hash);
    try {
      let available = await appService.isBookAvailable(book);
      if (!available && book.uploadedAt && user) {
        available = await handleBookDownload(book, { queued: false });
      }
      if (!available) {
        notifyError(_('Book file is not available'));
        return;
      }
      navigateToReader(router, [book.hash]);
    } finally {
      setBusyBookHash(null);
    }
  };

  const handleCloudAction = async (book: Book) => {
    if (!user) {
      navigateToLogin(router);
      return;
    }
    setBusyBookHash(book.hash);
    try {
      if (!book.uploadedAt) {
        await handleBookUpload(book);
      } else if (!book.downloadedAt) {
        await handleBookDownload(book, { queued: true });
      }
    } finally {
      setBusyBookHash(null);
    }
  };

  const handleRemoveLocalCopy = async (book: Book) => {
    if (!appService || busyBookHash) return;
    if (
      !window.confirm(
        _('Remove the local copy of {{title}} and keep the cloud copy?', { title: book.title }),
      )
    )
      return;
    setBusyBookHash(book.hash);
    try {
      await appService.deleteBook(book, 'local');
      await updateBook(envConfig, { ...book, downloadedAt: null });
      clearBookData(book.hash);
    } catch {
      notifyError(_('Failed to remove local copy'));
    } finally {
      setBusyBookHash(null);
    }
  };

  const handleDelete = async (book: Book) => {
    if (!appService || busyBookHash) return;
    if (book.uploadedAt && !user) {
      navigateToLogin(router);
      return;
    }
    const confirmation =
      user && book.uploadedAt
        ? _('Delete {{title}} locally and from the cloud?', { title: book.title })
        : _('Delete {{title}} from this device?', { title: book.title });
    if (!window.confirm(confirmation)) return;
    setBusyBookHash(book.hash);
    try {
      await appService.deleteBook(book, user ? 'both' : 'local');
      const deletedBook = {
        ...book,
        deletedAt: Date.now(),
        downloadedAt: null,
        coverDownloadedAt: null,
        uploadedAt: user ? null : book.uploadedAt,
      };
      await updateBook(envConfig, deletedBook);
      if (hiddenBookHashes.includes(book.hash)) await unhideBook(book.hash);
      clearBookData(book.hash);
      await pushLibrary();
    } catch {
      notifyError(_('Failed to delete book'));
    } finally {
      setBusyBookHash(null);
    }
  };

  const handlePrivacyToggle = async (book: Book) => {
    if (hiddenBookHashes.includes(book.hash)) {
      await unhideBook(book.hash);
    } else {
      await hideBook(book.hash);
    }
  };

  return (
    <main className='bg-base-100 text-base-content full-height flex min-h-0 flex-col'>
      <header
        ref={headerRef}
        className={clsx(
          'border-base-300 relative flex min-h-16 shrink-0 select-none items-center gap-3 border-b ps-4 sm:ps-6',
          showWindowControls ? 'pe-36 sm:pe-40' : 'pe-4 sm:pe-6',
        )}
      >
        <div className='flex min-w-0 shrink-0 items-center gap-2'>
          <BookOpen aria-hidden='true' className='h-5 w-5 shrink-0' />
          <h1 className='truncate text-lg font-semibold'>readest-tiny</h1>
        </div>

        <label className='exclude-title-bar-mousedown bg-base-200 focus-within:ring-primary mx-auto flex h-9 min-w-0 max-w-md flex-1 items-center gap-2 rounded px-3 focus-within:ring-1'>
          <Search aria-hidden='true' className='h-4 w-4 shrink-0 opacity-60' />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className='min-w-0 flex-1 bg-transparent text-sm outline-none'
            aria-label={_('Search Books')}
            placeholder={_('Search Books')}
          />
        </label>

        <div className='exclude-title-bar-mousedown flex shrink-0 items-center gap-2'>
          {hasPin && (
            <button
              type='button'
              className='btn btn-ghost btn-square h-9 min-h-9 w-9'
              title={isUnlocked ? _('Lock Privacy Mode') : _('Unlock Privacy Mode')}
              aria-label={isUnlocked ? _('Lock Privacy Mode') : _('Unlock Privacy Mode')}
              onClick={() => (isUnlocked ? lock() : setUnlockDialogOpen(true))}
            >
              {isUnlocked ? <LockOpen className='h-4 w-4' /> : <Lock className='h-4 w-4' />}
            </button>
          )}
          {user && (
            <button
              type='button'
              className='btn btn-ghost btn-square h-9 min-h-9 w-9'
              title={_('Sync')}
              aria-label={_('Sync')}
              onClick={() => void pullLibrary(true, true)}
            >
              <RefreshCw className='h-4 w-4' />
            </button>
          )}
          <Dropdown
            label={_('Import Books')}
            className='dropdown-end'
            buttonClassName='btn btn-ghost btn-square h-9 min-h-9 w-9'
            toggleButton={
              importing ? (
                <LoaderCircle className='h-4 w-4 animate-spin' />
              ) : (
                <Upload className='h-4 w-4' />
              )
            }
            disabled={importing || !appService}
          >
            <ul className='menu dropdown-content bg-base-100 eink-bordered z-50 w-56 rounded-lg border p-2 shadow'>
              <MenuItem
                transient
                label={_('From Local File')}
                Icon={<Upload className='h-4 w-4' />}
                onClick={() => void handleImport()}
              />
              <MenuItem
                transient
                label={_('From OPDS Catalog')}
                Icon={<LibraryBig className='h-4 w-4' />}
                onClick={() => setOpdsDialogOpen(true)}
              />
            </ul>
          </Dropdown>
          <button
            type='button'
            className='btn btn-ghost btn-square h-9 min-h-9 w-9'
            title={_('Settings')}
            aria-label={_('Settings')}
            onClick={() => {
              setSettingsDialogBookKey('');
              setSettingsDialogOpen(true);
            }}
          >
            <Settings className='h-4 w-4' />
          </button>
          <button
            type='button'
            className='btn btn-ghost btn-square h-9 min-h-9 w-9'
            title={user ? _('Log Out') : _('Log In')}
            aria-label={user ? _('Log Out') : _('Log In')}
            onClick={() => (user ? void logout() : navigateToLogin(router))}
          >
            {user ? <LogOut className='h-4 w-4' /> : <LogIn className='h-4 w-4' />}
          </button>
        </div>
        {showWindowControls && (
          <WindowButtons
            className='absolute end-4 top-1/2 z-30 -translate-y-1/2 sm:end-6'
            headerRef={headerRef}
          />
        )}
      </header>

      {!libraryLoaded ? (
        <div className='flex min-h-0 flex-1 items-center justify-center'>
          <Spinner loading />
        </div>
      ) : visibleBooks.length === 0 ? (
        <div className='flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 text-center'>
          <BookOpen className='h-10 w-10 opacity-40' />
          <p className='text-base-content/70 text-sm'>
            {query ? _('No books found') : _('Your library is empty')}
          </p>
          {!query && (
            <div className='flex flex-wrap items-center justify-center gap-2'>
              <button className='btn btn-primary btn-sm' onClick={() => void handleImport()}>
                <Upload className='h-4 w-4' />
                {_('Import Books')}
              </button>
              <button className='btn btn-ghost btn-sm' onClick={() => setOpdsDialogOpen(true)}>
                <LibraryBig className='h-4 w-4' />
                {_('From OPDS Catalog')}
              </button>
            </div>
          )}
        </div>
      ) : (
        <section
          className='grid min-h-0 flex-1 auto-rows-max grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-x-5 gap-y-7 overflow-y-auto p-4 sm:grid-cols-[repeat(auto-fill,minmax(152px,1fr))] sm:p-6'
          aria-label={_('Your Bookshelf')}
        >
          {visibleBooks.map((book) => {
            const percent = progressPercent(book);
            const busy = busyBookHash === book.hash;
            const isPrivate = hiddenBookHashes.includes(book.hash);
            const isDownloading =
              downloadingBookHashes.has(book.hash) ||
              (busy && !!book.uploadedAt && !book.downloadedAt);
            const storageStatus = getBookStorageStatus(book, isDownloading);
            const storageLabel =
              storageStatus === 'syncing'
                ? _('Syncing from cloud')
                : storageStatus === 'local'
                  ? book.uploadedAt
                    ? _('Stored locally and backed up')
                    : _('Stored locally')
                  : _('Stored in cloud');
            return (
              <article key={book.hash} className='group min-w-0'>
                <button
                  type='button'
                  className='bg-base-200 relative block aspect-[28/41] w-full overflow-hidden rounded shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-primary'
                  onClick={() => void handleOpen(book)}
                  aria-label={_('Open {{title}}', { title: book.title })}
                  disabled={busy}
                >
                  <BookCover book={book} coverFit='crop' />
                  {isPrivate && (
                    <span
                      className='bg-base-100/90 eink-bordered absolute end-2 top-2 flex h-7 w-7 items-center justify-center rounded-full'
                      title={_('Hidden in Privacy Mode')}
                      aria-hidden='true'
                    >
                      <Lock className='h-3.5 w-3.5' />
                    </span>
                  )}
                  {busy && (
                    <span className='bg-base-100/70 absolute inset-0 flex items-center justify-center'>
                      <LoaderCircle className='h-5 w-5 animate-spin' />
                    </span>
                  )}
                </button>

                <div className='mt-2 min-w-0'>
                  <h2 className='truncate text-sm font-semibold' title={book.title}>
                    {book.title}
                  </h2>
                  <p className='text-base-content/60 truncate text-xs'>
                    {formatAuthors(book.author, book.primaryLanguage) || book.format}
                  </p>
                  <div className='mt-2 h-1 w-full overflow-hidden rounded bg-base-300'>
                    <div className='bg-primary h-full' style={{ width: `${percent}%` }} />
                  </div>
                  <div className='mt-1 flex h-8 items-center justify-between'>
                    <div className='text-base-content/60 flex min-w-0 items-center gap-2 text-xs'>
                      <span>{percent}%</span>
                      <span
                        className='flex h-5 w-5 shrink-0 items-center justify-center'
                        title={storageLabel}
                        aria-label={storageLabel}
                        role='img'
                      >
                        {storageStatus === 'syncing' ? (
                          <LoaderCircle className='h-3.5 w-3.5 animate-spin' />
                        ) : storageStatus === 'local' ? (
                          <HardDrive className='h-3.5 w-3.5' />
                        ) : (
                          <Cloud className='h-3.5 w-3.5' />
                        )}
                      </span>
                    </div>
                    <div className='flex items-center gap-1'>
                      {(!book.uploadedAt || !book.downloadedAt) && (
                        <button
                          type='button'
                          className='btn btn-ghost btn-square h-7 min-h-7 w-7'
                          title={
                            !user
                              ? _('Log In')
                              : !book.uploadedAt
                                ? _('Upload Book')
                                : _('Download Book')
                          }
                          aria-label={
                            !user
                              ? _('Log In')
                              : !book.uploadedAt
                                ? _('Upload Book')
                                : _('Download Book')
                          }
                          onClick={() => void handleCloudAction(book)}
                          disabled={busy}
                        >
                          {!book.uploadedAt ? (
                            <CloudUpload className='h-4 w-4' />
                          ) : (
                            <CloudDownload className='h-4 w-4' />
                          )}
                        </button>
                      )}
                      <Dropdown
                        label={_('Book Actions')}
                        className='dropdown-end'
                        buttonClassName='btn btn-ghost btn-square h-7 min-h-7 w-7'
                        toggleButton={<MoreVertical className='h-4 w-4' />}
                        disabled={busy}
                      >
                        <ul className='menu dropdown-content bg-base-100 eink-bordered z-50 w-56 rounded-lg border p-2 shadow'>
                          {book.uploadedAt && book.downloadedAt && (
                            <MenuItem
                              transient
                              label={_('Remove Local Copy')}
                              Icon={<HardDrive className='h-4 w-4' />}
                              onClick={() => void handleRemoveLocalCopy(book)}
                            />
                          )}
                          <MenuItem
                            transient
                            label={_('Delete Book')}
                            labelClass='text-error'
                            Icon={<Trash2 className='text-error h-4 w-4' />}
                            onClick={() => void handleDelete(book)}
                          />
                          {hasPin && isUnlocked && (
                            <MenuItem
                              transient
                              label={
                                isPrivate
                                  ? _('Remove from Privacy Mode')
                                  : _('Hide in Privacy Mode')
                              }
                              Icon={<Lock className='h-4 w-4' />}
                              onClick={() => void handlePrivacyToggle(book)}
                            />
                          )}
                        </ul>
                      </Dropdown>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
      {isSettingsDialogOpen && <SettingsDialog bookKey='' initialPanel='General' />}
      <OpdsDialog
        isOpen={isOpdsDialogOpen}
        onClose={() => setOpdsDialogOpen(false)}
        onImportFile={importOpdsFile}
      />
      <PrivacyUnlockDialog isOpen={isUnlockDialogOpen} onClose={() => setUnlockDialogOpen(false)} />
      <Toast />
    </main>
  );
};

export default LibraryPage;
