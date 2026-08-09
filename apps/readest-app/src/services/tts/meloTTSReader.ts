import { invoke } from '@tauri-apps/api/core';

import type { BookDoc } from '@/libs/document';
import type { FoliateTTS, FoliateView } from '@/types/view';
import { resolveMeloTTSModel, type MeloTTSModelCode } from './meloTTSModels';
import {
  getNextSectionIndex,
  getSelectedSpeechSegments,
  getSelectedStartLocation,
  ssmlToSegments,
  TTSSelectionRequiredError,
  type TTSPlaybackSnapshot,
} from './ttsReaderUtils';

export type MeloTTSPlaybackSnapshot = TTSPlaybackSnapshot;

const INITIAL_SNAPSHOT: MeloTTSPlaybackSnapshot = {
  status: 'idle',
  progress: 0,
  voiceId: null,
  error: null,
};

const controllers = new Map<string, MeloTTSReaderController>();
let activeController: MeloTTSReaderController | null = null;

const WARMUP_TEXT: Record<MeloTTSModelCode, string> = {
  EN: 'Ready.',
  ES: 'Listo.',
  FR: 'Pret.',
  ZH: '准备。',
  JP: '準備。',
  KR: '준비。',
};

const decodeWave = (base64: string): Blob => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: 'audio/wav' });
};

class MeloTTSReaderController {
  private snapshot: MeloTTSPlaybackSnapshot = INITIAL_SNAPSHOT;
  private listeners = new Set<() => void>();
  private tts: FoliateTTS | null = null;
  private audio: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  private operation = 0;
  private resolvePlayback: (() => void) | null = null;
  private preloadPromise: Promise<void> | null = null;
  private preloadedModel: MeloTTSModelCode | null = null;

  constructor(
    private readonly bookKey: string,
    private readonly view: FoliateView,
    private readonly language: string | string[] | undefined,
  ) {}

  getSnapshot = (): MeloTTSPlaybackSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  isFor(view: FoliateView, language: string | string[] | undefined): boolean {
    return this.view === view && this.language === language;
  }

  async preload(): Promise<void> {
    const model = resolveMeloTTSModel(this.language);
    if (!model || this.preloadedModel === model.code) return;
    if (this.preloadPromise) return this.preloadPromise;

    this.preloadPromise = (async () => {
      await invoke<string>('melotts_synthesize', {
        languageCode: model.code,
        text: WARMUP_TEXT[model.code],
      });
      this.preloadedModel = model.code;
    })();
    try {
      await this.preloadPromise;
    } finally {
      this.preloadPromise = null;
    }
  }

  async toggle(): Promise<void> {
    if (this.snapshot.status === 'playing') {
      this.pause();
      return;
    }
    if (this.snapshot.status === 'paused') {
      await this.resume();
      return;
    }
    await this.start();
  }

  stop(): void {
    this.operation += 1;
    this.resolvePlayback?.();
    this.resolvePlayback = null;
    this.audio?.pause();
    if (this.audio) {
      this.audio.removeAttribute('src');
      this.audio.load();
    }
    this.revokeObjectUrl();
    this.tts = null;
    if (activeController === this) activeController = null;
    this.setSnapshot({ status: 'idle', progress: 0, error: null });
  }

  dispose(): void {
    this.stop();
    this.listeners.clear();
    if (controllers.get(this.bookKey) === this) controllers.delete(this.bookKey);
  }

  private pause(): void {
    this.audio?.pause();
    this.setSnapshot({ status: 'paused' });
  }

  private async resume(): Promise<void> {
    if (!this.audio?.src) {
      await this.start();
      return;
    }
    await this.audio.play();
    this.setSnapshot({ status: 'playing' });
  }

  private async start(): Promise<void> {
    const model = resolveMeloTTSModel(this.language);
    if (!model) throw new Error('MeloTTS does not support this book language');
    const startLocation = getSelectedStartLocation(this.view);
    if (!startLocation) throw new TTSSelectionRequiredError();

    activeController?.stop();
    activeController = this;
    const operation = ++this.operation;
    this.setSnapshot({ status: 'loading', progress: 0, voiceId: model.code, error: null });

    try {
      await this.preload();
      if (operation !== this.operation) return;
      await (this.view.goTo as unknown as (target: string) => Promise<void>)(startLocation.cfi);
      if (operation !== this.operation) return;
      await this.view.initTTS('sentence');
      this.tts = this.view.tts ?? null;
      if (!this.tts) throw new Error('The document reader did not expose a TTS iterator');

      const ssml = getSelectedSpeechSegments(this.view, this.tts, startLocation);
      if (!ssml) {
        this.stop();
        return;
      }
      await this.playSegment(model.code, ssml, operation);
    } catch (error) {
      if (operation !== this.operation) return;
      this.setSnapshot({
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async playSegment(
    languageCode: MeloTTSModelCode,
    ssml: string,
    operation: number,
  ): Promise<void> {
    const segments = ssmlToSegments(ssml);
    for (const segment of segments) {
      if (operation !== this.operation) return;
      if (segment.markName) this.tts?.setMark(segment.markName);
      await this.playText(languageCode, segment.text, operation);
    }

    if (operation !== this.operation || !this.tts) return;
    const next = this.tts.next();
    if (next) {
      await this.playSegment(languageCode, next, operation);
      return;
    }

    const nextSectionIndex = getNextSectionIndex(this.view);
    if (nextSectionIndex == null) {
      this.stop();
      return;
    }

    await (this.view.goTo as unknown as (target: number) => Promise<void>)(nextSectionIndex);
    if (operation !== this.operation) return;
    await this.view.initTTS('sentence');
    this.tts = this.view.tts ?? null;
    const first = this.tts?.start();
    if (!first) {
      this.stop();
      return;
    }
    await this.playSegment(languageCode, first, operation);
  }

  private async playText(
    languageCode: MeloTTSModelCode,
    text: string,
    operation: number,
  ): Promise<void> {
    const waveBase64 = await invoke<string>('melotts_synthesize', { languageCode, text });
    if (operation !== this.operation) return;

    const audio = this.getAudio();
    this.revokeObjectUrl();
    this.objectUrl = URL.createObjectURL(decodeWave(waveBase64));
    audio.src = this.objectUrl;
    this.setSnapshot({ status: 'playing', progress: 1 });

    await new Promise<void>((resolve, reject) => {
      const onEnded = () => finish();
      const onError = () => {
        cleanup();
        reject(new Error('MeloTTS audio playback failed'));
      };
      const cleanup = () => {
        audio.removeEventListener('ended', onEnded);
        audio.removeEventListener('error', onError);
        if (this.resolvePlayback === finish) this.resolvePlayback = null;
      };
      const finish = () => {
        cleanup();
        resolve();
      };
      this.resolvePlayback = finish;
      audio.addEventListener('ended', onEnded, { once: true });
      audio.addEventListener('error', onError, { once: true });
      audio.play().catch((error) => {
        cleanup();
        reject(error);
      });
    });
  }

  private getAudio(): HTMLAudioElement {
    if (!this.audio) {
      if (typeof Audio === 'undefined') throw new Error('Audio playback is unavailable');
      this.audio = new Audio();
      this.audio.preload = 'auto';
    }
    return this.audio;
  }

  private revokeObjectUrl(): void {
    if (!this.objectUrl) return;
    URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
  }

  private setSnapshot(partial: Partial<MeloTTSPlaybackSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...partial };
    for (const listener of this.listeners) listener();
  }
}

export const getMeloTTSReaderController = (
  bookKey: string,
  view: FoliateView,
  bookDoc: BookDoc,
): MeloTTSReaderController => {
  const existing = controllers.get(bookKey);
  if (existing?.isFor(view, bookDoc.metadata.language)) return existing;
  existing?.dispose();
  const controller = new MeloTTSReaderController(bookKey, view, bookDoc.metadata.language);
  controllers.set(bookKey, controller);
  return controller;
};

export const disposeMeloTTSReaderController = (bookKey: string): void => {
  controllers.get(bookKey)?.dispose();
};

export type { MeloTTSReaderController };
