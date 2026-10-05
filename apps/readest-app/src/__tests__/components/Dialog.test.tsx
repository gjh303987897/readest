import { act, cleanup, render } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Dialog from '@/components/Dialog';

const drag = vi.hoisted(() => ({
  move: (_data: { clientY: number; deltaY: number }) => {},
  end: (_data: { clientY: number; velocity: number }) => {},
}));

const device = vi.hoisted(() => ({ isMobile: false, isDesktopApp: false }));

vi.mock('@/hooks/useDrag', () => ({
  useDrag: (onMove: typeof drag.move, _onKeyDown: () => void, onEnd: typeof drag.end) => {
    drag.move = onMove;
    drag.end = onEnd;
    return { handleDragStart: () => {} };
  },
}));
vi.mock('@/context/EnvContext', () => ({ useEnv: () => ({ appService: device }) }));
vi.mock('@/store/themeStore', () => ({
  useThemeStore: () => ({ systemUIVisible: false, statusBarHeight: 0, safeAreaInsets: {} }),
}));
vi.mock('@/store/deviceStore', () => ({
  useDeviceControlStore: () => ({
    acquireBackKeyInterception: () => {},
    releaseBackKeyInterception: () => {},
  }),
}));
vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (key: string) => key }));
vi.mock('@/hooks/useResponsiveSize', () => ({ useResponsiveSize: (size: number) => size }));
vi.mock('@/utils/rtl', () => ({ getDirFromUILanguage: () => 'ltr' }));

beforeEach(() => {
  device.isMobile = false;
  device.isDesktopApp = false;
  vi.useFakeTimers();
  vi.stubGlobal('innerWidth', 390);
  vi.stubGlobal('innerHeight', 800);
});

describe('Dialog desktop sizing', () => {
  it('does not turn an 800 by 600 desktop window into a full-height sheet', () => {
    device.isDesktopApp = true;
    vi.stubGlobal('innerWidth', 800);
    vi.stubGlobal('innerHeight', 600);
    render(
      <Dialog isOpen onClose={() => {}}>
        Content
      </Dialog>,
    );

    const modal = document.querySelector<HTMLElement>('.modal-box');
    expect(modal?.style.height).toBe('');
    expect(modal?.style.bottom).toBe('');
    act(() => vi.advanceTimersByTime(16));
    expect(modal?.classList.contains('dialog-enter')).toBe(true);
  });

  it('keeps the mobile settings sheet snapped in landscape', () => {
    device.isMobile = true;
    vi.stubGlobal('innerWidth', 900);
    vi.stubGlobal('innerHeight', 700);
    render(
      <Dialog isOpen snapHeight={0.7} onClose={() => {}}>
        Content
      </Dialog>,
    );

    expect(document.querySelector<HTMLElement>('.modal-box')?.style.height).toBe('70%');
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Dialog drag dismissal', () => {
  it('finishes the slide before notifying a parent that unmounts immediately', () => {
    const onClose = vi.fn();
    const SettingsSheet = () => {
      const [isOpen, setIsOpen] = useState(true);
      return isOpen ? (
        <Dialog
          isOpen
          snapHeight={0.7}
          onClose={() => {
            onClose();
            setIsOpen(false);
          }}
        >
          Content
        </Dialog>
      ) : null;
    };
    render(<SettingsSheet />);

    act(() => {
      drag.move({ clientY: 600, deltaY: 20 });
      drag.end({ clientY: 600, velocity: 1 });
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(document.querySelector<HTMLElement>('.modal-box')?.style.transform).toBe(
      'translateY(100%)',
    );
    expect(document.querySelector('dialog')).not.toBeNull();
    act(() => vi.advanceTimersByTime(150));
    expect(onClose).toHaveBeenCalledOnce();
    expect(document.querySelector('dialog')).toBeNull();
  });

  it('does not restart the exit animation after the drag finishes', () => {
    const ControlledDialog = () => {
      const [isOpen, setIsOpen] = useState(true);
      return (
        <Dialog isOpen={isOpen} onClose={() => setIsOpen(false)}>
          Content
        </Dialog>
      );
    };
    render(<ControlledDialog />);
    act(() => vi.advanceTimersByTime(16));

    act(() => {
      drag.move({ clientY: 600, deltaY: 20 });
      drag.end({ clientY: 600, velocity: 1 });
    });

    expect(document.querySelector('.modal-box')?.classList.contains('dialog-slide-exit')).toBe(
      false,
    );
    act(() => vi.advanceTimersByTime(150));
    expect(document.querySelector('dialog')).toBeNull();
  });

  it('restores the overlay when a drag returns to the open position', () => {
    render(
      <Dialog isOpen onClose={() => {}}>
        Content
      </Dialog>,
    );

    act(() => {
      drag.move({ clientY: 250, deltaY: 20 });
      drag.end({ clientY: 250, velocity: 0.1 });
    });

    expect(document.querySelector<HTMLElement>('.overlay')?.style.opacity).toBe('1');
  });

  it('keeps the settings sheet opaque when it snaps back to partial height', () => {
    render(
      <Dialog isOpen snapHeight={0.7} onClose={() => {}}>
        Content
      </Dialog>,
    );

    act(() => {
      drag.move({ clientY: 250, deltaY: 20 });
      drag.end({ clientY: 250, velocity: 0.1 });
    });

    const modal = document.querySelector<HTMLElement>('.modal-box');
    expect(modal?.style.opacity).toBe('');
    expect(modal?.style.height).toBe('70%');
    expect(document.querySelector<HTMLElement>('.overlay')?.style.opacity).toBe('1');
  });
});
