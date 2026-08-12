'use client';

import clsx from 'clsx';
import * as React from 'react';
import { useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { LockKeyhole } from 'lucide-react';

import { useEnv } from '@/context/EnvContext';
import { useTheme } from '@/hooks/useTheme';
import { useLibrary } from '@/hooks/useLibrary';
import { useThemeStore } from '@/store/themeStore';
import { useReaderStore } from '@/store/readerStore';
import { useSidebarStore } from '@/store/sidebarStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useDeviceControlStore } from '@/store/deviceStore';
import { useScreenWakeLock } from '@/hooks/useScreenWakeLock';
import { useScreenBrightness } from '@/app/reader/hooks/useScreenBrightness';
import { eventDispatcher } from '@/utils/event';
import { interceptWindowOpen } from '@/utils/open';
import { mountAdditionalFonts } from '@/styles/fonts';
import { isTauriAppPlatform } from '@/services/environment';
import { getSysFontsList, setSystemUIVisibility } from '@/utils/bridge';
import { Toast } from '@/components/Toast';
import PrivacyUnlockDialog from '@/components/PrivacyUnlockDialog';
import { usePrivacyStore } from '@/store/privacyStore';
import { BOOK_IDS_SEPARATOR } from '@/services/constants';
import { getLocale } from '@/utils/misc';
import { initDayjs } from '@/utils/time';
import { useTranslation } from '@/hooks/useTranslation';
import ReaderContent from './ReaderContent';

const Reader: React.FC<{ ids?: string }> = ({ ids }) => {
  const router = useRouter();
  const _ = useTranslation();
  const { appService } = useEnv();
  const { settings } = useSettingsStore();
  const { libraryLoaded } = useLibrary();
  const { sideBarBookKey } = useSidebarStore();
  const { hoveredBookKey, bookKeys } = useReaderStore();
  const { showSystemUI, dismissSystemUI } = useThemeStore();
  const { acquireBackKeyInterception, releaseBackKeyInterception } = useDeviceControlStore();
  const { isSideBarVisible, isSideBarPinned } = useSidebarStore();
  const { getIsSideBarVisible, setSideBarVisible } = useSidebarStore();
  const { isDarkMode, systemUIAlwaysHidden, isRoundedWindow } = useThemeStore();
  const { isInitialized: privacyInitialized, isUnlocked, hiddenBookHashes } = usePrivacyStore();
  const [showPrivacyUnlock, setShowPrivacyUnlock] = React.useState(false);

  const requestedIds = React.useMemo(() => {
    if (typeof window === 'undefined') return [];
    const params = new URLSearchParams(window.location.search);
    const rawIds = ids || params.get('ids') || window.location.pathname.split('/reader/')[1] || '';
    return rawIds.split(BOOK_IDS_SEPARATOR).filter(Boolean);
  }, [ids]);
  const openBookIds = React.useMemo(
    () => bookKeys.map((key) => key.split('-')[0]!).filter(Boolean),
    [bookKeys],
  );
  const privacyBlocked =
    privacyInitialized &&
    !isUnlocked &&
    [...requestedIds, ...openBookIds].some((id) => hiddenBookHashes.includes(id));

  useTheme({ systemUIVisible: settings.alwaysShowStatusBar, appThemeColor: 'base-100' });
  useScreenWakeLock(settings.screenWakeLock, appService?.hasWindow);
  useScreenBrightness();

  useEffect(() => {
    mountAdditionalFonts(document);
    interceptWindowOpen();
    if (isTauriAppPlatform()) {
      setTimeout(getSysFontsList, 3000);
    }
    initDayjs(getLocale());
  }, []);

  useEffect(() => {
    if (privacyBlocked) document.title = _('Privacy Mode Locked');
  }, [privacyBlocked, _]);

  const handleKeyDown = (event: CustomEvent) => {
    if (event.detail.keyName === 'Back') {
      const { hoveredBookKey, setHoveredBookKey } = useReaderStore.getState();
      if (hoveredBookKey) {
        setHoveredBookKey('');
        (document.activeElement as HTMLElement)?.blur();
      } else if (getIsSideBarVisible() && !isSideBarPinned) {
        setSideBarVisible(false);
      } else {
        eventDispatcher.dispatch('close-reader');
        router.back();
      }
      return true;
    }
    return false;
  };

  useEffect(() => {
    if (!appService?.isAndroidApp) return;
    acquireBackKeyInterception();
    return () => {
      releaseBackKeyInterception();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appService?.isAndroidApp]);

  useEffect(() => {
    if (appService?.isAndroidApp) {
      eventDispatcher.onSync('native-key-down', handleKeyDown);
    }
    return () => {
      if (appService?.isAndroidApp) {
        eventDispatcher.offSync('native-key-down', handleKeyDown);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appService?.isAndroidApp, sideBarBookKey, isSideBarPinned, isSideBarVisible]);

  useEffect(() => {
    if (!appService?.isMobileApp) return;
    const systemUIVisible = !!hoveredBookKey || settings.alwaysShowStatusBar;
    const visible = !!(systemUIVisible && !systemUIAlwaysHidden);
    setSystemUIVisibility({ visible, darkMode: isDarkMode });
    if (visible) {
      showSystemUI();
    } else {
      dismissSystemUI();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoveredBookKey]);

  if (!libraryLoaded || !settings.globalReadSettings || !privacyInitialized) {
    return <div className='full-height bg-base-100'></div>;
  }

  if (privacyBlocked) {
    return (
      <div className='bg-base-100 text-base-content full-height flex items-center justify-center px-6'>
        <div className='flex max-w-sm flex-col items-center gap-4 text-center'>
          <LockKeyhole className='h-10 w-10 opacity-60' />
          <h1 className='text-lg font-semibold'>{_('Privacy Mode Locked')}</h1>
          <p className='text-base-content/70 text-sm'>
            {_('Enter your PIN to access this private book and its related data.')}
          </p>
          <button className='btn btn-contrast' onClick={() => setShowPrivacyUnlock(true)}>
            {_('Unlock')}
          </button>
        </div>
        <PrivacyUnlockDialog
          isOpen={showPrivacyUnlock}
          onClose={() => setShowPrivacyUnlock(false)}
        />
      </div>
    );
  }

  return (
    <div
      className={clsx(
        'reader-page bg-base-100 text-base-content full-height select-none overflow-hidden',
        appService?.hasRoundedWindow && isRoundedWindow && 'window-border rounded-window',
      )}
    >
      <Suspense fallback={<div className='full-height'></div>}>
        <ReaderContent ids={ids} settings={settings} />
        <Toast />
      </Suspense>
    </div>
  );
};

export default Reader;
