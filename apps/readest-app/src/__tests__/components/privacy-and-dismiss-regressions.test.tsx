import { cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
const fixture = vi.hoisted(() => ({
  end: (_data: { clientY: number; velocity: number }) => {},
  authenticate: vi.fn(),
}));
vi.mock('@/context/EnvContext', () => ({ useEnv: () => ({ appService: { isDesktopApp: true } }) }));
vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (key: string) => key }));
vi.mock('@/components/Dialog', () => ({
  default: ({ isOpen, children }: { isOpen: boolean; children: ReactNode }) =>
    isOpen ? <div>{children}</div> : null,
}));
vi.mock('@/services/biometricService', () => ({
  biometricService: { authenticate: fixture.authenticate },
}));
vi.mock('@/hooks/useDrag', () => ({
  useDrag: (_move: unknown, _key: unknown, end: typeof fixture.end) => {
    fixture.end = end;
    return { handleDragStart: () => {} };
  },
}));
import { usePrivacyStore } from '@/store/privacyStore';
import { useSwipeToDismiss } from '@/hooks/useSwipeToDismiss';
import { navigationStack } from '@/utils/navigationStack';
import PrivacyUnlockDialog from '@/components/PrivacyUnlockDialog';

beforeEach(() => {
  localStorage.clear();
  usePrivacyStore.setState(usePrivacyStore.getInitialState());
  navigationStack.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('requires PIN to recover the write key after biometric viewing unlock', async () => {
  await usePrivacyStore.getState().setPin('1234');
  usePrivacyStore.getState().lock();
  usePrivacyStore.getState().setBiometricEnabled(true);
  fixture.authenticate.mockResolvedValue(true);
  await usePrivacyStore.getState().unlockWithBiometric();
  expect(usePrivacyStore.getState().encryptionKey).toBeNull();
  const unlocked = vi.fn();
  render(<PrivacyUnlockDialog isOpen requirePin onClose={() => {}} onUnlocked={unlocked} />);
  expect(screen.queryByRole('button', { name: 'Biometric' })).toBeNull();
  fireEvent.change(screen.getByLabelText('Privacy PIN'), { target: { value: '1234' } });
  fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
  await waitFor(() => expect(unlocked).toHaveBeenCalledOnce());
  expect(usePrivacyStore.getState().encryptionKey).not.toBeNull();
  await usePrivacyStore.getState().hideBook('private');
  expect(usePrivacyStore.getState().hiddenBookHashes).toEqual(['private']);
});

it('locks and broadcasts even if randomUUID is unavailable', async () => {
  await usePrivacyStore.getState().setPin('1234');
  vi.stubGlobal('crypto', { randomUUID: undefined });
  expect(() => usePrivacyStore.getState().lock()).not.toThrow();
  expect(usePrivacyStore.getState().isUnlocked).toBe(false);
  expect(Object.keys(localStorage).some((key) => key.includes('lock'))).toBe(true);
});

it('cancels delayed swipe dismissal when the panel unmounts', async () => {
  vi.useFakeTimers();
  const dismissed = vi.fn();
  const { result, unmount } = renderHook(() => useSwipeToDismiss(dismissed));
  result.current.panelRef.current = document.createElement('div');
  result.current.overlayRef.current = document.createElement('div');
  fixture.end({ clientY: window.innerHeight, velocity: 1 });
  unmount();
  await vi.advanceTimersByTimeAsync(300);
  expect(dismissed).not.toHaveBeenCalled();
});

it('continues to the next back handler after the first unregisters itself', () => {
  const second = vi.fn(() => true);
  let remove = () => {};
  remove = navigationStack.push(() => {
    remove();
    return false;
  }, 2);
  navigationStack.push(second, 1);
  expect(navigationStack.handleBack()).toBe(true);
  expect(second).toHaveBeenCalledOnce();
});
