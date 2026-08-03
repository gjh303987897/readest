import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useEnv } from '@/context/EnvContext';
import { useLibraryStore } from '@/store/libraryStore';
import { isTauriAppPlatform } from '@/services/environment';
import { navigateToLibrary } from '@/utils/nav';
import { eventDispatcher } from '@/utils/event';

export function useOpenWithBooks() {
  const router = useRouter();
  const { appService } = useEnv();
  const setCheckOpenWithBooks = useLibraryStore((state) => state.setCheckOpenWithBooks);

  useEffect(() => {
    if (!isTauriAppPlatform() || !appService) return;

    const onIncoming = (event: CustomEvent) => {
      const { urls } = event.detail as { urls: string[] };
      const files = urls
        .map((url) => {
          if (!url.startsWith('file://')) return url;
          return appService.isIOSApp ? decodeURI(url) : decodeURI(url.replace('file://', ''));
        })
        .filter((url) => !/^(https?:|data:|blob:|readest:)/i.test(url));
      if (files.length === 0) return;

      window.OPEN_WITH_FILES = files;
      setCheckOpenWithBooks(true);
      navigateToLibrary(router, `reload=${Date.now()}`);
    };

    eventDispatcher.on('app-incoming-url', onIncoming);
    return () => eventDispatcher.off('app-incoming-url', onIncoming);
  }, [appService, router, setCheckOpenWithBooks]);
}
