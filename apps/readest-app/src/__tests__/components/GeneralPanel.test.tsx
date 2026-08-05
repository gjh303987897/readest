import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  envConfig: {},
  applyUILanguage: vi.fn(),
  saveViewSettings: vi.fn(async () => {}),
  setThemeMode: vi.fn(),
  onRegisterReset: vi.fn(),
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({
    envConfig: h.envConfig,
    appService: { hasAmbientLightSensor: false },
  }),
}));

vi.mock('@/helpers/settings', () => ({
  saveViewSettings: h.saveViewSettings,
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

vi.mock('@/i18n/i18n', () => ({
  SUPPORTED_LNGS: ['en', 'zh-CN'],
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({
    settings: { globalViewSettings: { uiLanguage: 'en' } },
    applyUILanguage: h.applyUILanguage,
  }),
}));

vi.mock('@/store/themeStore', () => ({
  useThemeStore: () => ({
    themeMode: 'auto',
    setThemeMode: h.setThemeMode,
  }),
}));

import GeneralPanel from '@/components/settings/GeneralPanel';

beforeEach(() => {
  h.applyUILanguage.mockClear();
  h.saveViewSettings.mockClear();
  h.setThemeMode.mockClear();
  h.onRegisterReset.mockClear();
});

afterEach(cleanup);

describe('GeneralPanel', () => {
  it('applies and persists the selected interface language', () => {
    render(<GeneralPanel bookKey='' onRegisterReset={h.onRegisterReset} />);

    const language = screen.getByLabelText('Interface Language');
    fireEvent.change(language, { target: { value: 'zh-CN' } });

    expect(h.applyUILanguage).toHaveBeenCalledWith('zh-CN');
    expect(h.saveViewSettings).toHaveBeenCalledWith(
      h.envConfig,
      '',
      'uiLanguage',
      'zh-CN',
      false,
      false,
    );
  });

  it('switches to dark mode and resets general settings', () => {
    render(<GeneralPanel bookKey='' onRegisterReset={h.onRegisterReset} />);

    fireEvent.click(screen.getByRole('radio', { name: 'Dark Mode' }));
    expect(h.setThemeMode).toHaveBeenCalledWith('dark');

    const reset = h.onRegisterReset.mock.calls[0]?.[0];
    expect(reset).toBeTypeOf('function');
    act(() => reset?.());

    expect(h.applyUILanguage).toHaveBeenCalledWith('');
    expect(h.saveViewSettings).toHaveBeenCalledWith(
      h.envConfig,
      '',
      'uiLanguage',
      '',
      false,
      false,
    );
    expect(h.setThemeMode).toHaveBeenLastCalledWith('auto');
  });
});
