'use client';

import { useEffect, useState } from 'react';
import { BookOpen, ChevronLeft, LoaderCircle } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import type { SavedOpdsLogin } from '@/services/opdsLoginService';
import { loadOpdsDetails, type OpdsPublication } from '@/services/opdsService';
import { OpdsCover } from './OpdsBookCard';
import { opdsProgressSetupMessage } from '@/services/opdsProgressService';
import { OpdsSaveCancelledError } from '@/services/opdsReadingService';

export default function OpdsBookDetails({
  book,
  login,
  onBack,
  onRead,
}: {
  book: OpdsPublication;
  login: SavedOpdsLogin;
  onBack: () => void;
  onRead: (book: OpdsPublication, save: boolean) => Promise<void>;
}) {
  const _ = useTranslation();
  const [details, setDetails] = useState(book);
  const [save, setSave] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!!book.detailUrl);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    const sameServer =
      !book.detailUrl || new URL(book.detailUrl).origin === new URL(login.url).origin;
    void loadOpdsDetails(
      book,
      sameServer ? { username: login.username, password: login.password } : {},
      controller.signal,
    )
      .then((details) => {
        if (!controller.signal.aborted) setDetails(details);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(error instanceof Error ? error.message : 'Failed to load OPDS catalog');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [book, login.username, login.password]);
  const read = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await onRead(details, save);
    } catch (error) {
      if (error instanceof OpdsSaveCancelledError) return;
      setError(error instanceof Error ? error.message : 'Unable to open book');
    } finally {
      setBusy(false);
    }
  };
  const fields = [
    [_('Format'), details.format],
    [_('Language'), details.language],
    [_('Publisher'), details.publisher],
    [_('Published'), details.published?.split('T')[0]],
    [_('Identifier'), details.identifier],
  ].filter(([, value]) => !!value);
  return (
    <section className='view-switch-enter flex min-h-0 flex-1 flex-col'>
      <div className='shrink-0 px-4 py-3 sm:px-6'>
        <button
          type='button'
          onClick={onBack}
          disabled={busy}
          className='btn btn-ghost btn-sm gap-2'
        >
          <ChevronLeft aria-hidden='true' className='h-4 w-4 rtl:rotate-180' />
          {_('Back')}
        </button>
      </div>
      <div className='min-h-0 flex-1 overflow-y-auto px-5 pb-10 sm:px-8'>
        <div className='mx-auto grid w-full max-w-4xl items-start gap-8 py-5 sm:grid-cols-[220px_minmax(0,1fr)] sm:gap-10'>
          <OpdsCover book={details} login={login} className='mx-auto w-40 shadow-sm sm:w-full' />
          <div className='min-w-0'>
            <p className='text-base-content/50 mb-2 text-xs'>{login.title}</p>
            <h2 className='break-words text-2xl font-semibold leading-snug tracking-tight sm:text-3xl'>
              {details.title}
            </h2>
            <p className='text-base-content/65 mt-3 text-sm'>
              {details.authors.join(', ') || _('Unknown author')}
            </p>
            {!!details.categories?.length && (
              <div className='mt-4 flex flex-wrap gap-2'>
                {details.categories.map((category) => (
                  <span
                    key={category}
                    className='eink-bordered border-base-300 rounded-md border px-2 py-1 text-xs'
                  >
                    {category}
                  </span>
                ))}
              </div>
            )}
            <div className='border-base-200 my-6 border-y py-5'>
              <div className='flex flex-wrap items-center gap-4'>
                <button
                  type='button'
                  className='btn btn-contrast min-w-28 gap-2'
                  disabled={busy || loading}
                  onClick={() => void read()}
                >
                  {busy ? (
                    <LoaderCircle aria-hidden='true' className='h-4 w-4 animate-spin' />
                  ) : (
                    <BookOpen aria-hidden='true' className='h-4 w-4' />
                  )}
                  {busy ? _('Preparing book…') : _('Read')}
                </button>
                <label className='flex cursor-pointer items-center gap-2 text-sm'>
                  <input
                    type='checkbox'
                    className='checkbox checkbox-sm'
                    checked={save}
                    disabled={busy}
                    onChange={(event) => setSave(event.target.checked)}
                  />
                  <span>{_('Save to local library')}</span>
                </label>
              </div>
              <p className='text-base-content/50 mt-3 text-xs'>
                {save
                  ? _('The book will be added to your local library before reading.')
                  : _(
                      'The book will be downloaded to the reading cache and will not be added to your library.',
                    )}
              </p>
              {!save && (
                <p
                  role='note'
                  className='eink-bordered border-base-300 bg-base-200/50 mt-3 rounded-lg border px-3 py-2 text-xs leading-relaxed'
                >
                  {_(
                    'Online reading does not save reading progress on this device. Your position will not be restored locally when you reopen the book.',
                  )}
                </p>
              )}
              <p className='text-base-content/60 mt-3 text-xs leading-relaxed'>
                {_(opdsProgressSetupMessage(login))}
              </p>
              {error && (
                <p role='alert' className='text-error mt-3 text-sm'>
                  {_(error)}
                </p>
              )}
            </div>
            <h3 className='mb-3 text-base font-semibold'>{_('About this book')}</h3>
            {loading ? (
              <p className='text-base-content/60 text-sm'>{_('Loading book details…')}</p>
            ) : (
              <p className='text-base-content/75 whitespace-pre-line break-words text-sm leading-relaxed'>
                {details.summary || _('No description available.')}
              </p>
            )}
            <dl className='mt-6 grid grid-cols-2 gap-x-6 gap-y-4'>
              {fields.map(([label, value]) => (
                <div key={label}>
                  <dt className='text-base-content/50 text-xs'>{label}</dt>
                  <dd className='mt-1 break-words text-sm'>{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}
