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
      onClose={close}
      className='modal-open !z-[110]'
      bgClassName={bookKey ? 'sm:!bg-black/20' : 'sm:!bg-black/50'}
      boxClassName={clsx(
        'overflow-hidden sm:min-w-[520px] not-eink:bg-base-200',
        appService?.isMobile && 'sm:w-3/4 sm:max-w-[90%]',
      )}
      snapHeight={appService?.isMobile ? 0.7 : undefined}
      useOverlayScroll
      header={
        <div className='flex w-full items-center gap-2'>
          <div
            role='tablist'
            aria-label={_('Settings Panels')}
            className='flex min-w-0 flex-1 gap-1 overflow-x-auto'
          >
            {tabs.map(({ id, label, Icon }) => (
              <button
                key={id}
                role='tab'
                aria-selected={activePanel === id}
                title={label}
                onClick={() => selectPanel(id)}
                className={clsx(
                  'btn btn-ghost btn-sm min-w-9 gap-1 px-2',
                  activePanel === id && 'btn-active',
                )}
              >
                <Icon className='h-4 w-4' />
                <span className='hidden sm:inline'>{label}</span>
              </button>
            ))}
          </div>
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
            onClick={close}
          >
            <X className='h-4 w-4' />
          </button>
        </div>
      }
    >
      <div role='tabpanel' aria-label={currentLabel}>
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
