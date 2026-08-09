import type { BookDoc } from '@/libs/document';
import type { FoliateTTS, FoliateView } from '@/types/view';
import { normalizeTTSRate } from './ttsEngine';
import {
  getNextSectionIndex,
  getSelectedSpeechSegments,
  getSelectedStartLocation,
  ssmlToSegments,
  TTSSelectionRequiredError,
  type TTSPlaybackSnapshot,
  type TTSPlaybackStatus,
} from './ttsReaderUtils';

export type PiperPlaybackStatus = TTSPlaybackStatus;
export type PiperPlaybackSnapshot = TTSPlaybackSnapshot;

export interface PiperVoiceOption {
  languageCode: string;
  label: string;
  voiceId: string;
  quality: string;
}

export interface PiperDownloadProgress {
  loaded: number;
  total: number;
  progress: number;
}

type PiperModule = typeof import('@realtimex/piper-tts-web');
type PiperSession = import('@realtimex/piper-tts-web').TtsSession;

export class PiperSelectionRequiredError extends TTSSelectionRequiredError {
  constructor() {
    super();
    this.name = 'PiperSelectionRequiredError';
  }
}

const PIPER_VOICES: Record<string, string> = {
  ar: 'ar_JO-kareem-medium',
  ca: 'ca_ES-upc_ona-medium',
  cs: 'cs_CZ-jirka-medium',
  da: 'da_DK-talesyntese-medium',
  de: 'de_DE-thorsten-medium',
  el: 'el_GR-rapunzelina-low',
  en: 'en_US-amy-medium',
  es: 'es_ES-davefx-medium',
  fa: 'fa_IR-amir-medium',
  fi: 'fi_FI-harri-medium',
  fr: 'fr_FR-siwis-medium',
  hu: 'hu_HU-anna-medium',
  is: 'is_IS-salka-medium',
  it: 'it_IT-riccardo-x_low',
  ka: 'ka_GE-natia-medium',
  kk: 'kk_KZ-issai-high',
  lb: 'lb_LU-marylux-medium',
  ne: 'ne_NP-google-medium',
  nl: 'nl_NL-mls-medium',
  no: 'no_NO-talesyntese-medium',
  pl: 'pl_PL-gosia-medium',
  pt: 'pt_BR-faber-medium',
  ro: 'ro_RO-mihai-medium',
  ru: 'ru_RU-denis-medium',
  sk: 'sk_SK-lili-medium',
  sl: 'sl_SI-artur-medium',
  sr: 'sr_RS-serbski_institut-medium',
  sv: 'sv_SE-nst-medium',
  sw: 'sw_CD-lanfrica-medium',
  tr: 'tr_TR-fahrettin-medium',
  uk: 'uk_UA-ukrainian_tts-medium',
  vi: 'vi_VN-vais1000-medium',
  zh: 'zh_CN-huayan-medium',
};

const PIPER_LANGUAGE_LABELS: Record<string, string> = {
  ar: 'Arabic',
  ca: 'Catalan',
  cs: 'Czech',
  da: 'Danish',
  de: 'German',
  el: 'Greek',
  en: 'English',
  es: 'Spanish',
  fa: 'Persian',
  fi: 'Finnish',
  fr: 'French',
  hu: 'Hungarian',
  is: 'Icelandic',
  it: 'Italian',
  ka: 'Georgian',
  kk: 'Kazakh',
  lb: 'Luxembourgish',
  ne: 'Nepali',
  nl: 'Dutch',
  no: 'Norwegian',
  pl: 'Polish',
  pt: 'Portuguese',
  ro: 'Romanian',
  ru: 'Russian',
  sk: 'Slovak',
  sl: 'Slovenian',
  sr: 'Serbian',
  sv: 'Swedish',
  sw: 'Swahili',
  tr: 'Turkish',
  uk: 'Ukrainian',
  vi: 'Vietnamese',
  zh: 'Chinese',
};

export const PIPER_VOICE_OPTIONS: readonly PiperVoiceOption[] = Object.entries(PIPER_VOICES).map(
  ([languageCode, voiceId]) => ({
    languageCode,
    label: PIPER_LANGUAGE_LABELS[languageCode] ?? languageCode,
    voiceId,
    quality: voiceId.split('-').at(-1) ?? 'medium',
  }),
);

const piperVoiceIds = new Set(PIPER_VOICE_OPTIONS.map(({ voiceId }) => voiceId));
let piperModulePromise: Promise<PiperModule> | null = null;
const voiceDownloadTasks = new Map<
  string,
  {
    promise: Promise<void>;
    listeners: Set<(progress: PiperDownloadProgress) => void>;
  }
>();

const loadPiperModule = (): Promise<PiperModule> => {
  piperModulePromise ??= import('@realtimex/piper-tts-web');
  return piperModulePromise;
};

export const getPiperVoiceCatalog = (): PiperVoiceOption[] =>
  PIPER_VOICE_OPTIONS.map((option) => ({ ...option }));

export const getStoredPiperVoiceIds = async (): Promise<string[]> => {
  const piper = await loadPiperModule();
  return piper.stored();
};

export const downloadPiperVoice = async (
  voiceId: string,
  onProgress?: (progress: PiperDownloadProgress) => void,
): Promise<void> => {
  if (!piperVoiceIds.has(voiceId)) throw new Error(`Unsupported Piper voice: ${voiceId}`);
  const existing = voiceDownloadTasks.get(voiceId);
  if (existing) {
    if (onProgress) existing.listeners.add(onProgress);
    try {
      await existing.promise;
    } finally {
      if (onProgress) existing.listeners.delete(onProgress);
    }
    return;
  }

  const listeners = new Set<(progress: PiperDownloadProgress) => void>();
  if (onProgress) listeners.add(onProgress);
  const promise = (async () => {
    const piper = await loadPiperModule();
    await piper.download(voiceId, (progress) => {
      const ratio = progress.total > 0 ? progress.loaded / progress.total : 0;
      const update = {
        loaded: progress.loaded,
        total: progress.total,
        progress: Math.max(0, Math.min(1, ratio)),
      };
      for (const listener of listeners) listener(update);
    });
  })();
  voiceDownloadTasks.set(voiceId, { promise, listeners });

  try {
    await promise;
  } finally {
    voiceDownloadTasks.delete(voiceId);
  }
};

export const removePiperVoice = async (voiceId: string): Promise<void> => {
  if (!piperVoiceIds.has(voiceId)) throw new Error(`Unsupported Piper voice: ${voiceId}`);
  const activeSnapshot = activeController?.getSnapshot();
  if (
    activeSnapshot?.voiceId === voiceId &&
    activeSnapshot.status !== 'idle' &&
    activeSnapshot.status !== 'error'
  ) {
    throw new Error('Stop TTS before removing the active voice');
  }
  const piper = await loadPiperModule();
  await piper.remove(voiceId);
};

const INITIAL_SNAPSHOT: PiperPlaybackSnapshot = {
  status: 'idle',
  progress: 0,
  voiceId: null,
  error: null,
};

const controllers = new Map<string, PiperReaderController>();
let activeController: PiperReaderController | null = null;

/**
 * Resolve a Piper voice from the book's BCP-47/ISO language metadata.
 * Returning null is intentional: this phase has no language fallback.
 */
export const resolvePiperVoiceId = (language: string | string[] | undefined): string | null => {
  const rawLanguage = Array.isArray(language) ? language[0] : language;
  const languageCode = rawLanguage?.trim().toLowerCase().replace('_', '-').split('-')[0];
  return languageCode ? (PIPER_VOICES[languageCode] ?? null) : null;
};

export const isPiperTextFormat = (format: string | undefined): boolean =>
  format === 'EPUB' ||
  format === 'MOBI' ||
  format === 'AZW' ||
  format === 'AZW3' ||
  format === 'FB2' ||
  format === 'FBZ' ||
  format === 'TXT' ||
  format === 'MD';

class PiperReaderController {
  private snapshot: PiperPlaybackSnapshot = INITIAL_SNAPSHOT;
  private listeners = new Set<() => void>();
  private piper: PiperModule | null = null;
  private session: PiperSession | null = null;
  private tts: FoliateTTS | null = null;
  private audio: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  private operation = 0;
  private sessionPromise: Promise<PiperSession> | null = null;
  private preloadPromise: Promise<void> | null = null;
  private resolvePlayback: (() => void) | null = null;
  private sessionGeneration = 0;

  constructor(
    private readonly bookKey: string,
    private readonly view: FoliateView,
    private readonly language: string | string[] | undefined,
    private readonly rate: number,
  ) {}

  getSnapshot = (): PiperPlaybackSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  isFor(view: FoliateView, language: string | string[] | undefined, rate: number): boolean {
    return this.view === view && this.language === language && this.rate === rate;
  }

  async preload(): Promise<void> {
    const voiceId = resolvePiperVoiceId(this.language);
    if (!voiceId) return;
    await this.getSession(voiceId);
  }

  private async preloadVoice(voiceId: string): Promise<void> {
    if (this.preloadPromise) return this.preloadPromise;

    this.preloadPromise = (async () => {
      this.piper = this.piper ?? (await loadPiperModule());
      const storedVoices = await this.piper.stored();
      if (storedVoices.includes(voiceId)) return;
      await downloadPiperVoice(voiceId, ({ progress }) => {
        this.setSnapshot({ progress });
      });
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
    this.sessionGeneration += 1;
    this.resolvePlayback?.();
    this.resolvePlayback = null;
    this.audio?.pause();
    if (this.audio) {
      this.audio.removeAttribute('src');
      this.audio.load();
      this.audio = null;
    }
    this.revokeObjectUrl();
    this.session = null;
    this.sessionPromise = null;
    if (this.piper) this.piper.TtsSession._instance = null;
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
    const voiceId = resolvePiperVoiceId(this.language);
    if (!voiceId) {
      throw new Error('Piper does not have a voice for this book language');
    }
    const startLocation = getSelectedStartLocation(this.view);
    if (!startLocation) throw new PiperSelectionRequiredError();

    activeController?.stop();
    activeController = this;
    const operation = ++this.operation;
    this.setSnapshot({ status: 'loading', progress: 0, voiceId, error: null });

    try {
      const session = await this.getSession(voiceId);
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
      await this.playSegment(session, ssml, operation);
    } catch (error) {
      if (operation !== this.operation) return;
      this.setSnapshot({
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async playSegment(session: PiperSession, ssml: string, operation: number): Promise<void> {
    const segments = ssmlToSegments(ssml);
    for (const segment of segments) {
      if (operation !== this.operation) return;
      if (segment.markName) this.tts?.setMark(segment.markName);
      await this.playText(session, segment.text, operation);
    }

    if (operation !== this.operation || !this.tts) return;
    const next = this.tts.next();
    if (next) {
      await this.playSegment(session, next, operation);
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
    await this.playSegment(session, first, operation);
  }

  private async playText(session: PiperSession, text: string, operation: number): Promise<void> {
    const blob = await session.predict(text);
    if (operation !== this.operation) return;

    const audio = this.getAudio();
    this.revokeObjectUrl();
    this.objectUrl = URL.createObjectURL(blob);
    audio.src = this.objectUrl;
    audio.playbackRate = this.rate;
    this.setSnapshot({ status: 'playing', progress: 1 });

    await new Promise<void>((resolve, reject) => {
      const onEnded = () => finish();
      const onError = () => {
        cleanup();
        reject(new Error('Piper audio playback failed'));
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

  private async getSession(voiceId: string): Promise<PiperSession> {
    if (this.session?.voiceId === voiceId && this.session.ready) return this.session;
    if (this.sessionPromise) return this.sessionPromise;

    const generation = this.sessionGeneration;
    const task = (async () => {
      await this.preloadVoice(voiceId);
      if (!this.piper) throw new Error('Piper runtime failed to load');

      const TtsSession = this.piper.TtsSession;
      if (TtsSession._instance && TtsSession._instance.voiceId !== voiceId) {
        TtsSession._instance = null;
      }
      const session = await TtsSession.create({
        voiceId,
        allowLocalModels: true,
        fallbackStrategy: 'cdn',
      });
      if (generation === this.sessionGeneration) {
        this.session = session;
      } else if (TtsSession._instance === session) {
        TtsSession._instance = null;
      }
      return session;
    })();
    this.sessionPromise = task;

    try {
      return await task;
    } finally {
      if (this.sessionPromise === task) this.sessionPromise = null;
    }
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

  private setSnapshot(partial: Partial<PiperPlaybackSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...partial };
    for (const listener of this.listeners) listener();
  }
}

export const getPiperReaderController = (
  bookKey: string,
  view: FoliateView,
  bookDoc: BookDoc,
  rate = 1,
): PiperReaderController => {
  const normalizedRate = normalizeTTSRate(rate);
  const existing = controllers.get(bookKey);
  if (existing?.isFor(view, bookDoc.metadata.language, normalizedRate)) return existing;
  existing?.dispose();
  const controller = new PiperReaderController(
    bookKey,
    view,
    bookDoc.metadata.language,
    normalizedRate,
  );
  controllers.set(bookKey, controller);
  return controller;
};

export const disposePiperReaderController = (bookKey: string): void => {
  controllers.get(bookKey)?.dispose();
};

export type { PiperReaderController };
