import { useEffect, useRef, useState } from 'react';
import { useEnv } from '@/context/EnvContext';
import { useLibraryStore } from '@/store/libraryStore';
import { useSettingsStore } from '@/store/settingsStore';
import { usePrivacyStore } from '@/store/privacyStore';

export const useLibrary = () => {
  const { envConfig } = useEnv();
  const { setLibrary, libraryLoaded: storeLibraryLoaded } = useLibraryStore();
  const { setSettings } = useSettingsStore();
  // Skip the disk reload when another mount has already populated the store.
  const [libraryLoaded, setLibraryLoaded] = useState(storeLibraryLoaded);
  const isInitiating = useRef(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (isInitiating.current || storeLibraryLoaded) {
      if (storeLibraryLoaded && !libraryLoaded) {
        setLibraryLoaded(true);
      }
      return;
    }
    isInitiating.current = true;
    let cancelled = false;
    setLibraryError(null);
    const initLibrary = async () => {
      try {
        const appService = await envConfig.getAppService();
        usePrivacyStore.getState().hydrate();
        const settings = await appService.loadSettings();
        if (cancelled) return;
        setSettings(settings);
        const books = await appService.loadLibraryBooks();
        if (cancelled) return;
        const latest = useLibraryStore.getState().library;
        setLibrary(
          Array.from(new Map([...books, ...latest].map((book) => [book.hash, book])).values()),
        );
        setLibraryLoaded(true);
      } catch (error) {
        if (!cancelled) setLibraryError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) isInitiating.current = false;
      }
    };

    initLibrary();
    return () => {
      cancelled = true;
      isInitiating.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeLibraryLoaded, attempt]);

  return { libraryLoaded, libraryError, retryLibrary: () => setAttempt((value) => value + 1) };
};
