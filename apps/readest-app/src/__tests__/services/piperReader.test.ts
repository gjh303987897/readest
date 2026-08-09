import { describe, expect, it } from 'vitest';

import {
  getPiperVoiceCatalog,
  isPiperTextFormat,
  resolvePiperVoiceId,
} from '@/services/tts/piperReader';

describe('Piper reader support', () => {
  it('maps book languages to a concrete Piper voice without language fallback', () => {
    expect(resolvePiperVoiceId('zh-CN')).toBe('zh_CN-huayan-medium');
    expect(resolvePiperVoiceId(['en-US', 'zh-CN'])).toBe('en_US-amy-medium');
    expect(resolvePiperVoiceId('ja')).toBeNull();
    expect(resolvePiperVoiceId(undefined)).toBeNull();
  });

  it('accepts reflowable text book formats only', () => {
    expect(isPiperTextFormat('EPUB')).toBe(true);
    expect(isPiperTextFormat('MOBI')).toBe(true);
    expect(isPiperTextFormat('FB2')).toBe(true);
    expect(isPiperTextFormat('TXT')).toBe(true);
    expect(isPiperTextFormat('MD')).toBe(true);
    expect(isPiperTextFormat('PDF')).toBe(false);
    expect(isPiperTextFormat('CBZ')).toBe(false);
  });

  it('exposes the same one-voice-per-language catalog used by playback', () => {
    const catalog = getPiperVoiceCatalog();
    expect(new Set(catalog.map(({ languageCode }) => languageCode)).size).toBe(catalog.length);
    expect(new Set(catalog.map(({ voiceId }) => voiceId)).size).toBe(catalog.length);
    for (const voice of catalog) {
      expect(resolvePiperVoiceId(voice.languageCode)).toBe(voice.voiceId);
    }
  });
});
