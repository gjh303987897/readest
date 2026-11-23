import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEnv } from '@/context/EnvContext';
import { useThemeStore } from '@/store/themeStore';

export interface MacOSAppearance {
  material: 'liquid' | 'standard' | 'solid';
  reduceTransparency: boolean;
  increaseContrast: boolean;
  reduceMotion: boolean;
}

/** One bridge per window, mounted in Providers, including secondary reader windows. */
export const useMacOSAppearance = () => {
  const { appService } = useEnv();

  useEffect(() => {
    if (!appService?.isMacOSApp) return;
    const root = document.documentElement;
    root.dataset['platform'] = 'macos';
    root.dataset['macosMaterial'] = 'solid';
    let disposed = false;
    let queue = Promise.resolve();

    // Serialize native changes: a slow theme/e-ink update must not restore an
    // outdated material after the next accessibility or appearance change.
    const refresh = () => {
      queue = queue
        .then(async () => {
          if (disposed) return;
          const appearance = await invoke<MacOSAppearance>('configure_macos_glass', {
            enabled: root.dataset['eink'] !== 'true',
            darkMode: useThemeStore.getState().isDarkMode,
          });
          if (disposed) return;
          root.dataset['macosMaterial'] = appearance.material;
          root.dataset['reduceTransparency'] = String(appearance.reduceTransparency);
          root.dataset['increaseContrast'] = String(appearance.increaseContrast);
          root.dataset['reduceMotion'] = String(appearance.reduceMotion);
        })
        .catch((error: unknown) => {
          if (disposed) return;
          root.dataset['macosMaterial'] = 'solid';
          console.warn('Could not update macOS material:', error);
        });
    };
    const unsubscribe = useThemeStore.subscribe((state, previous) => {
      if (state.isDarkMode !== previous.isDarkMode) refresh();
    });
    const observer = new MutationObserver(refresh);
    observer.observe(root, { attributes: true, attributeFilter: ['data-eink'] });
    const setFocused = () => {
      root.dataset['windowFocused'] = String(document.hasFocus());
    };
    const onFocus = () => {
      setFocused();
      refresh();
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', setFocused);
    setFocused();
    const unlisten = listen('macos-appearance-changed', refresh);
    void unlisten.catch((error: unknown) => console.warn('macOS appearance listener:', error));
    refresh();

    return () => {
      disposed = true;
      unsubscribe();
      observer.disconnect();
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', setFocused);
      void unlisten.then((cleanup) => cleanup()).catch(() => {});
      for (const attribute of [
        'platform',
        'macosMaterial',
        'reduceTransparency',
        'increaseContrast',
        'reduceMotion',
        'windowFocused',
      ]) {
        delete root.dataset[attribute];
      }
    };
  }, [appService?.isMacOSApp]);
};
