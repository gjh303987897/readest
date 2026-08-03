'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Cloud,
  CloudDownload,
  CloudUpload,
  Download,
  LoaderCircle,
  LogIn,
  LogOut,
  RefreshCw,
  Search,
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
import { ingestFile } from '@/services/ingestService';
import { eventDispatcher } from '@/utils/event';
import { formatAuthors } from '@/utils/book';
import { navigateToLogin, navigateToReader } from '@/utils/nav';
import { parseOpenWithFiles } from '@/helpers/openWith';
import BookCover from '@/components/BookCover';
import Spinner from '@/components/Spinner';
import { Toast } from '@/components/Toast';
import { useBooksSync } from './hooks/useBooksSync';
import { useBookTransferActions } from './hooks/useBookTransferActions';

const progressPercent = (book: Book) => {
  const [current, total] = book.progress ?? [0, 0];
  return total > 0 ? Math.min(100, Math.max(0, Math.round((current / total) * 100))) : 0;
};

const LibraryPage = () => {
  const _ = useTranslation();
  const router = useAppRouter();
  const { envConfig, appService } = useEnv();
  const { user, logout } = useAuth();
  const { settings } = useSettingsStore();
  const { libraryLoaded } = useLibrary();
  const library = useLibraryStore((state) => state.visibleLibrary);
  const updateBook = useLibraryStore((state) => state.updateBook);
  const updateBooks = useLibraryStore((state) => state.updateBooks);
  const checkOpenWithBooks = useLibraryStore((state) => state.checkOpenWithBooks);
  const setCheckOpenWithBooks = useLibraryStore((state) => state.setCheckOpenWithBooks);
  const clearBookData = useBookDataStore((state) => state.clearBookData);
  const { selectFiles } = useFileSelector(appService, _);
  const { pullLibrary, pushLibrary } = useBooksSync();
  const [query, setQuery] = useState('');
  const [importing, setImporting] = useState(false);
  const [busyBookHash, setBusyBookHash] = useState<string | null>(null);

  useTheme({ systemUIVisible: true, appThemeColor: 'base-100' });
  useTransferQueue(libraryLoaded);

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
    if (!window.confirm(_('Remove the local copy of {{title}}?', { title: book.title }))) return;
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
    if (!window.confirm(_('Delete {{title}} from your library?', { title: book.title }))) return;
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
      clearBookData(book.hash);
      await pushLibrary();
    } catch {
      notifyError(_('Failed to delete book'));
    } finally {
      setBusyBookHash(null);
    }
  };

  return (
    <main className='bg-base-100 text-base-content full-height flex min-h-0 flex-col'>
      <header className='border-base-300 flex min-h-16 shrink-0 items-center gap-3 border-b px-4 sm:px-6'>
        <div className='flex min-w-0 items-center gap-2'>
          <BookOpen aria-hidden='true' className='h-5 w-5 shrink-0' />
          <h1 className='truncate text-lg font-semibold'>Readest</h1>
        </div>

        <label className='bg-base-200 focus-within:ring-primary ms-auto flex h-9 min-w-0 max-w-md flex-1 items-center gap-2 rounded px-3 focus-within:ring-1'>
          <Search aria-hidden='true' className='h-4 w-4 shrink-0 opacity-60' />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className='min-w-0 flex-1 bg-transparent text-sm outline-none'
            aria-label={_('Search Books')}
            placeholder={_('Search Books')}
          />
        </label>

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
        <button
          type='button'
          className='btn btn-ghost btn-square h-9 min-h-9 w-9'
          title={_('Import Books')}
          aria-label={_('Import Books')}
          onClick={() => void handleImport()}
          disabled={importing || !appService}
        >
          {importing ? (
            <LoaderCircle className='h-4 w-4 animate-spin' />
          ) : (
            <Upload className='h-4 w-4' />
          )}
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
            <button className='btn btn-primary btn-sm' onClick={() => void handleImport()}>
              <Upload className='h-4 w-4' />
              {_('Import Books')}
            </button>
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
                    <span className='text-base-content/60 text-xs'>{percent}%</span>
                    <div className='flex items-center gap-1'>
                      <button
                        type='button'
                        className='btn btn-ghost btn-square h-7 min-h-7 w-7'
                        title={
                          !user
                            ? _('Log In')
                            : !book.uploadedAt
                              ? _('Upload Book')
                              : !book.downloadedAt
                                ? _('Download Book')
                                : _('Backed Up')
                        }
                        aria-label={
                          !book.uploadedAt
                            ? _('Upload Book')
                            : !book.downloadedAt
                              ? _('Download Book')
                              : _('Backed Up')
                        }
                        onClick={() => void handleCloudAction(book)}
                        disabled={busy || (!!book.uploadedAt && !!book.downloadedAt)}
                      >
                        {!book.uploadedAt ? (
                          <CloudUpload className='h-4 w-4' />
                        ) : !book.downloadedAt ? (
                          <CloudDownload className='h-4 w-4' />
                        ) : (
                          <Cloud className='h-4 w-4' />
                        )}
                      </button>
                      {book.uploadedAt && book.downloadedAt && (
                        <button
                          type='button'
                          className='btn btn-ghost btn-square h-7 min-h-7 w-7'
                          title={_('Remove Local Copy')}
                          aria-label={_('Remove Local Copy')}
                          onClick={() => void handleRemoveLocalCopy(book)}
                          disabled={busy}
                        >
                          <Download className='h-4 w-4' />
                        </button>
                      )}
                      <button
                        type='button'
                        className='btn btn-ghost btn-square h-7 min-h-7 w-7'
                        title={_('Delete Book')}
                        aria-label={_('Delete Book')}
                        onClick={() => void handleDelete(book)}
                        disabled={busy}
                      >
                        <Trash2 className='h-4 w-4' />
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
      <Toast />
    </main>
  );
};

export default LibraryPage;
