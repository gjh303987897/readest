import clsx from 'clsx';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  CircuitBoard,
  Cpu,
  Download,
  LoaderCircle,
  Trash2,
} from 'lucide-react';

import { useTranslation } from '@/hooks/useTranslation';
import { useEnv } from '@/context/EnvContext';
import { saveSysSettings } from '@/helpers/settings';
import { useSettingsStore } from '@/store/settingsStore';
import type { MeloTTSDevice, TTSEngine } from '@/types/settings';
import Dropdown from '@/components/Dropdown';
import Menu from '@/components/Menu';
import MenuItem from '@/components/MenuItem';
import {
  downloadPiperVoice,
  getPiperVoiceCatalog,
  getStoredPiperVoiceIds,
  removePiperVoice,
  type PiperVoiceOption,
} from '@/services/tts/piperReader';
import {
  downloadMeloTTSModel,
  getMeloTTSModelCatalog,
  getStoredMeloTTSModelCodes,
  removeMeloTTSModel,
  type MeloTTSModelCode,
} from '@/services/tts/meloTTSModels';
import {
  getTTSEngineOptions,
  getTTSRateOptions,
  normalizeMeloTTSDevice,
  normalizeTTSRate,
  resolveTTSEngineForPlatform,
} from '@/services/tts/ttsEngine';
import type { SettingsPanelPanelProp } from './SettingsDialog';
import { BoxedList, SettingsRow, Tips } from './primitives';

type DownloadState = {
  packId: string;
  progress: number;
};

type LocalPackOption =
  | {
      kind: 'piper';
      id: string;
      label: string;
      description: string;
      source: PiperVoiceOption;
    }
  | {
      kind: 'melotts';
      id: MeloTTSModelCode;
      label: string;
      description: string;
    };

interface TTSChoiceMenuProps<T extends string | number> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  setIsDropdownOpen?: (open: boolean) => void;
}

const TTSChoiceMenu = <T extends string | number>({
  options,
  value,
  onChange,
  setIsDropdownOpen,
}: TTSChoiceMenuProps<T>) => (
  <Menu
    className='dropdown-content bgcolor-base-200 no-triangle z-20 mt-2 w-44 max-w-[calc(100vw-2rem)] overflow-x-hidden rounded-xl border border-base-300/60 p-1.5 shadow-xl'
    onCancel={() => setIsDropdownOpen?.(false)}
  >
    {options.map((option) => (
      <MenuItem
        key={String(option.value)}
        label={option.label}
        toggled={option.value === value}
        transient
        noIcon={false}
        setIsDropdownOpen={setIsDropdownOpen}
        buttonClass='min-h-10 rounded-lg px-2 py-2 hover:bg-base-300/70'
        labelClass='mx-2 text-sm'
        onClick={() => onChange(option.value)}
      />
    ))}
  </Menu>
);

const TTSPanel: React.FC<SettingsPanelPanelProp> = () => {
  const _ = useTranslation();
  const { envConfig, appService } = useEnv();
  const settings = useSettingsStore((state) => state.settings);
  const storedTTSEngine = settings.ttsEngine as string | undefined;
  const systemOnly = appService === null || appService.isMobileApp;
  const ttsEngine = resolveTTSEngineForPlatform(storedTTSEngine, systemOnly);
  const ttsRate = normalizeTTSRate(settings.ttsRate);
  const meloDevice = normalizeMeloTTSDevice(settings.ttsMeloDevice);
  const voices = useMemo(() => getPiperVoiceCatalog(), []);
  const models = useMemo(() => getMeloTTSModelCatalog(), []);
  const engineOptions = useMemo(
    () => getTTSEngineOptions(systemOnly).map(({ value, label }) => ({ value, label: _(label) })),
    [_, systemOnly],
  );
  const selectedEngine =
    engineOptions.find(({ value }) => value === ttsEngine) ?? engineOptions[0]!;
  const rateOptions = useMemo(
    () => getTTSRateOptions().map((rate) => ({ value: rate, label: `${rate}x` })),
    [],
  );
  const packs = useMemo<LocalPackOption[]>(() => {
    if (ttsEngine === 'piper') {
      return voices.map((voice) => ({
        kind: 'piper',
        id: voice.voiceId,
        label: _(voice.label),
        description: `${voice.languageCode.toUpperCase()} - ${voice.voiceId}`,
        source: voice,
      }));
    }
    if (ttsEngine === 'melotts') {
      return models.map((model) => ({
        kind: 'melotts',
        id: model.code,
        label: _(model.label),
        description: model.supportsMixedEnglish
          ? `${model.code} - ${_('About 200 MB')} - ${_('Chinese and English mixed text')}`
          : `${model.code} - ${_('About 200 MB')}`,
      }));
    }
    return [];
  }, [_, models, ttsEngine, voices]);
  const [storedPackIds, setStoredPackIds] = useState<Set<string>>(() => new Set());
  const [downloadState, setDownloadState] = useState<DownloadState | null>(null);
  const [removingPackId, setRemovingPackId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const storedIds =
        ttsEngine === 'piper'
          ? await getStoredPiperVoiceIds()
          : ttsEngine === 'melotts'
            ? await getStoredMeloTTSModelCodes()
            : [];
      setStoredPackIds(new Set(storedIds));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [ttsEngine]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (storedTTSEngine === 'melotts-zh') {
      void saveSysSettings(envConfig, 'ttsEngine', 'melotts');
    }
  }, [envConfig, storedTTSEngine]);

  const handleEngineChange = (engine: TTSEngine) => {
    void saveSysSettings(envConfig, 'ttsEngine', engine);
  };

  const handleRateChange = (rate: number) => {
    void saveSysSettings(envConfig, 'ttsRate', rate);
  };

  const handleDeviceChange = (device: MeloTTSDevice) => {
    void saveSysSettings(envConfig, 'ttsMeloDevice', device);
  };

  const engineDescription =
    ttsEngine === 'system'
      ? _('Uses a voice installed and selected by the operating system.')
      : ttsEngine === 'melotts'
        ? `${_('MeloTTS uses six official language models.')} ${_('The model must match the book language; unsupported languages do not fall back.')}`
        : _('Piper voices run locally after their voice pack is downloaded.');

  const handleDownload = async (pack: LocalPackOption) => {
    if (downloadState || removingPackId) return;
    setRowError(null);
    setDownloadState({ packId: pack.id, progress: 0 });
    try {
      const onProgress = ({ progress }: { progress: number }) => {
        setDownloadState({ packId: pack.id, progress });
      };
      if (pack.kind === 'piper') {
        await downloadPiperVoice(pack.source.voiceId, onProgress);
      } else {
        await downloadMeloTTSModel(pack.id, onProgress);
      }
      setStoredPackIds((current) => new Set(current).add(pack.id));
    } catch (cause) {
      setRowError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setDownloadState(null);
    }
  };

  const handleRemove = async (pack: LocalPackOption) => {
    if (downloadState || removingPackId || !storedPackIds.has(pack.id)) return;
    setRowError(null);
    setRemovingPackId(pack.id);
    try {
      if (pack.kind === 'piper') {
        await removePiperVoice(pack.source.voiceId);
      } else {
        await removeMeloTTSModel(pack.id);
      }
      setStoredPackIds((current) => {
        const next = new Set(current);
        next.delete(pack.id);
        return next;
      });
    } catch (cause) {
      setRowError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRemovingPackId(null);
    }
  };

  return (
    <div className='my-4 space-y-6'>
      <BoxedList title={_('Speech engine')} data-setting-id='settings.tts.engine'>
        <SettingsRow label={_('TTS engine')} description={engineDescription}>
          {systemOnly ? (
            <span className='settings-content px-2'>{selectedEngine.label}</span>
          ) : (
            <Dropdown
              label={_('TTS engine')}
              showTooltip={false}
              containerClassName='w-32 max-w-[52%] min-w-0 justify-end [&>div]:max-w-full [&>div]:min-w-0'
              className='dropdown-end'
              buttonClassName='settings-content flex h-9 min-h-9 w-full max-w-full min-w-0 items-center gap-1 overflow-hidden rounded-md px-2 font-normal hover:bg-base-200/70 focus-visible:outline-none'
              toggleButton={
                <>
                  <span className='min-w-0 truncate'>{selectedEngine.label}</span>
                  <ChevronDown
                    className='text-base-content/55 h-4 w-4 shrink-0'
                    aria-hidden='true'
                  />
                </>
              }
            >
              <TTSChoiceMenu
                options={engineOptions}
                value={ttsEngine}
                onChange={handleEngineChange}
              />
            </Dropdown>
          )}
        </SettingsRow>
        <SettingsRow label={_('Reading speed')}>
          <Dropdown
            label={_('Reading speed')}
            showTooltip={false}
            containerClassName='w-24 max-w-[52%] min-w-0 justify-end [&>div]:max-w-full [&>div]:min-w-0'
            className='dropdown-end'
            buttonClassName='settings-content flex h-9 min-h-9 w-full max-w-full min-w-0 items-center justify-end gap-1 overflow-hidden rounded-md px-2 font-normal hover:bg-base-200/70 focus-visible:outline-none'
            toggleButton={
              <>
                <span className='min-w-0 truncate'>{ttsRate}x</span>
                <ChevronDown className='text-base-content/55 h-4 w-4 shrink-0' aria-hidden='true' />
              </>
            }
          >
            <TTSChoiceMenu options={rateOptions} value={ttsRate} onChange={handleRateChange} />
          </Dropdown>
        </SettingsRow>
        {ttsEngine === 'melotts' && (
          <SettingsRow
            label={_('Inference device')}
            description={_('GPU inference requires a compatible CUDA or MPS PyTorch runtime.')}
          >
            <div
              role='radiogroup'
              aria-label={_('Inference device')}
              className='bg-base-200 eink-bordered inline-flex items-center rounded-lg p-0.5'
            >
              {[
                { value: 'cpu' as const, label: 'CPU', Icon: Cpu },
                { value: 'gpu' as const, label: 'GPU', Icon: CircuitBoard },
              ].map(({ value, label, Icon }) => {
                const active = meloDevice === value;
                return (
                  <button
                    key={value}
                    type='button'
                    role='radio'
                    aria-checked={active}
                    aria-label={_(label)}
                    title={_(label)}
                    onClick={() => handleDeviceChange(value)}
                    className={clsx(
                      'flex h-9 min-w-[4.25rem] items-center justify-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors',
                      'focus-visible:ring-base-content/15 focus-visible:outline-none focus-visible:ring-2',
                      active
                        ? 'bg-base-100 text-base-content eink-inverted shadow-sm'
                        : 'text-base-content/60 hover:text-base-content',
                    )}
                  >
                    <Icon className='h-4 w-4' aria-hidden='true' />
                    {_(label)}
                  </button>
                );
              })}
            </div>
          </SettingsRow>
        )}
      </BoxedList>

      <BoxedList
        title={ttsEngine === 'melotts' ? _('Language models') : _('Voice packs')}
        description={
          ttsEngine === 'melotts'
            ? _('Download official MeloTTS models for offline reading aloud.')
            : ttsEngine === 'piper'
              ? _('Download Piper voices for offline reading aloud.')
              : _('System voices are installed and managed by the operating system.')
        }
        data-setting-id='settings.tts.voice-packs'
      >
        {loading ? (
          <SettingsRow label={_('Loading')}>
            <LoaderCircle className='text-base-content/60 h-4 w-4 animate-spin' />
          </SettingsRow>
        ) : error ? (
          <SettingsRow label={_('Voice packs')} description={error}>
            <button type='button' className='btn btn-ghost btn-sm' onClick={() => void refresh()}>
              {_('Retry')}
            </button>
          </SettingsRow>
        ) : packs.length === 0 ? (
          <SettingsRow
            label={_('System voices')}
            description={_('Use the operating system settings to add or remove voices.')}
          />
        ) : (
          packs.map((pack) => {
            const isStored = storedPackIds.has(pack.id);
            const isDownloading = downloadState?.packId === pack.id;
            const isRemoving = removingPackId === pack.id;
            return (
              <SettingsRow
                key={pack.id}
                label={pack.label}
                description={pack.description}
                align='start'
              >
                {isDownloading ? (
                  <div className='flex min-w-28 items-center gap-2 pt-1'>
                    <progress
                      className='progress progress-primary h-1.5 w-20'
                      max={1}
                      value={downloadState.progress}
                      aria-label={_('Downloading')}
                    />
                    <span className='text-base-content/65 w-9 text-end text-xs'>
                      {Math.round(downloadState.progress * 100)}%
                    </span>
                  </div>
                ) : isRemoving ? (
                  <LoaderCircle
                    className='text-base-content/60 me-2 mt-1 h-4 w-4 animate-spin'
                    aria-label={_('Remove')}
                  />
                ) : isStored ? (
                  <div className='flex items-center gap-1 pt-1'>
                    <span className='text-success flex items-center gap-1 text-xs'>
                      <Check className='h-3.5 w-3.5' />
                      {_('Downloaded')}
                    </span>
                    <button
                      type='button'
                      className='btn btn-ghost btn-sm btn-square'
                      title={_('Remove')}
                      aria-label={_('Remove')}
                      disabled={!!downloadState || !!removingPackId}
                      onClick={() => void handleRemove(pack)}
                    >
                      <Trash2 className='h-4 w-4' />
                    </button>
                  </div>
                ) : (
                  <button
                    type='button'
                    className={clsx(
                      'btn btn-ghost btn-sm gap-1',
                      (downloadState || removingPackId) && 'btn-disabled',
                    )}
                    disabled={!!downloadState || !!removingPackId}
                    onClick={() => void handleDownload(pack)}
                  >
                    <Download className='h-4 w-4' />
                    {_('Download')}
                  </button>
                )}
              </SettingsRow>
            );
          })
        )}
      </BoxedList>

      {rowError && (
        <p className='text-error px-4 text-xs' role='alert'>
          {rowError}
        </p>
      )}

      {ttsEngine !== 'system' && (
        <Tips title={_('Tips')}>
          <li>
            {_(
              'Downloaded voice and model packs are stored locally and can be removed at any time.',
            )}
          </li>
          {ttsEngine === 'melotts' ? (
            <li>{_('Only the ZH model supports mixed Chinese and English text.')}</li>
          ) : (
            <li>
              {_('A voice is downloaded automatically when you start reading aloud if needed.')}
            </li>
          )}
        </Tips>
      )}
    </div>
  );
};

export default TTSPanel;
