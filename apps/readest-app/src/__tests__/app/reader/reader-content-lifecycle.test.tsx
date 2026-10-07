import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SystemSettings } from '@/types/settings';

const fixture = vi.hoisted(() => ({
  env: {},
  keys: ['book-view'],
  ready: false,
  saveConfig: vi.fn(),
  saveSettings: vi.fn(),
  setBookKeys: vi.fn(),
  initViewState: vi.fn(),
  clearViewState: vi.fn(),
  view: { close: vi.fn(), remove: vi.fn() },
  translate: (key: string) => key,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({}), useSearchParams: () => null }));
vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ envConfig: fixture.env, appService: { hasWindow: false } }),
}));
vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => fixture.translate }));
vi.mock('@/hooks/useGamepad', () => ({ useGamepad: () => {} }));
vi.mock('@/app/reader/hooks/useBookShortcuts', () => ({ default: () => {} }));
vi.mock('@/app/reader/hooks/useBooksManager', () => ({
  default: () => ({ bookKeys: fixture.keys, dismissBook: vi.fn(), getNextBookKey: vi.fn() }),
}));
vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: () => ({
    getConfig: () => ({ location: 'final' }),
    getBookData: () => (fixture.ready ? { book: { hash: 'book' }, bookDoc: {} } : null),
    saveConfig: fixture.saveConfig,
  }),
}));
vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => ({
    getView: () => fixture.view,
    setBookKeys: fixture.setBookKeys,
    getViewSettings: () => (fixture.ready ? {} : null),
    initViewState: fixture.initViewState,
    getViewState: () => ({ isPrimary: true }),
    clearViewState: fixture.clearViewState,
  }),
}));
vi.mock('@/app/reader/components/sidebar/SideBar', () => ({ default: () => null }));
vi.mock('@/app/reader/components/BooksGrid', () => ({ default: () => <div>Books</div> }));
vi.mock('@/components/settings/SettingsDialog', () => ({ default: () => null }));
vi.mock('@/components/Spinner', () => ({ default: () => <div role='status'>Loading</div> }));
import ReaderContent from '@/app/reader/components/ReaderContent';
import { useSettingsStore } from '@/store/settingsStore';
import { eventDispatcher } from '@/utils/event';
const settings = {} as SystemSettings;
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  fixture.ready = false;
  fixture.saveConfig.mockResolvedValue(undefined);
  fixture.saveSettings.mockResolvedValue(undefined);
  useSettingsStore.setState({
    ...useSettingsStore.getInitialState(),
    saveSettings: fixture.saveSettings,
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
});
it('owns one loading timer across rerenders and clears it when data arrives', async () => {
  const { rerender, queryByRole, unmount } = render(
    <ReaderContent ids='book' settings={settings} />,
  );
  expect(vi.getTimerCount()).toBe(1);
  rerender(<ReaderContent ids='book' settings={{ ...settings }} />);
  expect(vi.getTimerCount()).toBe(1);
  await act(async () => vi.advanceTimersByTimeAsync(200));
  expect(queryByRole('status')).not.toBeNull();
  fixture.ready = true;
  rerender(<ReaderContent ids='book' settings={settings} />);
  expect(queryByRole('status')).toBeNull();
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
it('cancels loading before the delay when unmounted', () => {
  const { unmount } = render(<ReaderContent ids='book' settings={settings} />);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
it('preserves the close throttle across rerenders and cancels its trailing call', async () => {
  fixture.ready = true;
  const { rerender, unmount } = render(<ReaderContent ids='book' settings={settings} />);
  await act(async () => eventDispatcher.dispatch('close-reader'));
  expect(fixture.saveConfig).toHaveBeenCalledTimes(1);
  rerender(<ReaderContent ids='book' settings={{ ...settings }} />);
  await act(async () => eventDispatcher.dispatch('close-reader'));
  expect(fixture.saveConfig).toHaveBeenCalledTimes(1);
  await act(async () => vi.advanceTimersByTimeAsync(200));
  expect(fixture.saveConfig).toHaveBeenCalledTimes(2);
  await act(async () => eventDispatcher.dispatch('close-reader'));
  unmount();
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(fixture.saveConfig).toHaveBeenCalledTimes(2);
});
