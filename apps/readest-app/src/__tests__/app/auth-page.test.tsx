import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BackendEndpointForm } from '@/app/auth/components/BackendEndpointForm';

const { connectBackendEndpoint, applyBackendConnection, translations, BackendEndpointError } =
  vi.hoisted(() => ({
    connectBackendEndpoint: vi.fn(),
    applyBackendConnection: vi.fn(),
    translations: {} as Record<string, string>,
    BackendEndpointError: class extends Error {
      constructor(
        public code: string,
        message: string,
        public status?: number,
      ) {
        super(message);
      }
    },
  }));

vi.mock('@/services/backendEndpoint', () => ({
  BackendEndpointError,
  connectBackendEndpoint: (...args: unknown[]) => connectBackendEndpoint(...args),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => translations[key] ?? key,
}));

vi.mock('@/utils/supabase', () => ({
  applyBackendConnection: (...args: unknown[]) => applyBackendConnection(...args),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  for (const key of Object.keys(translations)) delete translations[key];
});

describe('BackendEndpointForm', () => {
  it('connects the login page to a user-provided endpoint', async () => {
    const connection = {
      endpoint: 'https://reader.example.com',
      supabaseUrl: 'https://auth.example.com',
      supabaseAnonKey: 'anon-key',
      apiBaseUrl: 'https://reader.example.com',
    };
    connectBackendEndpoint.mockResolvedValue(connection);
    const onConnected = vi.fn();

    render(<BackendEndpointForm initialEndpoint='' onConnected={onConnected} />);
    fireEvent.change(screen.getByLabelText('Server endpoint'), {
      target: { value: 'https://reader.example.com/' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => {
      expect(connectBackendEndpoint).toHaveBeenCalledWith('https://reader.example.com/');
    });
    expect(applyBackendConnection).toHaveBeenCalledWith(connection);
    expect(onConnected).toHaveBeenCalledWith(connection);
  });

  it('shows a localized connection failure while preserving the HTTP status', async () => {
    translations['Server endpoint'] = '服务器地址';
    translations['Unable to connect to endpoint'] = '无法连接到服务器地址';
    connectBackendEndpoint.mockRejectedValue(
      new BackendEndpointError('connectionFailed', 'Unable to connect to endpoint (503)', 503),
    );

    render(<BackendEndpointForm initialEndpoint='' onConnected={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('服务器地址'), {
      target: { value: 'https://reader.example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    expect((await screen.findByRole('alert')).textContent).toBe('无法连接到服务器地址 (503)');
  });
});
