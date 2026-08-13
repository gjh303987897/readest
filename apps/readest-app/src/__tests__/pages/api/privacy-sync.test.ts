import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const validateUserAndTokenMock = vi.fn();
const createSupabaseClientMock = vi.fn();

vi.mock('@/utils/cors', () => ({
  corsAllMethods: {},
  runMiddleware: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/utils/access', () => ({
  validateUserAndToken: (...args: unknown[]) => validateUserAndTokenMock(...args),
}));
vi.mock('@/utils/supabase', () => ({
  createSupabaseClient: (...args: unknown[]) => createSupabaseClientMock(...args),
}));

import handler from '@/pages/api/privacy-sync';

const envelope = {
  version: 1,
  algorithm: 'AES-GCM' as const,
  kdf: {
    algorithm: 'PBKDF2-SHA-256' as const,
    iterations: 600_000,
    salt: 'MDEyMzQ1Njc4OWFiY2RlZg==',
  },
  iv: 'MDEyMzQ1Njc4OWFi',
  ciphertext: 'MDEyMzQ1Njc4OWFiY2RlZg==',
};

const makeReqRes = (method: string, body?: unknown) => {
  const req = {
    method,
    headers: { authorization: 'Bearer token' },
    body,
  } as unknown as NextApiRequest;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn(),
  } as unknown as NextApiResponse;
  return { req, res };
};

const makeBuilder = (response: { data: unknown; error: unknown }) => {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'limit']) builder[method] = () => builder;
  builder['maybeSingle'] = vi.fn().mockResolvedValue(response);
  return builder;
};

beforeEach(() => {
  validateUserAndTokenMock.mockReset().mockResolvedValue({
    user: { id: 'user-id' },
    token: 'token',
  });
  createSupabaseClientMock.mockReset();
});

describe('/api/privacy-sync', () => {
  it('requires authentication', async () => {
    validateUserAndTokenMock.mockResolvedValue({});
    const { req, res } = makeReqRes('GET');

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('rejects malformed encrypted envelopes', async () => {
    const { req, res } = makeReqRes('PUT', {
      envelope: { ciphertext: 'plaintext-private-hash' },
      updatedAt: Date.now(),
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('keeps a newer server record instead of overwriting it', async () => {
    const serverUpdatedAt = new Date('2026-08-12T08:00:00.000Z');
    const builder = makeBuilder({ data: null, error: null });
    createSupabaseClientMock.mockReturnValue({
      from: () => builder,
      rpc: vi.fn().mockResolvedValue({
        data: [{ envelope, updated_at: serverUpdatedAt.toISOString() }],
        error: null,
      }),
    });
    const { req, res } = makeReqRes('PUT', {
      envelope,
      updatedAt: serverUpdatedAt.getTime() - 1000,
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      record: { envelope, updatedAt: serverUpdatedAt.getTime() },
    });
  });
});
