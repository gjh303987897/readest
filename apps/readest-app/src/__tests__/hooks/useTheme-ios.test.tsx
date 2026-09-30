import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  appService: { isMobileApp: true, isIOSApp: true, isAndroidApp: false },
  themeMode: 'auto',
  setSystemUIVisibility: vi.fn(async () => ({ success: true })),
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ appService: mocks.appService }),
}));
vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({ settings: { globalReadSettings: { customThemes: [] } } }),
}));
vi.mock('@/store/themeStore', () => ({
  useThemeStore: () => ({
    themeMode: mocks.themeMode,
    themeColor: 'default',
    isDarkMode: false,
    showSystemUI: vi.fn(),
    dismissSystemUI: vi.fn(),
    updateAppTheme: vi.fn(),
    setStatusBarHeight: vi.fn(),
    systemUIAlwaysHidden: false,
    setSystemUIAlwaysHidden: vi.fn(),
  }),
}));
vi.mock('@/hooks/useSafeAreaInsets', () => ({
  useSafeAreaInsets: () => ({ onUpdateInsets: vi.fn() }),
}));
vi.mock('@/utils/bridge', () => ({
  getStatusBarHeight: vi.fn(async () => ({ height: 0 })),
  setSystemUIVisibility: mocks.setSystemUIVisibility,
}));

import { useTheme } from '@/hooks/useTheme';

function ThemeConsumer() {
  useTheme();
  return null;
}

describe('iOS native appearance', () => {
  beforeEach(() => {
    mocks.appService.isIOSApp = true;
    mocks.appService.isAndroidApp = false;
    mocks.themeMode = 'auto';
    mocks.setSystemUIVisibility.mockClear();
  });
  afterEach(cleanup);

  it('lets UIKit follow the system appearance in auto mode', () => {
    render(<ThemeConsumer />);
    expect(mocks.setSystemUIVisibility).toHaveBeenCalledWith({
      visible: true,
      darkMode: false,
      followSystem: true,
    });
  });

  it('keeps the app-selected appearance in manual mode', () => {
    mocks.themeMode = 'light';
    render(<ThemeConsumer />);
    expect(mocks.setSystemUIVisibility).toHaveBeenCalledWith({
      visible: true,
      darkMode: false,
      followSystem: false,
    });
  });

  it('updates the native window when the theme mode changes without a color change', () => {
    const { rerender } = render(<ThemeConsumer />);
    mocks.setSystemUIVisibility.mockClear();
    mocks.themeMode = 'light';
    rerender(<ThemeConsumer />);
    expect(mocks.setSystemUIVisibility).toHaveBeenCalledWith({
      visible: true,
      darkMode: false,
      followSystem: false,
    });
  });

  it('leaves the existing Android bridge payload and update cadence unchanged', () => {
    mocks.appService.isIOSApp = false;
    mocks.appService.isAndroidApp = true;
    const { rerender } = render(<ThemeConsumer />);
    expect(mocks.setSystemUIVisibility).toHaveBeenCalledWith({ visible: true, darkMode: false });

    mocks.setSystemUIVisibility.mockClear();
    mocks.themeMode = 'light';
    rerender(<ThemeConsumer />);
    expect(mocks.setSystemUIVisibility).not.toHaveBeenCalled();
  });
});
