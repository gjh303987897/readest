import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BACKEND_CONNECTION_STORAGE_KEY,
  connectBackendEndpoint,
  getStoredBackendConnection,
  normalizeBackendEndpoint,
} from '@/services/backendEndpoint';

describe('backend endpoint configuration', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('normalizes a server root and removes paths, query strings, and trailing slashes', () => {
    expect(normalizeBackendEndpoint(' https://reader.example.com/base/?mode=test#login ')).toBe(
      'https://reader.example.com',
    );
  });

  it('loads runtime configuration from the selected endpoint and persists it', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          supabaseUrl: 'https://auth.example.com',
          supabaseAnonKey: 'public-anon-key',
          apiBaseUrl: 'https://api.example.com/',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const connection = await connectBackendEndpoint('https://reader.example.com/', fetcher);

    expect(fetcher).toHaveBeenCalledWith(
      'https://reader.example.com/runtime-config.js?format=json',
      expect.objectContaining({ cache: 'no-store' }),
    );
    expect(connection).toEqual({
      endpoint: 'https://reader.example.com',
      supabaseUrl: 'https://auth.example.com',
      supabaseAnonKey: 'public-anon-key',
      apiBaseUrl: 'https://api.example.com',
    });
    expect(getStoredBackendConnection()).toEqual(connection);
    expect(JSON.parse(localStorage.getItem(BACKEND_CONNECTION_STORAGE_KEY)!)).toEqual(connection);
  });

  it('rejects endpoints that do not expose authentication configuration', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ apiBaseUrl: 'https://api.example.com' }), { status: 200 }),
      );

    await expect(connectBackendEndpoint('https://reader.example.com', fetcher)).rejects.toThrow(
      'invalid runtime configuration',
    );
    expect(getStoredBackendConnection()).toBeNull();
  });
});
