import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { BookConfig } from '@/types/book';
const fixture = vi.hoisted(() => ({
  env: {},
  router: {},
  setConfig: vi.fn(),
  getConfig: vi.fn(),
  client: { pushChanges: vi.fn(), pullChanges: vi.fn() },
  saveSettings: vi.fn(),
  setIsSyncing: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => fixture.router }));
vi.mock('@/utils/nav', () => ({ navigateToLogin: vi.fn() }));
vi.mock('@/context/EnvContext', () => ({ useEnv: () => ({ envConfig: fixture.env }) }));
vi.mock('@/context/SyncContext', () => ({
  useSyncContext: () => ({ syncClient: fixture.client }),
}));
vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: () => ({ getConfig: fixture.getConfig, setConfig: fixture.setConfig }),
}));
vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => ({ setIsSyncing: fixture.setIsSyncing }),
}));
import { useSettingsStore } from '@/store/settingsStore';
import { useSync } from '@/hooks/useSync';
import { navigateToLogin } from '@/utils/nav';
beforeEach(() => {
  vi.clearAllMocks();
  useSettingsStore.setState({
    ...useSettingsStore.getInitialState(),
    settings: {
      version: 1,
      lastSyncedAtBooks: 0,
      lastSyncedAtConfigs: 0,
      keepLogin: true,
    } as never,
    saveSettings: fixture.saveSettings,
  });
  fixture.getConfig.mockReturnValue({ location: 'start', lastSyncedAtConfig: 0 } as BookConfig);
  fixture.saveSettings.mockResolvedValue(undefined);
  fixture.client.pushChanges.mockResolvedValue({ books: null, configs: null, notes: null });
  fixture.client.pullChanges.mockResolvedValue({ books: [], configs: [], notes: [] });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('publishes new settings references for book and config sync cursors', async () => {
  const original = useSettingsStore.getState().settings;
  const selected = renderHook(() => useSettingsStore((state) => state.settings));
  const { result } = renderHook(() => useSync());
  fixture.client.pullChanges.mockResolvedValueOnce({
    books: [
      { book_hash: 'book', synced_at: '2026-10-07T00:00:00Z', uploaded_at: '2026-10-07T00:00:00Z' },
    ],
    configs: null,
    notes: null,
  });
  await act(async () => {
    await result.current.syncBooks(undefined, 'pull', 0);
  });
  expect(original.lastSyncedAtBooks).toBe(0);
  expect(selected.result.current).not.toBe(original);
  expect(selected.result.current.lastSyncedAtBooks).toBe(Date.parse('2026-10-07T00:00:00Z'));
  const beforeConfigs = selected.result.current;
  await act(async () => {
    await result.current.syncConfigs(undefined, undefined, undefined, 'pull');
  });
  expect(selected.result.current).not.toBe(beforeConfigs);
  expect(beforeConfigs.lastSyncedAtConfigs).toBe(0);
});
it('clears keepLogin immutably after an authentication error', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const before = useSettingsStore.getState().settings;
  const { result } = renderHook(() => useSync());
  fixture.client.pullChanges.mockRejectedValue(new Error('Not authenticated'));
  await act(async () => {
    await result.current.syncBooks(undefined, 'pull', 0);
  });
  expect(before.keepLogin).toBe(true);
  expect(useSettingsStore.getState().settings.keepLogin).toBe(false);
  expect(navigateToLogin).toHaveBeenCalledTimes(1);
});
it('uses the current book key when a hook is reused for another book', async () => {
  const { result, rerender } = renderHook(({ key }) => useSync(key), {
    initialProps: { key: 'book-a' },
  });
  rerender({ key: 'book-b' });
  await act(async () => {
    await result.current.syncConfigs([{}] as BookConfig[], 'book-b', undefined, 'both');
  });
  expect(fixture.setConfig).toHaveBeenCalledWith(
    'book-b',
    expect.objectContaining({ lastPushedAtConfig: expect.any(Number) }),
  );
  expect(fixture.setConfig).toHaveBeenCalledWith(
    'book-b',
    expect.objectContaining({ lastSyncedAtConfig: expect.any(Number) }),
  );
  expect(fixture.setConfig.mock.calls.every(([key]) => key === 'book-b')).toBe(true);
});
