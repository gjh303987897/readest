import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

type Response = { data: unknown[] | null; error: { message: string } | null };
const responses: Response[] = [];
const tableCalls: string[] = [];
const methodCalls: Array<{ table: string; method: string; args: unknown[] }> = [];

const makeBuilder = (table: string) => {
  const builder: Record<string, unknown> = {};
  const chain =
    (method: string) =>
    (...args: unknown[]) => {
      methodCalls.push({ table, method, args });
      return builder;
    };
  for (const method of [
    'select',
    'eq',
    'or',
    'gt',
    'order',
    'range',
    'insert',
    'upsert',
    'update',
    'lt',
  ]) {
    builder[method] = chain(method);
  }
  // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are thenable
  (builder as { then: unknown }).then = (resolve: (value: unknown) => void) =>
    resolve(responses.shift() ?? { data: [], error: null });
  return builder;
};

const fromMock = vi.fn((table: string) => {
  tableCalls.push(table);
  return makeBuilder(table);
});

vi.mock('@/utils/supabase', () => ({
  createSupabaseClient: () => ({ from: fromMock }),
}));
vi.mock('@/utils/access', () => ({
  validateUserAndToken: async () => ({ user: { id: 'user-1' }, token: 'token' }),
}));

import { GET, POST } from '@/pages/api/sync';

const request = (url: string, init?: RequestInit) =>
  new Request(url, {
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    ...init,
  }) as unknown as NextRequest;

const dbNote = {
  user_id: 'user-1',
  book_hash: '0123456789abcdef0123456789abcdef',
  meta_hash: 'meta-1',
  id: 'bookmark-1',
  type: 'bookmark',
  cfi: 'epubcfi(/6/8!/4/2)',
  text: 'Chapter 2',
  note: 'Remember this',
  page: 17,
  created_at: '2026-08-05T00:00:00.000Z',
  updated_at: '2026-08-05T00:01:00.000Z',
  deleted_at: null,
};

beforeEach(() => {
  responses.length = 0;
  tableCalls.length = 0;
  methodCalls.length = 0;
  fromMock.mockClear();
});

describe('/api/sync notes', () => {
  it('pulls notes for a book from book_notes', async () => {
    responses.push({ data: [dbNote], error: null });

    const response = await GET(
      request(`https://reader.example.com/api/sync?since=0&type=notes&book=${dbNote.book_hash}`),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(tableCalls).toEqual(['book_notes']);
    expect(body.notes).toEqual([dbNote]);
  });

  it('accepts note pushes and writes the transformed record to book_notes', async () => {
    responses.push({ data: [], error: null });
    responses.push({ data: [dbNote], error: null });

    const response = await POST(
      request('https://reader.example.com/api/sync', {
        method: 'POST',
        body: JSON.stringify({
          notes: [
            {
              bookHash: dbNote.book_hash,
              metaHash: dbNote.meta_hash,
              id: dbNote.id,
              type: 'bookmark',
              cfi: dbNote.cfi,
              text: dbNote.text,
              note: dbNote.note,
              page: dbNote.page,
              createdAt: Date.parse(dbNote.created_at),
              updatedAt: Date.parse(dbNote.updated_at),
            },
          ],
        }),
      }),
    );
    const body = await response.json();
    const insert = methodCalls.find(
      (call) => call.table === 'book_notes' && call.method === 'insert',
    );

    expect(response.status).toBe(200);
    expect(tableCalls).toEqual(['book_notes', 'book_notes']);
    expect(insert?.args[0]).toEqual([
      expect.objectContaining({
        user_id: 'user-1',
        book_hash: dbNote.book_hash,
        id: dbNote.id,
        type: 'bookmark',
        cfi: dbNote.cfi,
        note: dbNote.note,
      }),
    ]);
    expect(body.notes).toEqual([dbNote]);
  });
});
