import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DropdownProvider } from '@/context/DropdownContext';

const h = vi.hoisted(() => ({
  downloadPiperVoice: vi.fn(),
  getStoredPiperVoiceIds: vi.fn(),
  removePiperVoice: vi.fn(),
  downloadMeloTTSModel: vi.fn(),
  getStoredMeloTTSModelCodes: vi.fn(),
  removeMeloTTSModel: vi.fn(),
  saveSysSettings: vi.fn(),
  onRegisterReset: vi.fn(),
}));

const envConfig = {};

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ envConfig, appService: null }),
}));

vi.mock('@/helpers/settings', () => ({
  saveSysSettings: h.saveSysSettings,
}));

vi.mock('@/services/tts/piperReader', () => ({
  getPiperVoiceCatalog: () => [
    {
      languageCode: 'en',
      label: 'English',
      voiceId: 'en_US-amy-medium',
      quality: 'medium',
    },
    {
      languageCode: 'zh',
      label: 'Chinese',
      voiceId: 'zh_CN-huayan-medium',
      quality: 'medium',
    },
  ],
  getStoredPiperVoiceIds: h.getStoredPiperVoiceIds,
  downloadPiperVoice: h.downloadPiperVoice,
  removePiperVoice: h.removePiperVoice,
}));

vi.mock('@/services/tts/meloTTSModels', () => ({
  getMeloTTSModelCatalog: () => [
    {
      code: 'EN',
      languageCode: 'en',
      label: 'English',
      checkpointUrl: 'https://example.com/EN/checkpoint.pth',
      configUrl: 'https://example.com/EN/config.json',
      supportsMixedEnglish: false,
    },
    {
      code: 'ZH',
      languageCode: 'zh',
      label: 'Chinese',
      checkpointUrl: 'https://example.com/ZH/checkpoint.pth',
      configUrl: 'https://example.com/ZH/config.json',
      supportsMixedEnglish: true,
    },
  ],
  getStoredMeloTTSModelCodes: h.getStoredMeloTTSModelCodes,
  downloadMeloTTSModel: h.downloadMeloTTSModel,
  removeMeloTTSModel: h.removeMeloTTSModel,
}));

import TTSPanel from '@/components/settings/TTSPanel';
import { useSettingsStore } from '@/store/settingsStore';
import type { SystemSettings } from '@/types/settings';

beforeEach(() => {
  h.onRegisterReset.mockClear();
  h.getStoredPiperVoiceIds.mockReset().mockResolvedValue(['en_US-amy-medium']);
  h.downloadPiperVoice.mockReset().mockImplementation(async (_voiceId, onProgress) => {
    onProgress?.({ loaded: 1, total: 1, progress: 1 });
  });
  h.removePiperVoice.mockReset().mockResolvedValue(undefined);
  h.getStoredMeloTTSModelCodes.mockReset().mockResolvedValue(['EN']);
  h.downloadMeloTTSModel.mockReset().mockImplementation(async (_code, onProgress) => {
    onProgress?.({ loaded: 1, total: 1, progress: 1 });
  });
  h.removeMeloTTSModel.mockReset().mockResolvedValue(undefined);
  h.saveSysSettings.mockReset().mockImplementation(async (_env, key, value) => {
    useSettingsStore.setState((state) => ({
      settings: { ...state.settings, [key]: value },
    }));
  });
  useSettingsStore.setState({
    settings: {
      ttsEngine: 'piper',
      ttsRate: 1,
      ttsMeloDevice: 'cpu',
    } as SystemSettings,
  });
});

afterEach(cleanup);

describe('TTSPanel', () => {
  it('selects and persists the reading speed', async () => {
    render(
      <DropdownProvider>
        <TTSPanel bookKey='' onRegisterReset={h.onRegisterReset} />
      </DropdownProvider>,
    );

    const selector = screen.getByRole('button', { name: 'Reading speed' });
    expect(selector.textContent).toContain('1x');
    expect(selector.className).toContain('overflow-hidden');
    fireEvent.click(selector);
    fireEvent.click(screen.getByRole('menuitem', { name: /1.1x/ }));

    await waitFor(() => expect(h.saveSysSettings).toHaveBeenCalledWith(envConfig, 'ttsRate', 1.1));
  });

  it('selects the MeloTTS inference device', async () => {
    useSettingsStore.setState({
      settings: {
        ttsEngine: 'melotts',
        ttsRate: 1,
        ttsMeloDevice: 'cpu',
      } as SystemSettings,
    });
    render(
      <DropdownProvider>
        <TTSPanel bookKey='' onRegisterReset={h.onRegisterReset} />
      </DropdownProvider>,
    );

    const deviceControl = screen.getByRole('radiogroup', { name: 'Inference device' });
    expect(deviceControl.className).toContain('eink-bordered');
    fireEvent.click(screen.getByRole('radio', { name: 'GPU' }));

    await waitFor(() =>
      expect(h.saveSysSettings).toHaveBeenCalledWith(envConfig, 'ttsMeloDevice', 'gpu'),
    );
  });

  it('selects and persists the global TTS engine', async () => {
    render(
      <DropdownProvider>
        <TTSPanel bookKey='' onRegisterReset={h.onRegisterReset} />
      </DropdownProvider>,
    );

    const selector = screen.getByRole('button', { name: 'TTS engine' });
    expect(selector.textContent).toContain('Piper');
    expect(selector.className).toContain('w-full');
    expect(selector.className).toContain('overflow-hidden');

    fireEvent.click(selector);
    const menu = screen
      .getByRole('menuitem', { name: /System default/ })
      .closest('.menu-container');
    expect(menu?.className).toContain('max-w-[calc(100vw-2rem)]');
    expect(screen.getByRole('menuitem', { name: /System default/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Piper/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /MeloTTS/ })).toBeTruthy();

    fireEvent.click(screen.getByRole('menuitem', { name: /MeloTTS/ }));

    await waitFor(() =>
      expect(h.saveSysSettings).toHaveBeenCalledWith(envConfig, 'ttsEngine', 'melotts'),
    );
    await waitFor(() => expect(screen.queryByRole('menuitem', { name: /MeloTTS/ })).toBeNull());
    expect(screen.getByText(/six official language models/)).toBeTruthy();
  });

  it('downloads and removes Piper voices from the local cache', async () => {
    render(
      <DropdownProvider>
        <TTSPanel bookKey='' onRegisterReset={h.onRegisterReset} />
      </DropdownProvider>,
    );

    await screen.findByText('English');
    expect(screen.getAllByText('Downloaded')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    await waitFor(() =>
      expect(h.downloadPiperVoice).toHaveBeenCalledWith(
        'zh_CN-huayan-medium',
        expect.any(Function),
      ),
    );
    await waitFor(() => expect(screen.getAllByText('Downloaded')).toHaveLength(2));

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]!);
    await waitFor(() => expect(h.removePiperVoice).toHaveBeenCalledWith('en_US-amy-medium'));
    await waitFor(() => expect(screen.getAllByText('Downloaded')).toHaveLength(1));
  });

  it('downloads and removes MeloTTS language models from the local cache', async () => {
    useSettingsStore.setState({ settings: { ttsEngine: 'melotts' } as SystemSettings });
    render(
      <DropdownProvider>
        <TTSPanel bookKey='' onRegisterReset={h.onRegisterReset} />
      </DropdownProvider>,
    );

    await screen.findByText('English');
    expect(screen.getByText(/Chinese and English mixed text/)).toBeTruthy();
    expect(screen.getAllByText('Downloaded')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    await waitFor(() =>
      expect(h.downloadMeloTTSModel).toHaveBeenCalledWith('ZH', expect.any(Function)),
    );
    await waitFor(() => expect(screen.getAllByText('Downloaded')).toHaveLength(2));

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]!);
    await waitFor(() => expect(h.removeMeloTTSModel).toHaveBeenCalledWith('EN'));
  });
});
