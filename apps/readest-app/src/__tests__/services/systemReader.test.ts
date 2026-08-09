import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  disposeSystemReaderController,
  getSystemReaderController,
} from '@/services/tts/systemReader';
import { TTSSelectionRequiredError } from '@/services/tts/ttsReaderUtils';
import type { FoliateView } from '@/types/view';

const speechSynthesisMock = {
  paused: false,
  speaking: false,
  pending: false,
  speak: vi.fn((utterance: { text: string; onend: (() => void) | null }) => {
    speechSynthesisMock.speaking = true;
    utterance.onend?.();
    speechSynthesisMock.speaking = false;
  }),
  pause: vi.fn(() => {
    speechSynthesisMock.paused = true;
  }),
  resume: vi.fn(() => {
    speechSynthesisMock.paused = false;
  }),
  cancel: vi.fn(),
};
const speechSynthesis = speechSynthesisMock as unknown as SpeechSynthesis;

class MockSpeechSynthesisUtterance {
  lang = '';
  onend: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;

  constructor(readonly text: string) {}
}

const makeView = (hasSelection: boolean): FoliateView => {
  const range = { toString: () => (hasSelection ? 'Selected text' : '') } as Range;
  const doc = {
    getSelection: () =>
      hasSelection
        ? ({
            rangeCount: 1,
            isCollapsed: false,
            getRangeAt: () => range,
          } as unknown as Selection)
        : ({ rangeCount: 0, isCollapsed: true } as Selection),
  } as unknown as Document;
  const tts = {
    from: () => '<speak>Hello from system TTS</speak>',
    next: () => undefined,
    setMark: () => undefined,
  };
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
    tts,
  } as unknown as FoliateView;
};

beforeEach(() => {
  vi.clearAllMocks();
  speechSynthesisMock.paused = false;
});

afterEach(() => {
  disposeSystemReaderController('book');
  vi.restoreAllMocks();
});

describe('System TTS reader', () => {
  it('reads the selected text with the system speech synthesis API', async () => {
    Object.assign(window, { speechSynthesis });
    Object.assign(globalThis, { SpeechSynthesisUtterance: MockSpeechSynthesisUtterance });
    const controller = getSystemReaderController('book', makeView(true), {
      metadata: { language: 'zh-CN' },
    } as never);

    await controller.toggle();

    expect(speechSynthesisMock.speak).toHaveBeenCalledTimes(1);
    expect(speechSynthesisMock.speak.mock.calls[0]?.[0].text).toBe('Hello from system TTS');
  });

  it('requires a text selection before starting', async () => {
    Object.assign(window, { speechSynthesis });
    Object.assign(globalThis, { SpeechSynthesisUtterance: MockSpeechSynthesisUtterance });
    const controller = getSystemReaderController('book', makeView(false), {
      metadata: { language: 'en-US' },
    } as never);

    await expect(controller.toggle()).rejects.toBeInstanceOf(TTSSelectionRequiredError);
    expect(speechSynthesisMock.speak).not.toHaveBeenCalled();
  });
});
