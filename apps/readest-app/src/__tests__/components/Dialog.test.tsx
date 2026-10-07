import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Dialog from '@/components/Dialog';

const drag = vi.hoisted(() => ({
  move: (_data: { clientY: number; deltaY: number }) => {},
  end: (_data: { clientY: number; velocity: number }) => {},
}));

const device = vi.hoisted(() => ({ isMobile: false, isDesktopApp: false, dir: 'ltr' }));

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
vi.mock('@/utils/rtl', () => ({ getDirFromUILanguage: () => device.dir }));

beforeEach(() => {
  device.isMobile = false;
  device.isDesktopApp = false;
  device.dir = 'ltr';
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

describe('Dialog close animation', () => {
  it.each([
    'button',
    'overlay',
    'Escape',
  ])('finishes the exit before notifying the parent via %s', (action) => {
    device.isDesktopApp = true;
    const onClose = vi.fn();
    const MountedDialog = () => {
      const [isOpen, setIsOpen] = useState(true);
      return isOpen ? (
        <Dialog
          isOpen
          onClose={() => {
            onClose();
            setIsOpen(false);
          }}
        >
          Content
        </Dialog>
      ) : null;
    };
    render(<MountedDialog />);
    act(() => vi.advanceTimersByTime(16));

    if (action === 'button') fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0]!);
    else if (action === 'overlay') fireEvent.click(document.querySelector('.overlay')!);
    else fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).not.toHaveBeenCalled();
    expect(document.querySelector('.modal-box')?.classList.contains('dialog-exit')).toBe(true);
    act(() => vi.advanceTimersByTime(249));
    expect(document.querySelector('dialog')).not.toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(onClose).toHaveBeenCalledOnce();
    expect(document.querySelector('dialog')).toBeNull();
  });

  it('does not let a pending entrance restart a quick close', () => {
    device.isDesktopApp = true;
    const onClose = vi.fn();
    render(
      <Dialog isOpen onClose={onClose}>
        Content
      </Dialog>,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    act(() => vi.advanceTimersByTime(16));

    expect(document.querySelector('.modal-box')?.classList.contains('dialog-exit')).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(250));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('lets a custom settings header use the same animated close', () => {
    const onClose = vi.fn();
    render(
      <Dialog
        isOpen
        onClose={onClose}
        header={(close) => <button onClick={close}>Close settings</button>}
      >
        Content
      </Dialog>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));
    expect(onClose).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(250));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('keeps a catalog open when it becomes non-dismissible during a download', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Dialog isOpen onClose={onClose}>
        Catalog
      </Dialog>,
    );
    act(() => vi.advanceTimersByTime(16));
    rerender(
      <Dialog isOpen dismissible={false} onClose={onClose}>
        Catalog
      </Dialog>,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(document.querySelector('.overlay')!);
    act(() => vi.advanceTimersByTime(300));

    expect(document.querySelector('dialog')).not.toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });
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

it('updates direction when an open dialog changes language', () => {
  const { rerender } = render(
    <Dialog isOpen onClose={() => {}}>
      Content
    </Dialog>,
  );
  device.dir = 'rtl';
  rerender(
    <Dialog isOpen onClose={() => {}}>
      Content
    </Dialog>,
  );
  expect(document.querySelector('dialog')?.dir).toBe('rtl');
  device.dir = 'ltr';
  rerender(
    <Dialog isOpen onClose={() => {}}>
      Content
    </Dialog>,
  );
  expect(document.querySelector('dialog')?.dir).toBe('ltr');
});

it('wraps keyboard focus and cleans up the element listener', () => {
  const { unmount } = render(
    <Dialog isOpen onClose={() => {}}>
      <button>First</button>
      <button>Last</button>
    </Dialog>,
  );
  const dialog = document.querySelector('dialog')!;
  const remove = vi.spyOn(dialog, 'removeEventListener');
  const first = screen.getByRole('button', { name: 'First' });
  const last = screen.getByRole('button', { name: 'Last' });
  const close = screen.getAllByRole('button', { name: 'Close' })[0]!;
  last.focus();
  fireEvent.keyDown(last, { key: 'Tab' });
  expect(document.activeElement).toBe(close);
  close.focus();
  fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
  expect(document.activeElement).toBe(last);
  expect(dialog.getAttribute('aria-modal')).toBe('true');
  first.focus();
  unmount();
  expect(remove.mock.calls.some((call) => call[0] === 'keydown')).toBe(true);
});

it('opens using the native modal API and retains the exit animation on cancel', () => {
  const show = vi.fn(function (this: HTMLDialogElement) {
    this.open = true;
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: show,
  });
  try {
    const onClose = vi.fn();
    render(
      <Dialog isOpen onClose={onClose}>
        Content
      </Dialog>,
    );
    expect(show).toHaveBeenCalledOnce();
    const dialog = document.querySelector('dialog')!;
    const cancel = new Event('cancel', { cancelable: true });
    act(() => dialog.dispatchEvent(cancel));
    expect(cancel.defaultPrevented).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(250));
    expect(onClose).toHaveBeenCalledOnce();
  } finally {
    delete (HTMLDialogElement.prototype as unknown as Record<string, unknown>)['showModal'];
  }
});
