import type { ReadestRuntimeConfig } from '@/services/runtimeConfig';

export const BACKEND_CONNECTION_STORAGE_KEY = 'readest:backend-connection';

export interface BackendConnection {
  endpoint: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  apiBaseUrl: string;
}

const isBackendConnection = (value: unknown): value is BackendConnection => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<BackendConnection>;
  return (
    typeof candidate.endpoint === 'string' &&
    typeof candidate.supabaseUrl === 'string' &&
    typeof candidate.supabaseAnonKey === 'string' &&
    typeof candidate.apiBaseUrl === 'string'
  );
};

export const normalizeBackendEndpoint = (value: string): string => {
  const url = new URL(value.trim());
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Endpoint must use HTTP or HTTPS');
  }
  return url.origin;
};

export const getStoredBackendConnection = (): BackendConnection | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(BACKEND_CONNECTION_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isBackendConnection(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const persistBackendConnection = (connection: BackendConnection) => {
  localStorage.setItem(BACKEND_CONNECTION_STORAGE_KEY, JSON.stringify(connection));
};

export const connectBackendEndpoint = async (
  value: string,
  fetcher: typeof fetch = globalThis.fetch,
): Promise<BackendConnection> => {
  const endpoint = normalizeBackendEndpoint(value);
  const response = await fetcher(`${endpoint}/runtime-config.js?format=json`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Unable to connect to endpoint (${response.status})`);
  }

  const config = (await response.json()) as ReadestRuntimeConfig;
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error('Endpoint returned invalid runtime configuration');
  }

  const connection: BackendConnection = {
    endpoint,
    supabaseUrl: normalizeBackendEndpoint(config.supabaseUrl),
    supabaseAnonKey: config.supabaseAnonKey,
    apiBaseUrl: normalizeBackendEndpoint(config.apiBaseUrl || endpoint),
  };
  persistBackendConnection(connection);
  return connection;
};
