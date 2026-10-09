'use client';

import { AlertTriangle } from 'lucide-react';
import Dialog from '@/components/Dialog';
import { useTranslation } from '@/hooks/useTranslation';

export default function OpdsOverwriteDialog({
  title,
  onConfirm,
  onCancel,
}: {
  title: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const _ = useTranslation();
  return (
    <Dialog
      isOpen
      onClose={onCancel}
      title={_('Book already exists')}
      snapHeight={0.5}
      boxClassName='max-h-[80%] sm:!h-auto sm:!max-w-md'
      contentClassName='px-6 pb-6'
    >
      <div className='flex items-start gap-3'>
        <AlertTriangle aria-hidden='true' className='text-base-content/65 mt-1 h-5 w-5 shrink-0' />
        <div className='min-w-0'>
          <p className='break-words text-sm font-medium'>{title}</p>
          <p className='text-base-content/70 mt-2 text-sm leading-relaxed'>
            {_(
              'This book is already in your library. Continuing may overwrite its reading progress and bookmarks. Do you want to save it anyway?',
            )}
          </p>
        </div>
      </div>
      <div className='mt-6 flex flex-wrap justify-end gap-3'>
        <button type='button' className='btn btn-ghost eink-bordered' onClick={onCancel}>
          {_('Cancel')}
        </button>
        <button type='button' className='btn btn-contrast' onClick={onConfirm}>
          {_('Save anyway')}
        </button>
      </div>
    </Dialog>
  );
}
