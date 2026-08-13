import type { NextApiRequest, NextApiResponse } from 'next';

import {
  isEncryptedPrivacyEnvelope,
  type EncryptedPrivacyEnvelope,
} from '@/services/privacyService';
import { validateUserAndToken } from '@/utils/access';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { createSupabaseClient } from '@/utils/supabase';

const MAX_ENVELOPE_BYTES = 1024 * 1024;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

interface PrivacyRow {
  envelope: EncryptedPrivacyEnvelope | null;
  updated_at: string;
}

export const config = {
  api: {
    bodyParser: { sizeLimit: '2mb' },
  },
};

const toResponseRecord = (row: PrivacyRow | null) =>
  row
    ? {
        envelope: row.envelope,
        updatedAt: new Date(row.updated_at).getTime(),
      }
    : null;

const isValidEnvelope = (value: unknown) =>
  value === null ||
  (isEncryptedPrivacyEnvelope(value) && JSON.stringify(value).length <= MAX_ENVELOPE_BYTES);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);

  if (req.method !== 'GET' && req.method !== 'PUT') {
    res.setHeader('Allow', ['GET', 'PUT']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { user, token } = await validateUserAndToken(req.headers['authorization']);
  if (!user || !token) return res.status(403).json({ error: 'Not authenticated' });

  try {
    const supabase = createSupabaseClient(token);
    const readRecord = async () => {
      const { data, error } = await supabase
        .from('privacy_settings')
        .select('envelope, updated_at')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as PrivacyRow | null;
    };

    if (req.method === 'GET') {
      return res.status(200).json({ record: toResponseRecord(await readRecord()) });
    }

    const body = req.body as { envelope?: unknown; updatedAt?: unknown } | undefined;
    if (
      !body ||
      !Object.hasOwn(body, 'envelope') ||
      !isValidEnvelope(body.envelope) ||
      typeof body.updatedAt !== 'number' ||
      !Number.isSafeInteger(body.updatedAt) ||
      body.updatedAt <= 0 ||
      body.updatedAt > Date.now() + MAX_FUTURE_SKEW_MS
    ) {
      return res.status(400).json({ error: 'Invalid privacy sync payload' });
    }

    const { data, error } = await supabase.rpc('privacy_settings_lww_upsert', {
      p_envelope: body.envelope,
      p_updated_at: new Date(body.updatedAt).toISOString(),
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return res.status(200).json({ record: toResponseRecord(row as PrivacyRow) });
  } catch (error) {
    console.error('Privacy sync failed:', error);
    return res.status(500).json({ error: 'Failed to sync privacy settings' });
  }
}
