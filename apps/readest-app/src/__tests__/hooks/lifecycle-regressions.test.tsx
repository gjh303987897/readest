import { act, cleanup, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { BookConfig } from '@/types/book';
import type { EnvConfigType } from '@/services/environment';

const fixture = vi.hoisted(() => ({
  environment: { marker: 'initial' },
  service: { isAndroidApp: true },
  config: { location: 'initial' } as BookConfig | null,
  getConfig: vi.fn(),
  saveConfig: vi.fn(),
  progress: { fraction: 0 },
  flush: vi.fn(),
  initialize: vi.fn(),
  acquire: vi.fn(),
  release: vi.fn(),
  translate: (key: string) => key,
}));
vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ envConfig: fixture.environment, appService: fixture.service }),
}));
vi.mock('@/store/deviceStore', () => ({
  useDeviceControlStore: () => ({
    acquireBackKeyInterception: fixture.acquire,
    releaseBackKeyInterception: fixture.release,
  }),
}));
vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: (
    selector: (state: {
      getConfig: typeof fixture.getConfig;
      saveConfig: typeof fixture.saveConfig;
    }) => unknown,
  ) => selector({ getConfig: fixture.getConfig, saveConfig: fixture.saveConfig }),
  flushPendingLibrarySave: fixture.flush,
}));
vi.mock('@/store/readerProgressStore', () => ({ useBookProgress: () => fixture.progress }));
vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => fixture.translate }));
vi.mock('@/services/transferManager', () => ({
  transferManager: { initialize: fixture.initialize },
}));
import { useKeyDownActions } from '@/hooks/useKeyDownActions';
import { useProgressAutoSave } from '@/app/reader/hooks/useProgressAutoSave';
import { useTransferQueue } from '@/hooks/useTransferQueue';
import { eventDispatcher } from '@/utils/event';

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  fixture.environment = { marker: 'initial' };
  fixture.config = { location: 'initial' } as BookConfig;
  fixture.progress = { fraction: 0 };
  fixture.getConfig.mockImplementation(() => fixture.config);
  fixture.saveConfig.mockResolvedValue(undefined);
  fixture.flush.mockResolvedValue(undefined);
  fixture.initialize.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('uses the latest keyboard and native-back callbacks after rerender', () => {
  const old = vi.fn(),
    fresh = vi.fn();
  const { rerender } = renderHook(
    ({ callback }) => useKeyDownActions({ onCancel: callback, onConfirm: callback }),
    { initialProps: { callback: old } },
  );
  rerender({ callback: fresh });
  fireEvent.keyDown(window, { key: 'Escape' });
  fireEvent.keyDown(window, { key: 'Enter' });
  eventDispatcher.dispatchSync('native-key-down', { keyName: 'Back' });
  expect(old).not.toHaveBeenCalled();
  expect(fresh).toHaveBeenCalledTimes(3);
});
it('cleans up a retained element when disabled, re-enabled and unmounted', () => {
  const element = document.createElement('div'),
    callback = vi.fn();
  const ref = { current: element };
  document.body.append(element);
  const { rerender, unmount } = renderHook(
    ({ enabled }) => useKeyDownActions({ onCancel: callback, enabled, elementRef: ref }),
    { initialProps: { enabled: true } },
  );
  rerender({ enabled: false });
  fireEvent.keyDown(element, { key: 'Escape' });
  expect(callback).not.toHaveBeenCalled();
  rerender({ enabled: true });
  fireEvent.keyDown(element, { key: 'Escape' });
  expect(callback).toHaveBeenCalledTimes(1);
  unmount();
  fireEvent.keyDown(element, { key: 'Escape' });
  expect(callback).toHaveBeenCalledTimes(1);
  expect(fixture.acquire).toHaveBeenCalledTimes(2);
  expect(fixture.release).toHaveBeenCalledTimes(2);
  element.remove();
});
it('flushes dirty progress immediately on unmount without leaving a timer', async () => {
  const { unmount } = renderHook(() => useProgressAutoSave('book-a'));
  fixture.config = { location: 'final' } as BookConfig;
  unmount();
  await act(async () => {});
  expect(fixture.saveConfig).toHaveBeenCalledTimes(1);
  expect(fixture.saveConfig.mock.calls[0]![2]).toMatchObject({ location: 'final' });
  expect(fixture.flush).toHaveBeenCalledTimes(1);
  await act(async () => vi.advanceTimersByTimeAsync(5000));
  expect(fixture.saveConfig).toHaveBeenCalledTimes(1);
});
it('does not write the initial relocate or a config already cleared by teardown', async () => {
  const { unmount } = renderHook(() => useProgressAutoSave('book-a'));
  await act(async () => vi.advanceTimersByTimeAsync(1500));
  expect(fixture.saveConfig).not.toHaveBeenCalled();
  fixture.config = null;
  unmount();
  await act(async () => {});
  expect(fixture.saveConfig).not.toHaveBeenCalled();
});
it('uses the latest environment and flushes the shelf after the per-book save', async () => {
  let finish!: () => void;
  fixture.saveConfig.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const { rerender, unmount } = renderHook(() => useProgressAutoSave('book-a'));
  fixture.environment = { marker: 'new' };
  fixture.config = { location: 'next' } as BookConfig;
  fixture.progress = { fraction: 0.5 };
  rerender();
  await act(async () => vi.advanceTimersByTimeAsync(1500));
  expect(fixture.saveConfig.mock.calls[0]![0] as EnvConfigType).toBe(fixture.environment);
  unmount();
  expect(fixture.flush).not.toHaveBeenCalled();
  finish();
  await act(async () => {});
  expect(fixture.flush).toHaveBeenCalledTimes(1);
  expect(fixture.saveConfig).toHaveBeenCalledTimes(1);
});
it('cancels delayed transfer initialization on unmount', async () => {
  const { unmount } = renderHook(() => useTransferQueue(true, 1000));
  unmount();
  await vi.advanceTimersByTimeAsync(1000);
  expect(fixture.initialize).not.toHaveBeenCalled();
});
it('replaces pending initialization and initializes only with the current delay', async () => {
  const { rerender } = renderHook(({ delay }) => useTransferQueue(true, delay), {
    initialProps: { delay: 1000 },
  });
  rerender({ delay: 2000 });
  await vi.advanceTimersByTimeAsync(1000);
  expect(fixture.initialize).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1000);
  expect(fixture.initialize).toHaveBeenCalledTimes(1);
});
