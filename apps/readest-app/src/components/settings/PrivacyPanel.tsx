import { useEffect, useState } from 'react';
import { Lock, ShieldCheck, Trash2 } from 'lucide-react';

import { useTranslation } from '@/hooks/useTranslation';
import { isValidPrivacyPin } from '@/services/privacyService';
import { usePrivacyStore } from '@/store/privacyStore';
import type { SettingsPanelPanelProp } from './SettingsDialog';
import { BoxedList, SettingsInput, SettingsRow, Tips } from './primitives';

const PrivacyPanel: React.FC<SettingsPanelPanelProp> = ({ onRegisterReset }) => {
  const _ = useTranslation();
  const { hasPin, isUnlocked, hiddenBookHashes, setPin, changePin, removePin, unlock, lock } =
    usePrivacyStore();
  const [currentPin, setCurrentPin] = useState('');
  const [nextPin, setNextPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    onRegisterReset(() => {});
    // Register once when the panel mounts; the parent callback is recreated on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearFields = () => {
    setCurrentPin('');
    setNextPin('');
    setConfirmPin('');
  };

  const savePin = async () => {
    if (!isValidPrivacyPin(nextPin)) {
      setStatus(_('PIN must contain 4 to 12 digits'));
      return;
    }
    if (nextPin !== confirmPin) {
      setStatus(_('PINs do not match'));
      return;
    }
    setBusy(true);
    let accepted = true;
    if (hasPin) {
      accepted = await changePin(currentPin, nextPin);
    } else {
      await setPin(nextPin);
    }
    setBusy(false);
    setStatus(accepted ? _('Privacy PIN saved') : _('Incorrect PIN'));
    if (accepted) clearFields();
  };

  const disablePrivacyMode = async () => {
    setBusy(true);
    const accepted = await removePin(currentPin);
    setBusy(false);
    setStatus(accepted ? _('Privacy mode disabled') : _('Incorrect PIN'));
    if (accepted) clearFields();
  };

  const unlockPrivacyMode = async () => {
    setBusy(true);
    const accepted = await unlock(currentPin);
    setBusy(false);
    setStatus(accepted ? _('Privacy mode unlocked') : _('Incorrect PIN'));
    if (accepted) setCurrentPin('');
  };

  const pinInput = (value: string, setter: (value: string) => void, label: string) => (
    <SettingsInput
      type='password'
      inputMode='numeric'
      pattern='[0-9]*'
      autoComplete='off'
      maxLength={12}
      value={value}
      aria-label={label}
      placeholder={_('4-12 digits')}
      onChange={(event) => {
        setter(event.target.value.replace(/\D/g, '').slice(0, 12));
        setStatus('');
      }}
    />
  );

  return (
    <div className='my-4 space-y-6'>
      <div>
        <h2 className='mb-1.5 text-lg font-semibold tracking-tight'>{_('Privacy')}</h2>
        <p className='text-base-content/70 text-sm leading-relaxed'>
          {_('Hide selected books and require a PIN before showing their related data.')}
        </p>
      </div>

      <BoxedList title={_('Privacy Mode')}>
        <SettingsRow
          label={hasPin ? _('Privacy mode enabled') : _('Set privacy PIN')}
          description={
            hasPin
              ? isUnlocked
                ? _('{{count}} hidden book(s)', { count: hiddenBookHashes.length })
                : _('Hidden books are not shown while privacy mode is locked')
              : _('Use a numeric PIN with 4 to 12 digits')
          }
        >
          {hasPin ? <ShieldCheck className='h-5 w-5' /> : <Lock className='h-5 w-5 opacity-60' />}
        </SettingsRow>
        {hasPin && (
          <SettingsRow label={_('Current PIN')}>
            {pinInput(currentPin, setCurrentPin, _('Current PIN'))}
          </SettingsRow>
        )}
        {hasPin && !isUnlocked && (
          <SettingsRow label={_('Unlock Privacy Mode')}>
            <button
              type='button'
              className='btn btn-contrast btn-sm'
              disabled={busy || currentPin.length < 4}
              onClick={() => void unlockPrivacyMode()}
            >
              <ShieldCheck className='h-4 w-4' />
              {_('Unlock')}
            </button>
          </SettingsRow>
        )}
        <SettingsRow label={hasPin ? _('New PIN') : _('PIN')}>
          {pinInput(nextPin, setNextPin, hasPin ? _('New PIN') : _('PIN'))}
        </SettingsRow>
        <SettingsRow label={_('Confirm PIN')}>
          {pinInput(confirmPin, setConfirmPin, _('Confirm PIN'))}
        </SettingsRow>
        <SettingsRow label={hasPin ? _('Change PIN') : _('Enable Privacy Mode')}>
          <button
            type='button'
            className='btn btn-contrast btn-sm'
            disabled={busy}
            onClick={() => void savePin()}
          >
            <ShieldCheck className='h-4 w-4' />
            {_('Save')}
          </button>
        </SettingsRow>
        {hasPin && isUnlocked && (
          <SettingsRow label={_('Lock Privacy Mode')}>
            <button type='button' className='btn btn-ghost btn-sm eink-bordered' onClick={lock}>
              <Lock className='h-4 w-4' />
              {_('Lock')}
            </button>
          </SettingsRow>
        )}
        {hasPin && (
          <SettingsRow label={_('Disable Privacy Mode')}>
            <button
              type='button'
              className='btn btn-ghost btn-sm text-error eink-bordered'
              disabled={busy || currentPin.length < 4}
              onClick={() => void disablePrivacyMode()}
            >
              <Trash2 className='h-4 w-4' />
              {_('Disable')}
            </button>
          </SettingsRow>
        )}
      </BoxedList>

      {status && <p className='text-center text-sm'>{status}</p>}
      <Tips>
        {_(
          'Privacy mode hides books on this device, but it does not encrypt or rename the original book files.',
        )}
      </Tips>
    </div>
  );
};

export default PrivacyPanel;
