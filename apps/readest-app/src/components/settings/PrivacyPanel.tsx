import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { CircleAlert, Eye, EyeOff, Fingerprint, Lock, ShieldCheck, Trash2 } from 'lucide-react';

import { useTranslation } from '@/hooks/useTranslation';
import { isValidPrivacyPin } from '@/services/privacyService';
import { usePrivacyStore } from '@/store/privacyStore';
import type { SettingsPanelPanelProp } from './SettingsDialog';
import { BoxedList, SettingsInput, SettingsRow, Tips } from './primitives';

type PinField = 'current' | 'next' | 'confirm';

const PinInput = ({
  label,
  value,
  onChange,
  inputRef,
  disabled,
  error,
  onEnter,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  disabled: boolean;
  error?: string;
  onEnter: () => void;
}) => {
  const _ = useTranslation();
  const id = useId();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!value) setVisible(false);
  }, [value]);
  useEffect(() => {
    if (error && !disabled) inputRef.current?.focus();
  }, [error, disabled, inputRef]);
  const visibilityLabel = `${visible ? _('Hide password') : _('Show password')}: ${label}`;

  return (
    <SettingsRow
      label={<label htmlFor={id}>{label}</label>}
      className='flex-wrap gap-y-1 py-2 sm:flex-nowrap sm:py-0'
    >
      <div className='flex w-full min-w-0 flex-col sm:w-64 sm:max-w-[65%]'>
        <div className='hover:bg-base-200/60 focus-within:bg-base-200/60 flex min-w-0 items-center gap-1 rounded-md transition-colors'>
          <SettingsInput
            ref={inputRef}
            id={id}
            type={visible ? 'text' : 'password'}
            inputMode='numeric'
            pattern='[0-9]*'
            autoComplete='off'
            spellCheck={false}
            maxLength={12}
            value={value}
            disabled={disabled}
            aria-label={label}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-error` : undefined}
            placeholder={_('4-12 digits')}
            className='!min-w-0 !max-w-none flex-1 !pe-2 font-mono tracking-widest placeholder:font-sans placeholder:tracking-normal hover:!bg-transparent focus:!bg-transparent'
            onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 12))}
            onKeyDownCapture={(event) => {
              if (event.key === 'Enter' && !disabled) {
                event.preventDefault();
                onEnter();
              }
            }}
          />
          <button
            type='button'
            className='btn btn-ghost btn-square h-9 min-h-9 w-9 shrink-0 focus-visible:ring-2 focus-visible:ring-base-content/15'
            aria-label={visibilityLabel}
            aria-pressed={visible}
            title={visibilityLabel}
            disabled={disabled || !value}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setVisible(!visible);
              inputRef.current?.focus();
            }}
          >
            {visible ? (
              <EyeOff aria-hidden='true' className='h-4 w-4' />
            ) : (
              <Eye aria-hidden='true' className='h-4 w-4' />
            )}
          </button>
        </div>
        {error && (
          <p
            id={`${id}-error`}
            role='alert'
            className='text-error mt-1 flex items-start gap-1 text-[0.85em] leading-snug'
          >
            <CircleAlert aria-hidden='true' className='mt-0.5 h-3.5 w-3.5 shrink-0' />
            {error}
          </p>
        )}
      </div>
    </SettingsRow>
  );
};

const PrivacyPanel: React.FC<SettingsPanelPanelProp> = ({ onRegisterReset }) => {
  const _ = useTranslation();
  const {
    hasPin,
    isUnlocked,
    isCloudUnlockRequired,
    hiddenBookHashes,
    biometricEnabled,
    setPin,
    changePin,
    removePin,
    unlock,
    unlockWithBiometric,
    lock,
    setBiometricEnabled,
  } = usePrivacyStore();
  const [currentPin, setCurrentPin] = useState('');
  const [nextPin, setNextPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [pinErrors, setPinErrors] = useState<Partial<Record<PinField, string>>>({});
  const currentPinRef = useRef<HTMLInputElement>(null);
  const nextPinRef = useRef<HTMLInputElement>(null);
  const confirmPinRef = useRef<HTMLInputElement>(null);

  const showPinError = (field: PinField, message: string) => {
    setStatus('');
    setPinErrors({ [field]: message });
  };

  useEffect(() => {
    onRegisterReset(() => {});
    // Register once when the panel mounts; the parent callback is recreated on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Check if biometric is available
    const checkBiometric = async () => {
      try {
        const { biometricService } = await import('@/services/biometricService');
        const available = await biometricService.isAvailable();
        setBiometricAvailable(available);
      } catch {
        setBiometricAvailable(false);
      }
    };
    void checkBiometric();
  }, []);

  const clearFields = () => {
    setCurrentPin('');
    setNextPin('');
    setConfirmPin('');
    setPinErrors({});
  };

  const savePin = async () => {
    if (busy) return;
    if (hasPin && !isValidPrivacyPin(currentPin)) {
      showPinError('current', _('PIN must contain 4 to 12 digits'));
      return;
    }
    if (!isValidPrivacyPin(nextPin)) {
      showPinError('next', _('PIN must contain 4 to 12 digits'));
      return;
    }
    if (nextPin !== confirmPin) {
      showPinError('confirm', _('PINs do not match'));
      return;
    }
    setBusy(true);
    try {
      let accepted = true;
      if (hasPin) accepted = await changePin(currentPin, nextPin);
      else await setPin(nextPin);
      if (accepted) {
        setStatus(_('Privacy PIN saved'));
        clearFields();
      } else showPinError('current', _('Incorrect PIN'));
    } catch {
      setStatus(_('Failed to save privacy PIN'));
    } finally {
      setBusy(false);
    }
  };

  const disablePrivacyMode = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const accepted = await removePin(currentPin);
      if (accepted) {
        setStatus(_('Privacy mode disabled'));
        clearFields();
      } else showPinError('current', _('Incorrect PIN'));
    } catch {
      setStatus(_('Failed to disable Privacy Mode'));
    } finally {
      setBusy(false);
    }
  };

  const unlockPrivacyMode = async () => {
    if (busy) return;
    if (!isValidPrivacyPin(currentPin)) {
      showPinError('current', _('PIN must contain 4 to 12 digits'));
      return;
    }
    setBusy(true);
    const accepted = await unlock(currentPin);
    setBusy(false);
    if (accepted) {
      setStatus(_('Privacy mode unlocked'));
      setCurrentPin('');
      setPinErrors({});
    } else showPinError('current', _('Incorrect PIN'));
  };

  const toggleBiometric = () => {
    setBiometricEnabled(!biometricEnabled);
    setStatus(!biometricEnabled ? _('Biometric unlock enabled') : _('Biometric unlock disabled'));
  };

  const updatePin = (setter: (value: string) => void, value: string) => {
    setter(value);
    setStatus('');
    setPinErrors({});
  };

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
            isCloudUnlockRequired
              ? _('Synced privacy settings require your PIN before books can be shown')
              : hasPin
                ? isUnlocked
                  ? _('{{count}} hidden book(s)', { count: hiddenBookHashes.length })
                  : _('Hidden books are not shown while privacy mode is locked')
                : _('Use a numeric PIN with 4 to 12 digits')
          }
        >
          {hasPin ? <ShieldCheck className='h-5 w-5' /> : <Lock className='h-5 w-5 opacity-60' />}
        </SettingsRow>
        {hasPin && (
          <PinInput
            label={_('Current PIN')}
            value={currentPin}
            onChange={(value) => updatePin(setCurrentPin, value)}
            inputRef={currentPinRef}
            disabled={busy}
            error={pinErrors.current}
            onEnter={() => (isUnlocked ? nextPinRef.current?.focus() : void unlockPrivacyMode())}
          />
        )}
        {hasPin && !isUnlocked && (
          <>
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
            {biometricAvailable && biometricEnabled && (
              <SettingsRow label={_('Unlock with Biometric')}>
                <button
                  type='button'
                  className='btn btn-contrast btn-sm'
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    const success = await unlockWithBiometric();
                    setBusy(false);
                    setStatus(
                      success ? _('Privacy mode unlocked') : _('Biometric authentication failed'),
                    );
                  }}
                >
                  <Fingerprint className='h-4 w-4' />
                  {_('Unlock')}
                </button>
              </SettingsRow>
            )}
          </>
        )}
        {!isCloudUnlockRequired && (
          <>
            <PinInput
              label={hasPin ? _('New PIN') : _('PIN')}
              value={nextPin}
              onChange={(value) => updatePin(setNextPin, value)}
              inputRef={nextPinRef}
              disabled={busy}
              error={pinErrors.next}
              onEnter={() => confirmPinRef.current?.focus()}
            />
            <PinInput
              label={_('Confirm PIN')}
              value={confirmPin}
              onChange={(value) => updatePin(setConfirmPin, value)}
              inputRef={confirmPinRef}
              disabled={busy}
              error={pinErrors.confirm}
              onEnter={() => void savePin()}
            />
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
          </>
        )}
        {hasPin && isUnlocked && (
          <SettingsRow label={_('Lock Privacy Mode')}>
            <button type='button' className='btn btn-ghost btn-sm eink-bordered' onClick={lock}>
              <Lock className='h-4 w-4' />
              {_('Lock')}
            </button>
          </SettingsRow>
        )}
        {hasPin && biometricAvailable && (
          <SettingsRow
            label={_('Biometric Unlock')}
            description={_('Use fingerprint or face recognition to unlock privacy mode')}
          >
            <label className='swap swap-flip'>
              <input
                type='checkbox'
                checked={biometricEnabled}
                onChange={toggleBiometric}
                aria-label={_('Toggle biometric unlock')}
              />
              <Fingerprint
                className={`swap-on h-5 w-5 ${biometricEnabled ? 'text-success' : ''}`}
              />
              <Fingerprint className='swap-off h-5 w-5 opacity-40' />
            </label>
          </SettingsRow>
        )}
        {hasPin && !isCloudUnlockRequired && (
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

      {status && (
        <p role='status' className='text-center text-sm'>
          {status}
        </p>
      )}
      <Tips>
        {_(
          'Privacy settings sync as encrypted data after you sign in. Original book files are not encrypted or renamed.',
        )}
      </Tips>
    </div>
  );
};

export default PrivacyPanel;
