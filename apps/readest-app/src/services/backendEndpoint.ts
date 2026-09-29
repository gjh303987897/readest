import type { ReadestRuntimeConfig } from '@/services/runtimeConfig';

export const BACKEND_CONNECTION_STORAGE_KEY = 'readest:backend-connection';

export interface BackendConnection {
  endpoint: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  apiBaseUrl: string;
}

export type BackendEndpointErrorCode =
  | 'invalidUrl'
  | 'invalidProtocol'
  | 'connectionFailed'
  | 'invalidConfiguration';

export class BackendEndpointError extends Error {
  constructor(
    public readonly code: BackendEndpointErrorCode,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'BackendEndpointError';
  }
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
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new BackendEndpointError('invalidUrl', 'Invalid server endpoint URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BackendEndpointError('invalidProtocol', 'Endpoint must use HTTP or HTTPS');
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
    throw new BackendEndpointError(
      'connectionFailed',
      `Unable to connect to endpoint (${response.status})`,
      response.status,
    );
  }

  const config = (await response.json()) as ReadestRuntimeConfig;
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new BackendEndpointError(
      'invalidConfiguration',
      'Endpoint returned invalid runtime configuration',
    );
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
