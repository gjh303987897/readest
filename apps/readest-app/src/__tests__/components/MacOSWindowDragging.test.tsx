import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearMocks, mockIPC, mockWindows } from '@tauri-apps/api/mocks';

const ipc = vi.fn((command: string) => {
  if (command === 'plugin:window|is_maximized') return false;
  return undefined;
});
vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ appService: { hasWindowBar: true, hasTrafficLight: true } }),
}));
vi.mock('@/services/environment', () => ({ isTauriAppPlatform: () => true }));
vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (value: string) => value }));
vi.mock('@/utils/window', () => ({
  tauriHandleMinimize: vi.fn(),
  tauriHandleToggleMaximize: vi.fn(),
  tauriHandleClose: vi.fn(),
}));

import WindowButtons from '@/components/WindowButtons';

const MacHeader = () => {
  const headerRef = useRef<HTMLElement>(null);
  return (
    <header ref={headerRef}>
      <span>Library title</span>
      <button type='button'>Search</button>
      <WindowButtons
        headerRef={headerRef}
        showMinimize={false}
        showMaximize={false}
        showClose={false}
      />
    </header>
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  mockWindows('main');
  mockIPC(ipc, { shouldMockEvents: true });
});
afterEach(() => {
  cleanup();
  clearMocks();
});

describe('macOS custom header with native traffic lights', () => {
  it('drags the window even when the custom window buttons are hidden', async () => {
    render(<MacHeader />);
    fireEvent.mouseDown(screen.getByText('Library title'), { buttons: 1, detail: 1 });
    await waitFor(() =>
      expect(ipc).toHaveBeenCalledWith('plugin:window|start_dragging', { label: 'main' }),
    );
  });

  it('keeps header buttons clickable without beginning a window drag', async () => {
    render(<MacHeader />);
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Search' }), { buttons: 1, detail: 1 });
    await Promise.resolve();
    expect(ipc).not.toHaveBeenCalledWith('plugin:window|start_dragging', expect.anything());
  });

  it('preserves double-click maximize on the custom title region', async () => {
    render(<MacHeader />);
    fireEvent.mouseDown(screen.getByText('Library title'), { buttons: 1, detail: 2 });
    await waitFor(() =>
      expect(ipc).toHaveBeenCalledWith('plugin:window|toggle_maximize', { label: 'main' }),
    );
    expect(ipc).not.toHaveBeenCalledWith('plugin:window|start_dragging', expect.anything());
  });
});
