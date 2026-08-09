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
  static autoEnd = true;
  src = '';
  preload = '';
  pause = vi.fn();
  load = vi.fn();
  play = vi.fn(async () => {
    if (MockAudio.autoEnd) queueMicrotask(() => this.dispatchEvent(new Event('ended')));
  });

  constructor() {
    super();
    MockAudio.instances.push(this);
  }

  removeAttribute(name: string): void {
    if (name === 'src') this.src = '';
  }
}

const makeView = (hasSelection: boolean, followingSentences: string[] = []): FoliateView => {
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
    next: vi.fn(() => followingSentences.shift()),
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
  MockAudio.autoEnd = true;
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
    const controller = getMeloTTSReaderController(
      'book',
      makeView(true),
      {
        metadata: { language: 'zh-CN' },
      } as never,
      1.1,
    );

    await controller.preload();
    await controller.preload();

    expect(h.invoke).toHaveBeenCalledTimes(1);
    expect(h.invoke).toHaveBeenCalledWith('melotts_synthesize', {
      device: 'cpu',
      languageCode: 'ZH',
      text: '准备。',
      speed: 1.1,
    });
    expect(MockAudio.instances).toHaveLength(0);
  });

  it('synthesizes selected Chinese text through the Tauri runtime and plays the WAV', async () => {
    const controller = getMeloTTSReaderController(
      'book',
      makeView(true),
      {
        metadata: { language: 'zh-CN' },
      } as never,
      0.9,
    );

    await controller.toggle();

    expect(h.invoke).toHaveBeenCalledWith('melotts_synthesize', {
      device: 'cpu',
      languageCode: 'ZH',
      text: '你好，Readest。',
      speed: 0.9,
    });
    expect(MockAudio.instances).toHaveLength(1);
  });

  it('synthesizes the next sentence while the current sentence is playing', async () => {
    const view = makeView(true, ['<speak><mark name="next"/>下一句。</speak>']);
    const controller = getMeloTTSReaderController(
      'book',
      view,
      {
        metadata: { language: 'zh-CN' },
      } as never,
      1,
    );
    await controller.preload();
    h.invoke.mockClear();
    MockAudio.autoEnd = false;

    const playback = controller.toggle();
    await vi.waitFor(() => expect(MockAudio.instances[0]?.play).toHaveBeenCalledTimes(1));
    const tts = view.tts as unknown as {
      next: ReturnType<typeof vi.fn>;
      setMark: ReturnType<typeof vi.fn>;
    };
    expect(tts.setMark).toHaveBeenCalledWith('start');
    expect(tts.setMark.mock.invocationCallOrder[0]).toBeLessThan(
      tts.next.mock.invocationCallOrder[0]!,
    );
    await vi.waitFor(() =>
      expect(h.invoke).toHaveBeenCalledWith('melotts_synthesize', {
        device: 'cpu',
        languageCode: 'ZH',
        text: '下一句。',
        speed: 1,
      }),
    );
    await vi.waitFor(() => expect(MockAudio.instances).toHaveLength(2));

    MockAudio.instances[0]?.dispatchEvent(new Event('ended'));
    await vi.waitFor(() => expect(MockAudio.instances[1]?.play).toHaveBeenCalledTimes(1));
    MockAudio.instances[1]?.dispatchEvent(new Event('ended'));
    await playback;
  });

  it('passes the selected GPU device to the MeloTTS runtime', async () => {
    const controller = getMeloTTSReaderController(
      'book',
      makeView(true),
      {
        metadata: { language: 'zh-CN' },
      } as never,
      1,
      'gpu',
    );

    await controller.preload();

    expect(h.invoke).toHaveBeenCalledWith('melotts_synthesize', {
      device: 'gpu',
      languageCode: 'ZH',
      text: '准备。',
      speed: 1,
    });
  });

  it('releases audio objects and the Python runtime when stopped', async () => {
    const controller = getMeloTTSReaderController('book', makeView(true), {
      metadata: { language: 'zh-CN' },
    } as never);
    await controller.preload();
    h.invoke.mockClear();
    MockAudio.autoEnd = false;

    const playback = controller.toggle();
    await vi.waitFor(() => expect(MockAudio.instances[0]?.play).toHaveBeenCalled());
    controller.stop();
    await playback;

    await vi.waitFor(() => expect(h.invoke).toHaveBeenCalledWith('melotts_release'));
    expect(MockAudio.instances.every((audio) => audio.src === '')).toBe(true);
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it('requires a text selection before starting synthesis', async () => {
    const controller = getMeloTTSReaderController('book', makeView(false), {
      metadata: { language: 'zh-CN' },
    } as never);

    await expect(controller.toggle()).rejects.toBeInstanceOf(TTSSelectionRequiredError);
    expect(h.invoke).not.toHaveBeenCalled();
  });
});
