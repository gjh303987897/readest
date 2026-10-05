import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import PrivacyPanel from '@/components/settings/PrivacyPanel';

const privacy = vi.hoisted(() => ({
  hasPin: false,
  isUnlocked: false,
  isCloudUnlockRequired: false,
  hiddenBookHashes: [],
  biometricEnabled: false,
  setPin: vi.fn(),
  changePin: vi.fn(),
  removePin: vi.fn(),
  unlock: vi.fn(),
  unlockWithBiometric: vi.fn(),
  lock: vi.fn(),
  setBiometricEnabled: vi.fn(),
}));

vi.mock('@/store/privacyStore', () => ({ usePrivacyStore: () => privacy }));
vi.mock('@/services/biometricService', () => ({
  biometricService: { isAvailable: async () => false },
}));
vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (key: string) => key }));

beforeEach(() => {
  vi.clearAllMocks();
  privacy.hasPin = false;
  privacy.isUnlocked = false;
  privacy.isCloudUnlockRequired = false;
  privacy.setPin.mockResolvedValue(undefined);
  privacy.changePin.mockResolvedValue(false);
});
afterEach(cleanup);

const openPanel = () => render(<PrivacyPanel bookKey='' onRegisterReset={() => {}} />);
const enter = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } });

describe('PrivacyPanel PIN input', () => {
  it('accepts only digits and limits pasted input to 12 digits', () => {
    openPanel();
    enter('PIN', '12ab345678901234');
    expect((screen.getByLabelText('PIN', { exact: true }) as HTMLInputElement).value).toBe(
      '123456789012',
    );
  });

  it('reveals each PIN independently and hides it again after clearing', () => {
    openPanel();
    enter('PIN', '1234');
    enter('Confirm PIN', '1234');
    fireEvent.click(screen.getByRole('button', { name: 'Show password: PIN' }));
    expect(screen.getByLabelText('PIN', { exact: true }).getAttribute('type')).toBe('text');
    expect(screen.getByLabelText('Confirm PIN', { exact: true }).getAttribute('type')).toBe(
      'password',
    );
    enter('PIN', '');
    enter('PIN', '5678');
    expect(screen.getByLabelText('PIN', { exact: true }).getAttribute('type')).toBe('password');
  });

  it('focuses the invalid PIN and associates its inline error with the input', () => {
    openPanel();
    enter('PIN', '123');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const input = screen.getByLabelText('PIN', { exact: true });
    const error = screen.getByRole('alert');
    expect(document.activeElement).toBe(input);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toContain(error.id);
    expect(error.textContent).toBe('PIN must contain 4 to 12 digits');
    expect(privacy.setPin).not.toHaveBeenCalled();
  });

  it('marks a mismatched confirmation and clears the error when editing', () => {
    openPanel();
    enter('PIN', '1234');
    enter('Confirm PIN', '5678');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(document.activeElement).toBe(screen.getByLabelText('Confirm PIN', { exact: true }));
    expect(screen.getByRole('alert').textContent).toBe('PINs do not match');
    enter('Confirm PIN', '1234');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(privacy.setPin).not.toHaveBeenCalled();
  });

  it('saves with Enter even when the dialog intercepts bubbling keys', async () => {
    const { container } = openPanel();
    container.firstElementChild!.addEventListener('keydown', (event) => event.stopPropagation());
    enter('PIN', '1234');
    enter('Confirm PIN', '1234');
    fireEvent.keyDown(screen.getByLabelText('Confirm PIN', { exact: true }), { key: 'Enter' });
    await waitFor(() => expect(privacy.setPin).toHaveBeenCalledWith('1234'));
    await waitFor(() =>
      expect((screen.getByLabelText('PIN', { exact: true }) as HTMLInputElement).value).toBe(''),
    );
    expect(screen.getByRole('status').textContent).toBe('Privacy PIN saved');
  });

  it('prevents editing and duplicate submission while saving', async () => {
    let finish!: () => void;
    privacy.setPin.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    openPanel();
    enter('PIN', '1234');
    enter('Confirm PIN', '1234');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect((screen.getByLabelText('PIN', { exact: true }) as HTMLInputElement).disabled).toBe(true);
    fireEvent.keyDown(screen.getByLabelText('Confirm PIN', { exact: true }), { key: 'Enter' });
    expect(privacy.setPin).toHaveBeenCalledOnce();
    await act(async () => finish());
  });

  it('marks the current PIN when changing it fails', async () => {
    privacy.hasPin = true;
    privacy.isUnlocked = true;
    openPanel();
    enter('Current PIN', '1111');
    enter('New PIN', '2222');
    enter('Confirm PIN', '2222');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Incorrect PIN'));
    expect(document.activeElement).toBe(screen.getByLabelText('Current PIN', { exact: true }));
    expect(privacy.changePin).toHaveBeenCalledWith('1111', '2222');
  });
});
