import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';

const h = vi.hoisted(() => ({
  appService: { isMobileApp: true },
  viewSettings: { volumeKeysToFlip: true } as Record<string, unknown> | null,
  settingsState: { settings: { hardwarePageTurner: undefined } },
}));

vi.mock('@/utils/bridge', () => ({ interceptKeys: vi.fn(), refreshEinkScreen: vi.fn() }));
vi.mock('@/context/EnvContext', () => ({ useEnv: () => ({ appService: h.appService }) }));
vi.mock('@/store/readerStore', () => ({
  useReaderStore: Object.assign(
    () => ({
      getViewSettings: () => h.viewSettings,
      getViewState: () => ({ inited: true }),
      hoveredBookKey: null,
      setHoveredBookKey: vi.fn(),
    }),
    { getState: () => ({ hoveredBookKey: null }) },
  ),
}));
vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: () => ({ getBookData: () => ({}) }),
}));
vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: Object.assign(
    (selector?: (state: typeof h.settingsState) => unknown) =>
      selector ? selector(h.settingsState) : h.settingsState,
    { getState: () => h.settingsState },
  ),
}));
vi.mock('@/store/sidebarStore', () => ({
  useSidebarStore: Object.assign(() => ({}), { getState: () => ({ sideBarBookKey: 'book-1' }) }),
}));

import { interceptKeys } from '@/utils/bridge';
import { eventDispatcher } from '@/utils/event';
import { useDeviceControlStore } from '@/store/deviceStore';
import { usePagination } from '@/app/reader/hooks/usePagination';
import type { FoliateView } from '@/types/view';

const setup = (view?: Partial<FoliateView>) =>
  renderHook(() =>
    usePagination('book-1', { current: (view ?? null) as FoliateView | null }, { current: null }),
  );

beforeEach(() => {
  useDeviceControlStore.setState({
    volumeKeysIntercepted: false,
    volumeKeysInterceptionCount: 0,
    pageTurnerKeysIntercepted: false,
    pageTurnerKeysInterceptionCount: 0,
  });
  h.viewSettings = { volumeKeysToFlip: true };
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('usePagination volume-key interception', () => {
  test('intercepts volume keys when enabled', () => {
    setup();
    expect(interceptKeys).toHaveBeenCalledWith({ volumeKeys: true });
  });

  test('does not intercept volume keys when disabled', () => {
    h.viewSettings = { volumeKeysToFlip: false };
    setup();
    expect(interceptKeys).not.toHaveBeenCalledWith({ volumeKeys: true });
  });

  test('turns the page for native volume keys', async () => {
    const next = vi.fn();
    setup({ renderer: { scrolled: false }, book: { dir: 'ltr' }, next } as unknown as FoliateView);

    await act(async () => {
      eventDispatcher.dispatch('native-key-down', { keyName: 'VolumeDown' });
    });

    expect(next).toHaveBeenCalled();
  });
});
