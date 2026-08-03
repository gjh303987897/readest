import clsx from 'clsx';
import { Copy, Minus, Square, X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useEnv } from '@/context/EnvContext';

import { tauriHandleMinimize, tauriHandleToggleMaximize, tauriHandleClose } from '@/utils/window';
import { isTauriAppPlatform } from '@/services/environment';
import { useTranslation } from '@/hooks/useTranslation';

interface WindowButtonsProps {
  className?: string;
  headerRef?: React.RefObject<HTMLElement | null>;
  showMinimize?: boolean;
  showMaximize?: boolean;
  showClose?: boolean;
  closeButtonLabel?: string;
  onMinimize?: () => void | Promise<void>;
  onToggleMaximize?: () => void | Promise<void>;
  onClose?: () => void | Promise<void>;
}

interface WindowButtonProps {
  id: string;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  close?: boolean;
  pressed?: boolean;
}

const WindowButton: React.FC<WindowButtonProps> = ({
  onClick,
  label,
  id,
  children,
  close,
  pressed,
}) => (
  <button
    id={id}
    type='button'
    onClick={onClick}
    className={clsx('window-button', close && 'window-button-close')}
    aria-label={label}
    aria-pressed={pressed}
    title={label}
  >
    {children}
  </button>
);

const WindowButtons: React.FC<WindowButtonsProps> = ({
  className,
  headerRef,
  showMinimize = true,
  showMaximize = true,
  showClose = true,
  closeButtonLabel,
  onMinimize,
  onToggleMaximize,
  onClose,
}) => {
  const _ = useTranslation();
  const { appService } = useEnv();
  const [isMaximized, setIsMaximized] = useState(false);

  const touchState = useRef({
    lastPointerTime: 0,
    pointerStartPosition: { x: 0, y: 0 },
    isDragging: false,
  });

  const isExcludedElement = (target: HTMLElement) => {
    return (
      target.closest('.btn') ||
      target.closest('.window-button') ||
      target.closest('.dropdown-container') ||
      target.closest('.exclude-title-bar-mousedown') ||
      target.closest('button, input, textarea, select, a, [role="button"]')
    );
  };

  const handleMouseDown = async (e: MouseEvent) => {
    const target = e.target as HTMLElement;

    if (isExcludedElement(target)) {
      return;
    }

    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    if (e.buttons === 1) {
      if (e.detail === 2) {
        getCurrentWindow().toggleMaximize();
      } else {
        getCurrentWindow().startDragging();
      }
    }
  };

  const handlePointerDown = async (e: PointerEvent) => {
    const target = e.target as HTMLElement;

    if (isExcludedElement(target)) {
      return;
    }

    if (e.pointerType === 'mouse') {
      return;
    }

    e.preventDefault();

    const currentTime = Date.now();
    const timeDiff = currentTime - touchState.current.lastPointerTime;

    touchState.current.pointerStartPosition = {
      x: e.clientX,
      y: e.clientY,
    };

    if (timeDiff < 300) {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      getCurrentWindow().toggleMaximize();
      return;
    }

    touchState.current.lastPointerTime = currentTime;
    touchState.current.isDragging = false;
  };

  const handlePointerMove = async (e: PointerEvent) => {
    const target = e.target as HTMLElement;

    if (isExcludedElement(target) || touchState.current.isDragging) {
      return;
    }

    if (e.pointerType === 'mouse') {
      return;
    }

    e.preventDefault();

    const deltaX = Math.abs(e.clientX - touchState.current.pointerStartPosition.x);
    const deltaY = Math.abs(e.clientY - touchState.current.pointerStartPosition.y);

    if (deltaX > 5 || deltaY > 5) {
      touchState.current.isDragging = true;
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().startDragging();
      } catch (error) {
        console.warn('Failed to start window dragging:', error);
      }
    }
  };

  const handlePointerUp = () => {
    touchState.current.isDragging = false;
  };

  useEffect(() => {
    if (!isTauriAppPlatform()) return;
    const headerElement = headerRef?.current;
    if (!headerElement) return;

    headerElement.addEventListener('mousedown', handleMouseDown);
    headerElement.addEventListener('pointerdown', handlePointerDown);
    headerElement.addEventListener('pointermove', handlePointerMove);
    headerElement.addEventListener('pointerup', handlePointerUp);
    headerElement.addEventListener('pointercancel', handlePointerUp);

    return () => {
      headerElement.removeEventListener('mousedown', handleMouseDown);
      headerElement.removeEventListener('pointerdown', handlePointerDown);
      headerElement.removeEventListener('pointermove', handlePointerMove);
      headerElement.removeEventListener('pointerup', handlePointerUp);
      headerElement.removeEventListener('pointercancel', handlePointerUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isTauriAppPlatform() || !appService?.hasWindowBar) return;

    let disposed = false;
    let unlisten: (() => void) | undefined;

    void import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
      const currentWindow = getCurrentWindow();
      const updateMaximizedState = async () => {
        const maximized = await currentWindow.isMaximized();
        if (!disposed) setIsMaximized(maximized);
      };

      await updateMaximizedState();
      unlisten = await currentWindow.onResized(() => void updateMaximizedState());
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [appService?.hasWindowBar]);

  const handleMinimize = async () => {
    if (onMinimize) {
      await onMinimize();
    } else {
      await tauriHandleMinimize();
    }
  };

  const handleMaximize = async () => {
    if (onToggleMaximize) {
      await onToggleMaximize();
    } else {
      await tauriHandleToggleMaximize();
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      setIsMaximized(await getCurrentWindow().isMaximized());
    }
  };

  const handleClose = async () => {
    if (onClose) {
      await onClose();
    } else {
      await tauriHandleClose();
    }
  };

  return (
    <div
      className={clsx(
        'window-buttons eink-bordered flex h-9 shrink-0 items-center justify-end',
        showClose || showMaximize || showMinimize ? 'visible' : 'hidden',
        className,
      )}
    >
      {showMinimize && appService?.hasWindowBar && (
        <WindowButton onClick={handleMinimize} label={_('Minimize')} id='titlebar-minimize'>
          <Minus aria-hidden='true' size={15} strokeWidth={1.8} />
        </WindowButton>
      )}

      {showMaximize && appService?.hasWindowBar && (
        <WindowButton
          onClick={handleMaximize}
          label={_('Maximize or Restore')}
          id='titlebar-maximize'
          pressed={isMaximized}
        >
          {isMaximized ? (
            <Copy aria-hidden='true' size={13} strokeWidth={1.8} />
          ) : (
            <Square aria-hidden='true' size={12} strokeWidth={1.8} />
          )}
        </WindowButton>
      )}

      {showClose && (appService?.hasWindowBar || onClose) && (
        <WindowButton
          onClick={handleClose}
          label={closeButtonLabel || _('Close')}
          id='titlebar-close'
          close
        >
          <X aria-hidden='true' size={15} strokeWidth={1.8} />
        </WindowButton>
      )}
    </div>
  );
};

export default WindowButtons;
