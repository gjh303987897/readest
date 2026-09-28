import { authenticate, checkStatus, type AuthOptions } from '@tauri-apps/plugin-biometric';

export interface BiometricConfig {
  enabled: boolean;
  promptTitle?: string;
  promptSubtitle?: string;
  promptDescription?: string;
  cancelButtonText?: string;
  fallbackButtonText?: string;
  allowDeviceCredential?: boolean;
}

export class BiometricService {
  private static instance: BiometricService;

  private constructor() {}

  static getInstance(): BiometricService {
    if (!BiometricService.instance) {
      BiometricService.instance = new BiometricService();
    }
    return BiometricService.instance;
  }

  /**
   * Authenticate user with biometric or device credential
   */
  async authenticate(config?: Partial<BiometricConfig>): Promise<boolean> {
    try {
      const options: AuthOptions = {
        title: config?.promptTitle || 'Unlock Privacy Mode',
        subtitle: config?.promptSubtitle,
        cancelTitle: config?.cancelButtonText || 'Cancel',
        fallbackTitle: config?.fallbackButtonText,
        allowDeviceCredential: config?.allowDeviceCredential ?? true,
      };

      await authenticate(
        config?.promptDescription || 'Authenticate to unlock privacy mode',
        options,
      );

      return true;
    } catch (error) {
      console.error('Biometric authentication failed:', error);
      return false;
    }
  }

  /**
   * Check if device supports biometric authentication
   */
  async isAvailable(): Promise<boolean> {
    try {
      const status = await checkStatus();
      return status.isAvailable;
    } catch (error) {
      console.error('Failed to check biometric status:', error);
      return false;
    }
  }
}

export const biometricService = BiometricService.getInstance();
