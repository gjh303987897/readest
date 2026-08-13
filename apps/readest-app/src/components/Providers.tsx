'use client';

import '@/utils/polyfill';
import i18n from '@/i18n/i18n';
import { useEffect } from 'react';
import { IconContext } from 'react-icons';

import { AuthProvider } from '@/context/AuthContext';
import { DropdownProvider } from '@/context/DropdownContext';
import { SyncProvider } from '@/context/SyncContext';
import { useEnv } from '@/context/EnvContext';
import { initSystemThemeListener, loadDataTheme } from '@/store/themeStore';
import { initializePrivacyStore, usePrivacyStore } from '@/store/privacyStore';
import { useBookDataStore } from '@/store/bookDataStore';
import { useSidebarStore } from '@/store/sidebarStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useSafeAreaInsets } from '@/hooks/useSafeAreaInsets';
import { useSettingsSync } from '@/hooks/useSettingsSync';
import { usePrivacySync } from '@/hooks/usePrivacySync';
import { useDefaultIconSize } from '@/hooks/useResponsiveSize';
import { useEinkMode } from '@/hooks/useEinkMode';
import { getLocale } from '@/utils/misc';
import { getDirFromUILanguage } from '@/utils/rtl';
import { getAndroidPatchedViewportContent } from '@/utils/viewport';

const PrivacySyncBridge = () => {
  usePrivacySync();
  return null;
};

const Providers = ({ children }: { children: React.ReactNode }) => {
  const { envConfig, appService } = useEnv();
  const { applyUILanguage } = useSettingsStore();
  const { applyEinkMode } = useEinkMode();
  const iconSize = useDefaultIconSize();

  useSafeAreaInsets();
  useSettingsSync();

  useEffect(() => {
    const cleanupPrivacyStore = initializePrivacyStore();
    const unsubscribe = usePrivacyStore.subscribe((state, previous) => {
      const cloudLockActivated = state.isCloudUnlockRequired && !previous.isCloudUnlockRequired;
      const privacyModeLocked = !state.isUnlocked && previous.isUnlocked;
      if (!cloudLockActivated && !privacyModeLocked) return;
      if (cloudLockActivated) {
        useBookDataStore.setState({ booksData: {} });
        useSidebarStore.setState({ searchNavStates: {}, searchStatuses: {} });
        return;
      }
      const hiddenHashes = new Set([...previous.hiddenBookHashes, ...state.hiddenBookHashes]);
      hiddenHashes.forEach((hash) => useBookDataStore.getState().clearBookData(hash));
      useSidebarStore.setState((sidebarState) => ({
        searchNavStates: Object.fromEntries(
          Object.entries(sidebarState.searchNavStates).filter(
            ([bookKey]) => !hiddenHashes.has(bookKey.split('-')[0]!),
          ),
        ),
        searchStatuses: Object.fromEntries(
          Object.entries(sidebarState.searchStatuses).filter(
            ([bookKey]) => !hiddenHashes.has(bookKey.split('-')[0]!),
          ),
        ),
      }));
    });
    return () => {
      unsubscribe();
      cleanupPrivacyStore();
    };
  }, []);

  useEffect(() => {
    const handleLanguageChanged = (language: string) => {
      document.documentElement.lang = language;
      document.documentElement.classList.toggle('ui-rtl', getDirFromUILanguage() === 'rtl');
    };
    handleLanguageChanged(getLocale());
    i18n.on('languageChanged', handleLanguageChanged);
    return () => i18n.off('languageChanged', handleLanguageChanged);
  }, []);

  useEffect(() => {
    loadDataTheme();
    if (!appService) return;
    initSystemThemeListener(appService);
    void appService.loadSettings().then((settings) => {
      applyUILanguage(settings.globalViewSettings.uiLanguage);
      applyEinkMode(!!settings.globalViewSettings.isEink);
    });
  }, [envConfig, appService, applyUILanguage, applyEinkMode]);

  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!meta) return;
    const updated = getAndroidPatchedViewportContent(navigator.userAgent, meta.content);
    if (updated) meta.content = updated;
  }, []);

  if (!appService) return null;

  return (
    <AuthProvider>
      <PrivacySyncBridge />
      <IconContext.Provider value={{ size: `${iconSize}px` }}>
        <SyncProvider>
          <DropdownProvider>{children}</DropdownProvider>
        </SyncProvider>
      </IconContext.Provider>
    </AuthProvider>
  );
};

export default Providers;
