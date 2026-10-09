'use client';

import { ChevronRight, LibraryBig, Server } from 'lucide-react';
import Dialog from '@/components/Dialog';
import { useTranslation } from '@/hooks/useTranslation';
import { readSavedLogins, type SavedOpdsLogin } from '@/services/opdsLoginService';

export default function OpdsServicePicker({
  onSelect,
  onClose,
  onManage,
}: {
  onSelect: (login: SavedOpdsLogin) => void;
  onClose: () => void;
  onManage: () => void;
}) {
  const _ = useTranslation();
  const logins = readSavedLogins();
  return (
    <Dialog
      isOpen
      title={_('OPDS View Mode')}
      onClose={onClose}
      useOverlayScroll
      boxClassName='sm:!h-auto sm:!max-h-[75%] sm:!max-w-[560px]'
      contentClassName='!px-5 sm:!px-6'
    >
      <div className='view-switch-enter flex flex-col gap-4 py-4'>
        <div>
          <h2 className='text-lg font-semibold'>{_('Choose an OPDS service')}</h2>
          <p className='text-base-content/60 mt-1 text-sm'>
            {_('Browse books by category from a saved service.')}
          </p>
        </div>
        {logins.length ? (
          <div className='flex flex-col gap-2'>
            {logins.map((login) => (
              <button
                key={`${login.provider}:${login.url}:${login.username}`}
                type='button'
                disabled={!login.provider}
                onClick={() => onSelect(login)}
                className='eink-bordered border-base-300 hover:bg-base-200/60 flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-start transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-base-content/15 disabled:opacity-50'
              >
                <Server aria-hidden='true' className='h-5 w-5 shrink-0 opacity-60' />
                <span className='min-w-0 flex-1'>
                  <span className='block truncate font-medium'>{login.title}</span>
                  <span className='text-base-content/60 mt-1 block truncate text-xs'>
                    {login.provider === 'calibre-web'
                      ? 'Calibre-Web'
                      : login.provider === 'kavita'
                        ? 'Kavita'
                        : _('Select an OPDS provider')}
                    {login.username ? ` · ${login.username}` : ''}
                  </span>
                </span>
                <ChevronRight
                  aria-hidden='true'
                  className='h-4 w-4 shrink-0 opacity-50 rtl:rotate-180'
                />
              </button>
            ))}
          </div>
        ) : (
          <div className='text-base-content/60 flex flex-col items-center gap-3 py-8 text-center'>
            <LibraryBig aria-hidden='true' className='h-9 w-9 opacity-40' />
            <p className='text-sm'>{_('No saved OPDS services yet.')}</p>
          </div>
        )}
        <button type='button' onClick={onManage} className='btn btn-ghost eink-bordered self-end'>
          {_('Manage OPDS logins')}
        </button>
      </div>
    </Dialog>
  );
}
