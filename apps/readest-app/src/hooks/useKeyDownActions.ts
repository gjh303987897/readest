import { RefObject, useEffect, useRef } from 'react';
import { useEnv } from '@/context/EnvContext';
import { useDeviceControlStore } from '@/store/deviceStore';
import { eventDispatcher } from '@/utils/event';

interface UseKeyDownOptions {
  onCancel?: () => void;
  onConfirm?: () => void;
  enabled?: boolean;
  elementRef?: RefObject<HTMLElement | null>;
}

export const useKeyDownActions = ({
  onCancel,
  onConfirm,
  enabled = true,
  elementRef: providedRef,
}: UseKeyDownOptions) => {
  const { appService } = useEnv();
  const { acquireBackKeyInterception, releaseBackKeyInterception } = useDeviceControlStore();
  const internalRef = useRef<HTMLDivElement | null>(null);
  const elementRef = providedRef || internalRef;
  const callbacks = useRef({ onCancel, onConfirm });
  callbacks.current = { onCancel, onConfirm };

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent | CustomEvent) => {
      if (event instanceof CustomEvent) {
        if (event.detail.keyName === 'Back') {
          callbacks.current.onCancel?.();
          return true;
        }
      } else {
        if (event.key === 'Escape') {
          callbacks.current.onCancel?.();
        } else if (event.key === 'Enter') {
          callbacks.current.onConfirm?.();
        }
        event.stopPropagation();
      }
      return false;
    };

    window.addEventListener('keydown', handleKeyDown);

    const element = elementRef.current;
    element?.addEventListener('keydown', handleKeyDown);

    if (appService?.isAndroidApp) {
      acquireBackKeyInterception?.();
      eventDispatcher.onSync('native-key-down', handleKeyDown);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      element?.removeEventListener('keydown', handleKeyDown);

      if (appService?.isAndroidApp) {
        releaseBackKeyInterception?.();
        eventDispatcher.offSync('native-key-down', handleKeyDown);
      }
    };
  }, [
    enabled,
    appService?.isAndroidApp,
    elementRef,
    acquireBackKeyInterception,
    releaseBackKeyInterception,
  ]);

  return internalRef;
};
