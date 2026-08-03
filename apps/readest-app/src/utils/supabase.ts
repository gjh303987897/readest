import { createClient } from '@supabase/supabase-js';
import { getRuntimeConfig } from '@/services/runtimeConfig';
import { getStoredBackendConnection } from '@/services/backendEndpoint';
import type { BackendConnection } from '@/services/backendEndpoint';

const decodeDefault = (value: string | undefined) => (value ? atob(value) : '');

const getSupabaseConnection = () => {
  const stored = getStoredBackendConnection();
  const runtime = getRuntimeConfig();
  return {
    url:
      stored?.supabaseUrl ||
      runtime?.supabaseUrl ||
      process.env['SUPABASE_URL'] ||
      process.env['NEXT_PUBLIC_SUPABASE_URL'] ||
      decodeDefault(process.env['NEXT_PUBLIC_DEFAULT_SUPABASE_URL_BASE64']),
    anonKey:
      stored?.supabaseAnonKey ||
      runtime?.supabaseAnonKey ||
      process.env['SUPABASE_ANON_KEY'] ||
      process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] ||
      decodeDefault(process.env['NEXT_PUBLIC_DEFAULT_SUPABASE_KEY_BASE64']),
  };
};

const initialConnection = getSupabaseConnection();
// Keep the login screen usable when this build has no baked-in backend. The
// user can still enter an endpoint there, which replaces this inert client.
const fallbackConnection = {
  url: 'http://127.0.0.1:54321',
  anonKey: 'readest-backend-not-configured',
};
export let supabase = createClient(
  initialConnection.url || fallbackConnection.url,
  initialConnection.anonKey || fallbackConnection.anonKey,
);

const requireSupabaseConnection = () => {
  const connection = getSupabaseConnection();
  if (!connection.url || !connection.anonKey) {
    throw new Error('Backend endpoint is not configured');
  }
  return connection;
};

export const applyBackendConnection = (connection: BackendConnection) => {
  supabase = createClient(connection.supabaseUrl, connection.supabaseAnonKey);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('readest-backend-changed'));
  }
};

export const createSupabaseClient = (accessToken?: string) => {
  const connection = requireSupabaseConnection();
  return createClient(connection.url, connection.anonKey, {
    global: {
      headers: accessToken
        ? {
            Authorization: `Bearer ${accessToken}`,
          }
        : {},
    },
  });
};

export const createSupabaseAdminClient = () => {
  const connection = requireSupabaseConnection();
  const supabaseAdminKey = process.env['SUPABASE_ADMIN_KEY'] || '';
  if (!supabaseAdminKey) throw new Error('Supabase admin key is not configured');
  return createClient(connection.url, supabaseAdminKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
};
