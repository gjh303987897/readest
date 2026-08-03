import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BackendEndpointForm } from '@/app/auth/components/BackendEndpointForm';

const { connectBackendEndpoint, applyBackendConnection } = vi.hoisted(() => ({
  connectBackendEndpoint: vi.fn(),
  applyBackendConnection: vi.fn(),
}));

vi.mock('@/services/backendEndpoint', () => ({
  connectBackendEndpoint: (...args: unknown[]) => connectBackendEndpoint(...args),
}));

vi.mock('@/utils/supabase', () => ({
  applyBackendConnection: (...args: unknown[]) => applyBackendConnection(...args),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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
});
