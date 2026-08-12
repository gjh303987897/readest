import { useEffect, useRef, useState } from 'react';
import { LockKeyhole } from 'lucide-react';

import Dialog from '@/components/Dialog';
import { useTranslation } from '@/hooks/useTranslation';
import { usePrivacyStore } from '@/store/privacyStore';

interface PrivacyUnlockDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onUnlocked?: () => void;
}

const PrivacyUnlockDialog: React.FC<PrivacyUnlockDialogProps> = ({
  isOpen,
  onClose,
  onUnlocked,
}) => {
  const _ = useTranslation();
  const unlock = usePrivacyStore((state) => state.unlock);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setPin('');
    setError('');
    setTimeout(() => inputRef.current?.focus(), 120);
  }, [isOpen]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    const accepted = await unlock(pin);
    setBusy(false);
    if (!accepted) {
      setError(_('Incorrect PIN'));
      setPin('');
      inputRef.current?.focus();
      return;
    }
    onUnlocked?.();
    onClose();
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={_('Unlock Privacy Mode')}
      boxClassName='sm:!h-auto sm:!max-w-sm'
      contentClassName='!overflow-visible'
    >
      <form className='flex flex-col gap-5 px-5 pb-5 pt-3' onSubmit={handleSubmit}>
        <div className='flex flex-col items-center gap-3 text-center'>
          <div className='bg-base-200 eink-bordered flex h-11 w-11 items-center justify-center rounded-full'>
            <LockKeyhole className='h-5 w-5' />
          </div>
          <p className='text-base-content/70 text-sm'>{_('Enter your privacy PIN')}</p>
        </div>
        <input
          ref={inputRef}
          type='password'
          inputMode='numeric'
          pattern='[0-9]*'
          autoComplete='off'
          value={pin}
          maxLength={12}
          aria-label={_('Privacy PIN')}
          className='input input-bordered eink-bordered w-full text-center text-lg'
          onChange={(event) => {
            setPin(event.target.value.replace(/\D/g, '').slice(0, 12));
            setError('');
          }}
        />
        {error && <p className='text-error text-center text-sm'>{error}</p>}
        <div className='flex justify-end gap-2'>
          <button type='button' className='btn btn-ghost eink-bordered' onClick={onClose}>
            {_('Cancel')}
          </button>
          <button type='submit' className='btn btn-contrast' disabled={pin.length < 4 || busy}>
            {_('Unlock')}
          </button>
        </div>
      </form>
    </Dialog>
  );
};

export default PrivacyUnlockDialog;
