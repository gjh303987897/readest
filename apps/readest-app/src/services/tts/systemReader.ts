import type { BookDoc } from '@/libs/document';
import type { FoliateTTS, FoliateView } from '@/types/view';
import {
  getNextSectionIndex,
  getSelectedSpeechSegments,
  getSelectedStartLocation,
  ssmlToSegments,
  TTSSelectionRequiredError,
  type TTSPlaybackSnapshot,
} from './ttsReaderUtils';

export type SystemPlaybackSnapshot = TTSPlaybackSnapshot;

const INITIAL_SNAPSHOT: SystemPlaybackSnapshot = {
  status: 'idle',
  progress: 0,
  voiceId: null,
  error: null,
};

const controllers = new Map<string, SystemReaderController>();
let activeController: SystemReaderController | null = null;

const getSpeechSynthesis = (): SpeechSynthesis => {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    throw new Error('System speech synthesis is unavailable');
  }
  return window.speechSynthesis;
};

const getSpeechLanguage = (language: string | string[] | undefined): string | undefined => {
  const value = Array.isArray(language) ? language[0] : language;
  return value?.trim() || undefined;
};

class SystemReaderController {
  private snapshot: SystemPlaybackSnapshot = INITIAL_SNAPSHOT;
  private listeners = new Set<() => void>();
  private tts: FoliateTTS | null = null;
  private utterance: SpeechSynthesisUtterance | null = null;
  private operation = 0;
  private resolvePlayback: (() => void) | null = null;

  constructor(
    private readonly bookKey: string,
    private readonly view: FoliateView,
    private readonly language: string | string[] | undefined,
  ) {}

  getSnapshot = (): SystemPlaybackSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  isFor(view: FoliateView, language: string | string[] | undefined): boolean {
    return this.view === view && this.language === language;
  }

  async preload(): Promise<void> {
    getSpeechSynthesis();
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
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    this.resolvePlayback?.();
    this.resolvePlayback = null;
    this.utterance = null;
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
    getSpeechSynthesis().pause();
    this.setSnapshot({ status: 'paused' });
  }

  private async resume(): Promise<void> {
    const speechSynthesis = getSpeechSynthesis();
    if (!this.utterance || !speechSynthesis.paused) {
      await this.start();
      return;
    }
    speechSynthesis.resume();
    this.setSnapshot({ status: 'playing' });
  }

  private async start(): Promise<void> {
    getSpeechSynthesis();
    const startLocation = getSelectedStartLocation(this.view);
    if (!startLocation) throw new TTSSelectionRequiredError();

    activeController?.stop();
    activeController = this;
    const operation = ++this.operation;
    this.setSnapshot({ status: 'loading', progress: 0, voiceId: null, error: null });

    try {
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
      await this.playSegment(ssml, operation);
    } catch (error) {
      if (operation !== this.operation) return;
      this.setSnapshot({
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async playSegment(ssml: string, operation: number): Promise<void> {
    const segments = ssmlToSegments(ssml);
    for (const segment of segments) {
      if (operation !== this.operation) return;
      if (segment.markName) this.tts?.setMark(segment.markName);
      await this.playText(segment.text, operation);
    }

    if (operation !== this.operation || !this.tts) return;
    const next = this.tts.next();
    if (next) {
      await this.playSegment(next, operation);
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
    await this.playSegment(first, operation);
  }

  private async playText(text: string, operation: number): Promise<void> {
    const SpeechSynthesisUtteranceConstructor = globalThis.SpeechSynthesisUtterance;
    if (!SpeechSynthesisUtteranceConstructor) {
      throw new Error('System speech synthesis is unavailable');
    }

    const speechSynthesis = getSpeechSynthesis();
    const utterance = new SpeechSynthesisUtteranceConstructor(text);
    const language = getSpeechLanguage(this.language);
    if (language) utterance.lang = language;
    this.utterance = utterance;
    this.setSnapshot({ status: 'playing', progress: 1 });

    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        utterance.onend = null;
        utterance.onerror = null;
        if (this.resolvePlayback === finish) this.resolvePlayback = null;
      };
      const finish = () => {
        cleanup();
        resolve();
      };
      utterance.onend = finish;
      utterance.onerror = (event) => {
        if (
          operation !== this.operation ||
          event.error === 'canceled' ||
          event.error === 'interrupted'
        ) {
          finish();
          return;
        }
        cleanup();
        reject(new Error(`System speech synthesis failed: ${event.error}`));
      };
      this.resolvePlayback = finish;
      speechSynthesis.speak(utterance);
    });
  }

  private setSnapshot(partial: Partial<SystemPlaybackSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...partial };
    for (const listener of this.listeners) listener();
  }
}

export const getSystemReaderController = (
  bookKey: string,
  view: FoliateView,
  bookDoc: BookDoc,
): SystemReaderController => {
  const existing = controllers.get(bookKey);
  if (existing?.isFor(view, bookDoc.metadata.language)) return existing;
  existing?.dispose();
  const controller = new SystemReaderController(bookKey, view, bookDoc.metadata.language);
  controllers.set(bookKey, controller);
  return controller;
};

export const disposeSystemReaderController = (bookKey: string): void => {
  controllers.get(bookKey)?.dispose();
};

export type { SystemReaderController };
