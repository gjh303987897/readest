import type { TTSEngine } from '@/types/settings';
import { resolveMeloTTSModel } from './meloTTSModels';

export interface TTSEngineOption {
  value: TTSEngine;
  label: string;
}

const TTS_ENGINE_OPTIONS: readonly TTSEngineOption[] = [
  { value: 'system', label: 'System default' },
  { value: 'piper', label: 'Piper' },
  { value: 'melotts', label: 'MeloTTS' },
];

export const getTTSEngineOptions = (): TTSEngineOption[] =>
  TTS_ENGINE_OPTIONS.map((option) => ({ ...option }));

export const getPrimaryLanguageCode = (language: string | string[] | undefined): string | null => {
  const primaryLanguage = Array.isArray(language) ? language[0] : language;
  return primaryLanguage?.trim().toLowerCase().replace('_', '-').split('-')[0] || null;
};

export const normalizeTTSEngine = (engine: string | undefined): TTSEngine => {
  if (engine === 'melotts-zh') return 'melotts';
  if (engine === 'system' || engine === 'piper' || engine === 'melotts') return engine;
  return 'piper';
};

export const isTTSEngineLanguageCompatible = (
  engine: TTSEngine,
  language: string | string[] | undefined,
): boolean => engine !== 'melotts' || resolveMeloTTSModel(language) !== null;
