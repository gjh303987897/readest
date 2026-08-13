import { getAPIBaseUrl } from '@/services/environment';
import { isEncryptedPrivacyEnvelope } from '@/services/privacyService';
import type { PrivacyCloudRecord } from '@/store/privacyStore';
import { getAccessToken } from '@/utils/access';
import { fetchWithTimeout } from '@/utils/fetch';

const getPrivacySyncEndpoint = () => `${getAPIBaseUrl()}/privacy-sync`;

const parseRecord = (value: unknown): PrivacyCloudRecord | null => {
  if (value === null) return null;
  if (!value || typeof value !== 'object') throw new Error('Invalid privacy sync response');
  const record = value as Partial<PrivacyCloudRecord>;
  if (
    typeof record.updatedAt !== 'number' ||
    !Number.isFinite(record.updatedAt) ||
    record.updatedAt <= 0 ||
    (record.envelope !== null && !isEncryptedPrivacyEnvelope(record.envelope))
  ) {
    throw new Error('Invalid privacy sync response');
  }
  return { envelope: record.envelope ?? null, updatedAt: record.updatedAt };
};

const request = async (method: 'GET' | 'PUT', record?: PrivacyCloudRecord) => {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');
  const response = await fetchWithTimeout(
    getPrivacySyncEndpoint(),
    {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(record ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(record ? { body: JSON.stringify(record) } : {}),
    },
    15_000,
  );
  const body = (await response.json()) as { record?: unknown; error?: string };
  if (!response.ok) throw new Error(body.error || 'Failed to sync privacy settings');
  return parseRecord(body.record ?? null);
};

export const pullPrivacySettings = () => request('GET');
export const pushPrivacySettings = (record: PrivacyCloudRecord) => request('PUT', record);
