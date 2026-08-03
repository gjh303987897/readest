import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { SystemSettings } from '@/types/settings';

/**
 * A sync request must not overwrite local settings changed while its network
 * request was in flight.
 */

const h = vi.hoisted(() => {
  const baseSettings = (): SystemSettings =>
    ({
      version: 1,
      keepLogin: true,
      lastSyncedAtBooks: 0,
      lastSyncedAtConfigs: 0,
      swipeBrightnessGesture: true,
    }) as unknown as SystemSettings;

  // The live store object. `settings` is reassigned (new ref) to model a
  // component calling setSettings with a fresh object, exactly like the
  // WebDAV connect handler does.
  const storeState = {
    settings: baseSettings(),
    setSettings: vi.fn((s: SystemSettings) => {
      storeState.settings = s;
    }),
    saveSettings: vi.fn(async (_env: unknown, _settings: SystemSettings) => {}),
  };

  return { baseSettings, storeState };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ envConfig: { id: 'env' } }),
}));

const syncClientMock = vi.hoisted(() => ({
  pullChanges: vi.fn(),
  pushChanges: vi.fn(async () => ({ books: null, configs: null })),
}));

vi.mock('@/context/SyncContext', () => ({
  useSyncContext: () => ({ syncClient: syncClientMock }),
}));

vi.mock('@/services/sync/syncCategories', () => ({
  isSyncCategoryEnabled: () => true,
}));

vi.mock('@/store/settingsStore', () => {
  const useSettingsStore = ((selector?: (s: typeof h.storeState) => unknown) =>
    selector ? selector(h.storeState) : h.storeState) as unknown as {
    (): typeof h.storeState;
    getState: () => typeof h.storeState;
  };
  useSettingsStore.getState = () => h.storeState;
  return { useSettingsStore };
});

vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: () => ({ getConfig: () => null, setConfig: vi.fn() }),
}));

vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => ({ setIsSyncing: vi.fn() }),
}));

vi.mock('@/utils/nav', () => ({ navigateToLogin: vi.fn() }));

vi.mock('@/utils/transform', () => ({
  transformBookFromDB: (x: unknown) => x,
  transformBookConfigFromDB: (x: unknown) => x,
}));

import { useSync } from '@/hooks/useSync';

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

beforeEach(() => {
  h.storeState.settings = h.baseSettings();
  h.storeState.setSettings.mockClear();
  h.storeState.saveSettings.mockClear();
  syncClientMock.pullChanges.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('useSync pull persistence (issue #4780)', () => {
  test('does not clobber settings changed during an in-flight pull', async () => {
    // A pull whose network round-trip we control by hand.
    let resolvePull: (value: unknown) => void = () => {};
    syncClientMock.pullChanges.mockImplementation(
      () =>
        new Promise((res) => {
          resolvePull = res;
        }),
    );

    const { result } = renderHook(() => useSync());

    // Capture a pull while the hook still holds the original settings object.
    const pull = result.current.pullChanges;

    let pullDone!: Promise<unknown>;
    await act(async () => {
      pullDone = pull('books', 0, vi.fn(), vi.fn());
      await flush();
    });

    const updated = h.baseSettings();
    updated.swipeBrightnessGesture = false;
    h.storeState.settings = updated;

    // The network completes and the pull finalises.
    await act(async () => {
      resolvePull({ books: [] });
      await pullDone;
      await flush();
    });

    expect(h.storeState.saveSettings).toHaveBeenCalled();
    const lastSaved = h.storeState.saveSettings.mock.calls.at(-1)![1];
    expect(lastSaved.swipeBrightnessGesture).toBe(false);
  });
});
