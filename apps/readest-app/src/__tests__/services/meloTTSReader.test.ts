import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: h.invoke,
}));

import {
  disposeMeloTTSReaderController,
  getMeloTTSReaderController,
} from '@/services/tts/meloTTSReader';
import { TTSSelectionRequiredError } from '@/services/tts/ttsReaderUtils';
import type { FoliateView } from '@/types/view';

class MockAudio extends EventTarget {
  static instances: MockAudio[] = [];
  src = '';
  preload = '';
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

const makeView = (hasSelection: boolean): FoliateView => {
  const range = { toString: () => (hasSelection ? '选中的文本' : '') } as Range;
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
    from: () => '<speak><mark name="start"/>你好，Readest。</speak>',
    next: () => undefined,
    setMark: vi.fn(),
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
  MockAudio.instances = [];
  h.invoke.mockImplementation(async (command: string) => {
    if (command === 'melotts_synthesize') return 'UklGRgAAAAA=';
    return null;
  });
  vi.stubGlobal('Audio', MockAudio);
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:melotts'),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  disposeMeloTTSReaderController('book');
  vi.unstubAllGlobals();
});

describe('MeloTTS reader', () => {
  it('warms the selected language only once without playing audio', async () => {
    const controller = getMeloTTSReaderController('book', makeView(true), {
      metadata: { language: 'zh-CN' },
    } as never);

    await controller.preload();
    await controller.preload();

    expect(h.invoke).toHaveBeenCalledTimes(1);
    expect(h.invoke).toHaveBeenCalledWith('melotts_synthesize', {
      languageCode: 'ZH',
      text: '准备。',
    });
    expect(MockAudio.instances).toHaveLength(0);
  });

  it('synthesizes selected Chinese text through the Tauri runtime and plays the WAV', async () => {
    const controller = getMeloTTSReaderController('book', makeView(true), {
      metadata: { language: 'zh-CN' },
    } as never);

    await controller.toggle();

    expect(h.invoke).toHaveBeenCalledWith('melotts_synthesize', {
      languageCode: 'ZH',
      text: '你好，Readest。',
    });
    expect(MockAudio.instances).toHaveLength(1);
  });

  it('requires a text selection before starting synthesis', async () => {
    const controller = getMeloTTSReaderController('book', makeView(false), {
      metadata: { language: 'zh-CN' },
    } as never);

    await expect(controller.toggle()).rejects.toBeInstanceOf(TTSSelectionRequiredError);
    expect(h.invoke).not.toHaveBeenCalled();
  });
});
