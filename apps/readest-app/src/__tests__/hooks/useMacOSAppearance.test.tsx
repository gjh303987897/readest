import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  isMac: true,
  invoke: vi.fn(),
  listen: vi.fn(),
  unlisten: vi.fn(),
}));
vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ appService: { isMacOSApp: native.isMac } }),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: native.invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: native.listen }));
vi.mock('@/store/themeStore', async () => {
  const { create } = await import('zustand');
  return { useThemeStore: create(() => ({ isDarkMode: false })) };
});

import { useMacOSAppearance, type MacOSAppearance } from '@/hooks/useMacOSAppearance';
import { useThemeStore } from '@/store/themeStore';

const regular: MacOSAppearance = {
  material: 'liquid',
  reduceTransparency: false,
  increaseContrast: false,
  reduceMotion: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  native.isMac = true;
  native.invoke.mockResolvedValue(regular);
  native.listen.mockResolvedValue(native.unlisten);
  useThemeStore.setState({ isDarkMode: false });
});

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset['eink'];
  vi.restoreAllMocks();
});

describe('macOS appearance bridge', () => {
  it('keeps other platforms out of native IPC and macOS styles', () => {
    native.isMac = false;
    renderHook(useMacOSAppearance);
    expect(native.invoke).not.toHaveBeenCalled();
    expect(native.listen).not.toHaveBeenCalled();
    expect(document.documentElement.dataset['platform']).toBeUndefined();
  });

  it('applies native material and refreshes for system accessibility changes', async () => {
    renderHook(useMacOSAppearance);
    const root = document.documentElement;
    await waitFor(() => expect(root.dataset['macosMaterial']).toBe('liquid'));
    expect(native.invoke).toHaveBeenCalledWith('configure_macos_glass', {
      enabled: true,
      darkMode: false,
    });

    native.invoke.mockResolvedValue({
      ...regular,
      material: 'solid',
      reduceTransparency: true,
      increaseContrast: true,
      reduceMotion: true,
    });
    act(() => native.listen.mock.calls[0]![1]());
    await waitFor(() => expect(root.dataset['macosMaterial']).toBe('solid'));
    expect(root.dataset['reduceTransparency']).toBe('true');
    expect(root.dataset['increaseContrast']).toBe('true');
    expect(root.dataset['reduceMotion']).toBe('true');
  });

  it('removes native glass for e-ink and restores it when e-ink is turned off', async () => {
    renderHook(useMacOSAppearance);
    await waitFor(() => expect(native.invoke).toHaveBeenCalledTimes(1));
    act(() => {
      document.documentElement.dataset['eink'] = 'true';
    });
    await waitFor(() =>
      expect(native.invoke).toHaveBeenLastCalledWith('configure_macos_glass', {
        enabled: false,
        darkMode: false,
      }),
    );
    act(() => {
      document.documentElement.dataset['eink'] = 'false';
    });
    await waitFor(() =>
      expect(native.invoke).toHaveBeenLastCalledWith('configure_macos_glass', {
        enabled: true,
        darkMode: false,
      }),
    );
  });

  it('serializes native updates and applies the current theme after an in-flight request', async () => {
    let resolveFirst!: (value: MacOSAppearance) => void;
    native.invoke.mockImplementationOnce(
      () => new Promise<MacOSAppearance>((resolve) => (resolveFirst = resolve)),
    );
    renderHook(useMacOSAppearance);
    await waitFor(() => expect(native.invoke).toHaveBeenCalledTimes(1));
    act(() => useThemeStore.setState({ isDarkMode: true }));
    expect(native.invoke).toHaveBeenCalledTimes(1);
    await act(async () => resolveFirst(regular));
    await waitFor(() =>
      expect(native.invoke).toHaveBeenLastCalledWith('configure_macos_glass', {
        enabled: true,
        darkMode: true,
      }),
    );
  });

  it('uses opaque chrome on IPC failure and recovers on the next update', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    native.invoke.mockRejectedValueOnce(new Error('Native material unavailable'));
    renderHook(useMacOSAppearance);
    await waitFor(() => expect(console.warn).toHaveBeenCalled());
    expect(document.documentElement.dataset['macosMaterial']).toBe('solid');
    act(() => native.listen.mock.calls[0]![1]());
    await waitFor(() => expect(document.documentElement.dataset['macosMaterial']).toBe('liquid'));
  });

  it('ignores late native responses and removes listeners after unmount', async () => {
    let resolve!: (value: MacOSAppearance) => void;
    native.invoke.mockImplementationOnce(
      () => new Promise<MacOSAppearance>((done) => (resolve = done)),
    );
    const { unmount } = renderHook(useMacOSAppearance);
    await waitFor(() => expect(native.invoke).toHaveBeenCalledTimes(1));
    unmount();
    await act(async () => resolve(regular));
    expect(document.documentElement.dataset['platform']).toBeUndefined();
    expect(document.documentElement.dataset['macosMaterial']).toBeUndefined();
    expect(native.unlisten).toHaveBeenCalledTimes(1);
  });
});
