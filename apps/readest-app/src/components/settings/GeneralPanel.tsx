import { useEffect, useMemo } from 'react';

import { useEnv } from '@/context/EnvContext';
import { saveViewSettings } from '@/helpers/settings';
import { useTranslation } from '@/hooks/useTranslation';
import { SUPPORTED_LNGS } from '@/i18n/i18n';
import { useSettingsStore } from '@/store/settingsStore';
import { useThemeStore } from '@/store/themeStore';
import type { SettingsPanelPanelProp } from './SettingsDialog';
import { BoxedList, SettingsRow, SettingsSelect } from './primitives';
import ThemeModeSelector from './theme/ThemeModeSelector';

const getNativeLanguageName = (language: string): string => {
  try {
    return new Intl.DisplayNames([language], { type: 'language' }).of(language) ?? language;
  } catch {
    return language;
  }
};

const GeneralPanel: React.FC<SettingsPanelPanelProp> = ({ onRegisterReset }) => {
  const _ = useTranslation();
  const { envConfig, appService } = useEnv();
  const { settings, applyUILanguage } = useSettingsStore();
  const { themeMode, setThemeMode } = useThemeStore();
  const uiLanguage = settings.globalViewSettings?.uiLanguage ?? '';
  const languageOptions = useMemo(
    () => [
      { value: '', label: _('System Language') },
      ...SUPPORTED_LNGS.map((language) => ({
        value: language,
        label: getNativeLanguageName(language),
      })),
    ],
    [_],
  );

  const setUILanguage = (language: string) => {
    applyUILanguage(language);
    void saveViewSettings(envConfig, '', 'uiLanguage', language, false, false);
  };

  const reset = () => {
    setUILanguage('');
    setThemeMode('auto');
  };

  useEffect(() => {
    onRegisterReset(reset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className='my-4 space-y-6'>
      <BoxedList title={_('Language')} data-setting-id='settings.general.language'>
        <SettingsRow label={_('Interface Language')}>
          <SettingsSelect
            value={uiLanguage}
            options={languageOptions}
            ariaLabel={_('Interface Language')}
            onChange={(event) => setUILanguage(event.target.value)}
          />
        </SettingsRow>
      </BoxedList>

      <BoxedList
        title={_('Appearance')}
        innerClassName='!divide-y-0 !ps-0 py-3'
        data-setting-id='settings.general.appearance'
      >
        <ThemeModeSelector
          themeMode={themeMode}
          onThemeModeChange={setThemeMode}
          hasAmbientLightSensor={!!appService?.hasAmbientLightSensor}
        />
      </BoxedList>
    </div>
  );
};

export default GeneralPanel;
