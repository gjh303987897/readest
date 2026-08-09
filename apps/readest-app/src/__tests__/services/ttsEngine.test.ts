import { describe, expect, it } from 'vitest';

import {
  getTTSRateOptions,
  getTTSEngineOptions,
  isTTSEngineLanguageCompatible,
  normalizeMeloTTSDevice,
  normalizeTTSRate,
  normalizeTTSEngine,
} from '@/services/tts/ttsEngine';
import { getMeloTTSModelCatalog, resolveMeloTTSModel } from '@/services/tts/meloTTSModels';

describe('TTS engine selection', () => {
  it('exposes the supported engines in settings order', () => {
    expect(getTTSEngineOptions().map(({ value }) => value)).toEqual(['system', 'piper', 'melotts']);
    expect(getTTSEngineOptions().at(-1)?.label).toBe('MeloTTS');
  });

  it('exposes reading speed choices and normalizes old or invalid settings', () => {
    expect(getTTSRateOptions()).toEqual([0.8, 0.9, 1, 1.1, 1.2, 1.5, 2]);
    expect(normalizeTTSRate(undefined)).toBe(1);
    expect(normalizeTTSRate(1.1)).toBe(1.1);
    expect(normalizeTTSRate(1.15)).toBe(1);
  });

  it('defaults MeloTTS inference to CPU and accepts GPU explicitly', () => {
    expect(normalizeMeloTTSDevice(undefined)).toBe('cpu');
    expect(normalizeMeloTTSDevice('cpu')).toBe('cpu');
    expect(normalizeMeloTTSDevice('gpu')).toBe('gpu');
    expect(normalizeMeloTTSDevice('cuda')).toBe('cpu');
  });

  it('supports only the six official MeloTTS languages without falling back', () => {
    for (const language of ['en-US', 'es-ES', 'fr-FR', 'zh-CN', 'ja-JP', 'ko-KR']) {
      expect(isTTSEngineLanguageCompatible('melotts', language)).toBe(true);
    }

    expect(isTTSEngineLanguageCompatible('melotts', ['de-DE', 'en-US'])).toBe(false);
    expect(isTTSEngineLanguageCompatible('melotts', 'de-DE')).toBe(false);
    expect(isTTSEngineLanguageCompatible('melotts', undefined)).toBe(false);
  });

  it('maps book languages to official model codes and enables mixed English only for ZH', () => {
    const models = getMeloTTSModelCatalog();
    expect(models.map(({ code }) => code)).toEqual(['EN', 'ES', 'FR', 'ZH', 'JP', 'KR']);
    expect(models.map(({ checkpointUrl }) => checkpointUrl)).toEqual([
      'https://huggingface.co/myshell-ai/MeloTTS-English/resolve/main/checkpoint.pth',
      'https://huggingface.co/myshell-ai/MeloTTS-Spanish/resolve/main/checkpoint.pth',
      'https://huggingface.co/myshell-ai/MeloTTS-French/resolve/main/checkpoint.pth',
      'https://huggingface.co/myshell-ai/MeloTTS-Chinese/resolve/main/checkpoint.pth',
      'https://huggingface.co/myshell-ai/MeloTTS-Japanese/resolve/main/checkpoint.pth',
      'https://huggingface.co/myshell-ai/MeloTTS-Korean/resolve/main/checkpoint.pth',
    ]);
    expect(resolveMeloTTSModel('ja-JP')?.code).toBe('JP');
    expect(resolveMeloTTSModel('ko-KR')?.code).toBe('KR');
    expect(resolveMeloTTSModel('zh-Hans')?.supportsMixedEnglish).toBe(true);
    expect(resolveMeloTTSModel('en-US')?.supportsMixedEnglish).toBe(false);
    expect(resolveMeloTTSModel(['de-DE', 'zh-CN'])).toBeNull();
  });

  it('migrates the previous MeloTTS ZH setting without changing other values', () => {
    expect(normalizeTTSEngine('melotts-zh')).toBe('melotts');
    expect(normalizeTTSEngine('melotts')).toBe('melotts');
    expect(normalizeTTSEngine('system')).toBe('system');
    expect(normalizeTTSEngine(undefined)).toBe('piper');
  });

  it('does not impose the Chinese-only restriction on the other engines', () => {
    expect(isTTSEngineLanguageCompatible('system', 'en-US')).toBe(true);
    expect(isTTSEngineLanguageCompatible('piper', 'de-DE')).toBe(true);
  });
});
