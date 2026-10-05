import { beforeEach, describe, expect, it, vi } from 'vitest';

import { biometricService } from '@/services/biometricService';

const biometric = vi.hoisted(() => ({
  mobileApp: false,
  checkStatus: vi.fn(),
  authenticate: vi.fn(),
}));

vi.mock('@/services/environment', () => ({
  default: { getAppService: async () => ({ isMobileApp: biometric.mobileApp }) },
}));
vi.mock('@tauri-apps/plugin-biometric', () => ({
  checkStatus: biometric.checkStatus,
  authenticate: biometric.authenticate,
}));

beforeEach(() => {
  vi.restoreAllMocks();
  biometric.mobileApp = false;
  biometric.checkStatus.mockReset();
  biometric.authenticate.mockReset();
});

describe('biometricService platform support', () => {
  it('does not invoke the mobile-only plugin when checking a desktop or web app', async () => {
    biometric.checkStatus.mockRejectedValue('plugin biometric not found');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(biometricService.isAvailable()).resolves.toBe(false);
    expect(biometric.checkStatus).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('does not authenticate on a desktop or web app with an old biometric preference', async () => {
    biometric.authenticate.mockRejectedValue('plugin biometric not found');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(biometricService.authenticate()).resolves.toBe(false);
    expect(biometric.authenticate).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it.each([true, false])('reports mobile hardware availability as %s', async (isAvailable) => {
    biometric.mobileApp = true;
    biometric.checkStatus.mockResolvedValue({ isAvailable });

    await expect(biometricService.isAvailable()).resolves.toBe(isAvailable);
    expect(biometric.checkStatus).toHaveBeenCalledOnce();
  });

  it('still authenticates on supported mobile apps', async () => {
    biometric.mobileApp = true;
    biometric.authenticate.mockResolvedValue(undefined);

    await expect(biometricService.authenticate()).resolves.toBe(true);
    expect(biometric.authenticate).toHaveBeenCalledOnce();
  });

  it('reports an unexpected mobile status failure', async () => {
    biometric.mobileApp = true;
    const failure = new Error('Device status failed');
    biometric.checkStatus.mockRejectedValue(failure);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(biometricService.isAvailable()).resolves.toBe(false);
    expect(error).toHaveBeenCalledWith('Failed to check biometric status:', failure);
  });
});
