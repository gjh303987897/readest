import clsx from 'clsx';
import React, { useMemo, useState } from 'react';
import {
  LayoutGrid,
  MousePointer2,
  Palette,
  ShieldCheck,
  RotateCcw,
  Settings2,
  Type,
  Volume2,
  X,
} from 'lucide-react';

import { useEnv } from '@/context/EnvContext';
import { useSettingsStore } from '@/store/settingsStore';
import { useTranslation } from '@/hooks/useTranslation';
import Dialog from '@/components/Dialog';
import FontPanel from './FontPanel';
import LayoutPanel from './LayoutPanel';
import ThemePanel from './ThemePanel';
import ControlPanel from './ControlPanel';
import GeneralPanel from './GeneralPanel';
import TTSPanel from './TTSPanel';
import PrivacyPanel from './PrivacyPanel';

export type SettingsPanelType =
  | 'General'
  | 'Font'
  | 'Layout'
  | 'Theme'
  | 'Control'
  | 'TTS'
  | 'Privacy';

export type SettingsPanelPanelProp = {
  bookKey: string;
  onRegisterReset: (resetFn: () => void) => void;
};

const SettingsDialog: React.FC<{ bookKey: string; initialPanel?: SettingsPanelType }> = ({
  bookKey,
  initialPanel,
}) => {
  const _ = useTranslation();
  const { appService } = useEnv();
  const { setSettingsDialogOpen } = useSettingsStore();
  const isDesktopLayout =
    !appService?.isMobile && (appService?.isDesktopApp || window.innerWidth >= 640);

  const tabs = useMemo(
    () => [
      { id: 'General' as const, label: _('General'), Icon: Settings2 },
      { id: 'Font' as const, label: _('Font'), Icon: Type },
      { id: 'Layout' as const, label: _('Layout'), Icon: LayoutGrid },
      { id: 'Theme' as const, label: _('Theme'), Icon: Palette },
      { id: 'Control' as const, label: _('Behavior'), Icon: MousePointer2 },
      { id: 'TTS' as const, label: _('TTS'), Icon: Volume2 },
      { id: 'Privacy' as const, label: _('Privacy'), Icon: ShieldCheck },
    ],
    [_],
  );
  const isPanel = (value: string | null): value is SettingsPanelType =>
    tabs.some((tab) => tab.id === value);
  const [activePanel, setActivePanel] = useState<SettingsPanelType>(() => {
    if (initialPanel) return initialPanel;
    const previous = localStorage.getItem('lastConfigPanel');
    return isPanel(previous) ? previous : 'Font';
  });
  const [resetFunctions, setResetFunctions] = useState<
    Partial<Record<SettingsPanelType, () => void>>
  >({});
  const selectPanel = (panel: SettingsPanelType) => {
    setActivePanel(panel);
    localStorage.setItem('lastConfigPanel', panel);
  };

  const registerReset = (panel: SettingsPanelType, reset: () => void) => {
    setResetFunctions((current) => ({ ...current, [panel]: reset }));
  };

  const close = () => setSettingsDialogOpen(false);
  const currentLabel = tabs.find((tab) => tab.id === activePanel)?.label ?? _('Settings');

  return (
    <Dialog
      isOpen
      title={_('Settings')}
      onClose={close}
      className={clsx('modal-open !z-[110]', isDesktopLayout && '!items-center')}
      bgClassName={bookKey ? 'sm:!bg-black/20' : 'sm:!bg-black/50'}
      boxClassName={clsx(
        'overflow-hidden not-eink:bg-base-200',
        isDesktopLayout && '!h-[80%] !max-h-[680px] !w-[90%] !max-w-[720px] !rounded-2xl',
        appService?.isMobile && 'sm:w-3/4 sm:max-w-[90%]',
      )}
      snapHeight={appService?.isMobile ? 0.7 : undefined}
      useOverlayScroll
      header={(onClose) => (
        <div className='flex w-full flex-col gap-2 py-2'>
          <div className='flex items-center justify-between gap-2'>
            <h2 className='ps-2 text-base font-semibold'>{_('Settings')}</h2>
            <div className='flex shrink-0 items-center gap-1'>
              {activePanel !== 'TTS' && activePanel !== 'Privacy' && (
                <button
                  type='button'
                  className='btn btn-ghost btn-sm btn-square'
                  title={_('Reset {{settings}}', { settings: currentLabel })}
                  aria-label={_('Reset {{settings}}', { settings: currentLabel })}
                  onClick={() => resetFunctions[activePanel]?.()}
                >
                  <RotateCcw className='h-4 w-4' />
                </button>
              )}
              <button
                type='button'
                className='btn btn-ghost btn-sm btn-square'
                title={_('Close')}
                aria-label={_('Close')}
                onClick={onClose}
              >
                <X className='h-4 w-4' />
              </button>
            </div>
          </div>
          <div
            role='tablist'
            aria-label={_('Settings Panels')}
            className='grid min-w-0 grid-cols-7 gap-1'
          >
            {tabs.map(({ id, label, Icon }) => (
              <button
                key={id}
                type='button'
                role='tab'
                aria-label={label}
                aria-selected={activePanel === id}
                title={label}
                onClick={() => selectPanel(id)}
                className={clsx(
                  'btn btn-ghost h-auto min-h-14 min-w-0 flex-col flex-nowrap gap-1 px-1 py-2 text-xs focus-visible:ring-2 focus-visible:ring-base-content/15',
                  activePanel === id && 'btn-active eink-bordered',
                )}
              >
                <Icon className='h-4 w-4 shrink-0' />
                <span className='w-full truncate leading-tight'>{label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    >
      <div
        key={activePanel}
        role='tabpanel'
        aria-label={currentLabel}
        className='view-switch-enter'
      >
        {activePanel === 'General' && (
          <GeneralPanel onRegisterReset={(reset) => registerReset('General', reset)} bookKey='' />
        )}
        {activePanel === 'Font' && (
          <FontPanel bookKey={bookKey} onRegisterReset={(reset) => registerReset('Font', reset)} />
        )}
        {activePanel === 'Layout' && (
          <LayoutPanel
            bookKey={bookKey}
            onRegisterReset={(reset) => registerReset('Layout', reset)}
          />
        )}
        {activePanel === 'Theme' && (
          <ThemePanel
            bookKey={bookKey}
            onRegisterReset={(reset) => registerReset('Theme', reset)}
          />
        )}
        {activePanel === 'Control' && (
          <ControlPanel
            bookKey={bookKey}
            onRegisterReset={(reset) => registerReset('Control', reset)}
          />
        )}
        {activePanel === 'TTS' && (
          <TTSPanel onRegisterReset={(reset) => registerReset('TTS', reset)} bookKey='' />
        )}
        {activePanel === 'Privacy' && (
          <PrivacyPanel onRegisterReset={(reset) => registerReset('Privacy', reset)} bookKey='' />
        )}
      </div>
    </Dialog>
  );
};

export default SettingsDialog;
