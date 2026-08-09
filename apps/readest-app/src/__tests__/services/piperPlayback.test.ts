import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  predict: vi.fn(),
  stored: vi.fn(),
}));

vi.mock('@realtimex/piper-tts-web', () => {
  const session = {
    voiceId: 'en_US-amy-medium',
    ready: true,
    predict: h.predict,
  };
  class TtsSession {
    static _instance: typeof session | null = null;
    static create = vi.fn(async () => {
      TtsSession._instance = session;
      return session;
    });
  }
  return {
    stored: h.stored,
    download: vi.fn(),
    remove: vi.fn(),
    TtsSession,
  };
});

import { disposePiperReaderController, getPiperReaderController } from '@/services/tts/piperReader';
import { TtsSession } from '@realtimex/piper-tts-web';
import type { FoliateView } from '@/types/view';

class MockAudio extends EventTarget {
  static instances: MockAudio[] = [];
  src = '';
  preload = '';
  playbackRate = 1;
  pause = vi.fn();
  load = vi.fn();
  play = vi.fn(async () => {
    queueMicrotask(() => this.dispatchEvent(new Event('ended')));
  });

  constructor() {
    super();
    MockAudio.instances.push(this);
  }

  removeAttribute(name: string): void {
    if (name === 'src') this.src = '';
  }
}

const makeView = (): FoliateView => {
  const range = { toString: () => 'Selected text' } as Range;
  const doc = {
    getSelection: () =>
      ({
        rangeCount: 1,
        isCollapsed: false,
        getRangeAt: () => range,
      }) as unknown as Selection,
  } as unknown as Document;
  return {
    renderer: {
      primaryIndex: 0,
      getContents: () => [{ doc, index: 0 }],
    },
    book: { sections: [{ linear: 'yes' }] },
    getCFI: () => 'epubcfi(/6/2)',
    resolveCFI: () => ({ anchor: () => range }),
    goTo: vi.fn(async () => undefined),
    initTTS: vi.fn(async () => undefined),
    tts: {
      from: () => '<speak>Hello from Piper</speak>',
      next: () => undefined,
      setMark: vi.fn(),
    },
  } as unknown as FoliateView;
};

beforeEach(() => {
  vi.clearAllMocks();
  MockAudio.instances = [];
  h.stored.mockResolvedValue(['en_US-amy-medium']);
  h.predict.mockResolvedValue(new Blob(['wave'], { type: 'audio/wav' }));
  vi.stubGlobal('Audio', MockAudio);
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:piper'),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  disposePiperReaderController('book');
  vi.unstubAllGlobals();
});

describe('Piper playback', () => {
  it('applies the selected reading speed to generated audio', async () => {
    const controller = getPiperReaderController(
      'book',
      makeView(),
      {
        metadata: { language: 'en-US' },
      } as never,
      1.2,
    );

    await controller.toggle();

    expect(h.predict).toHaveBeenCalledWith('Hello from Piper');
    expect(MockAudio.instances[0]?.playbackRate).toBe(1.2);
    expect(TtsSession._instance).toBeNull();
    expect(MockAudio.instances[0]?.src).toBe('');
  });
});
