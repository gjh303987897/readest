import type { NextApiRequest, NextApiResponse } from 'next';
import { NextRequest, NextResponse } from 'next/server';
import type { PostgrestError } from '@supabase/supabase-js';
import { createSupabaseClient } from '@/utils/supabase';
import type { BookDataRecord } from '@/types/book';
import { transformBookConfigToDB } from '@/utils/transform';
import { transformBookToDB } from '@/utils/transform';
import { runMiddleware, corsAllMethods } from '@/utils/cors';
import type { SyncData, SyncRecord, SyncResult, SyncType } from '@/libs/sync';
import { validateUserAndToken } from '@/utils/access';
import type { DBBook, DBBookConfig } from '@/types/records';

/**
 * Field-level last-writer-wins for a books row's cover: return the
 * {cover_hash, cover_updated_at} with the newer cover_updated_at (ties →
 * client). NULL timestamp = epoch 0. A cover edit shares the row with
 * page-turn progress, so this lets the cover survive even when the whole row
 * is decided the other way by updated_at — the same #4634 hazard the
 * reading_status merge addresses (issue #4544).
 */
export function resolveCoverMerge(
  client: Pick<DBBook, 'cover_hash' | 'cover_updated_at'>,
  server: Pick<DBBook, 'cover_hash' | 'cover_updated_at'>,
): Pick<DBBook, 'cover_hash' | 'cover_updated_at'> {
  const ms = (s?: string | null) => (s ? new Date(s).getTime() : 0);
  return ms(client.cover_updated_at) >= ms(server.cover_updated_at)
    ? { cover_hash: client.cover_hash, cover_updated_at: client.cover_updated_at }
    : { cover_hash: server.cover_hash, cover_updated_at: server.cover_updated_at };
}

const transformsToDB = {
  books: transformBookToDB,
  book_configs: transformBookConfigToDB,
};

const DBSyncTypeMap = {
  books: 'books',
  book_configs: 'configs',
} as const;

type TableName = keyof typeof transformsToDB;

type DBError = { table: TableName; error: PostgrestError };

export async function GET(req: NextRequest) {
  const { user, token } = await validateUserAndToken(req.headers.get('authorization'));
  if (!user || !token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 403 });
  }
  const supabase = createSupabaseClient(token);

  const { searchParams } = new URL(req.url);
  const sinceParam = searchParams.get('since');
  const typeParam = searchParams.get('type') as SyncType | undefined;
  const bookParam = searchParams.get('book');
  const metaHashParam = searchParams.get('meta_hash');
  // Optional page size for client-driven paged book pulls.
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? Math.max(1, Math.floor(Number(limitParam))) : 0;

  if (!sinceParam) {
    return NextResponse.json({ error: '"since" query parameter is required' }, { status: 400 });
  }

  if (typeParam && typeParam !== 'books' && typeParam !== 'configs') {
    return NextResponse.json({ error: 'Unsupported sync type' }, { status: 400 });
  }

  const since = new Date(Number(sinceParam));
  if (isNaN(since.getTime())) {
    return NextResponse.json({ error: 'Invalid "since" timestamp' }, { status: 400 });
  }

  const sinceIso = since.toISOString();

  try {
    const results: SyncResult = { books: [], configs: [] };
    const errors: Record<TableName, DBError | null> = {
      books: null,
      book_configs: null,
    };

    const queryTables = async (table: TableName, dedupeKeys?: (keyof BookDataRecord)[]) => {
      const PAGE_SIZE = 1000;
      let allRecords: SyncRecord[] = [];
      let offset = 0;
      let hasMore = true;

      // books keys the pull on the server-assigned `synced_at` cursor, which a
      // trigger bumps on every write — including deletes — so a server-resolved
      // merge propagates without touching updated_at (the date-read sort key).
      // configs have no server-side merge, so they stay on updated_at and
      // still need the explicit deleted_at clause. See issue #4678.
      const cursorColumn = table === 'books' ? 'synced_at' : 'updated_at';

      while (hasMore) {
        let query = supabase
          .from(table)
          .select('*')
          .eq('user_id', user.id)
          .range(offset, offset + PAGE_SIZE - 1);

        if (bookParam && metaHashParam) {
          query = query.or(`book_hash.eq.${bookParam},meta_hash.eq.${metaHashParam}`);
        } else if (bookParam) {
          query = query.eq('book_hash', bookParam);
        } else if (metaHashParam) {
          query = query.eq('meta_hash', metaHashParam);
        }

        if (cursorColumn === 'synced_at') {
          query = query.gt('synced_at', sinceIso);
        } else {
          query = query.or(`updated_at.gt.${sinceIso},deleted_at.gt.${sinceIso}`);
        }
        query = query.order(cursorColumn, { ascending: false });

        console.log('Querying table:', table, 'since:', sinceIso, 'offset:', offset);

        const { data, error } = await query;
        if (error) throw { table, error } as DBError;

        if (data && data.length > 0) {
          allRecords = allRecords.concat(data);
          offset += PAGE_SIZE;
          hasMore = data.length === PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }

      let records = allRecords;
      if (dedupeKeys && dedupeKeys.length > 0) {
        const seen = new Set<string>();
        records = records.filter((rec) => {
          const key = dedupeKeys
            .map((k) => rec[k])
            .filter(Boolean)
            .join('|');
          if (key && seen.has(key)) {
            return false;
          } else {
            seen.add(key);
            return true;
          }
        });
      }
      (results as unknown as Record<string, SyncRecord[]>)[DBSyncTypeMap[table]] = records || [];
    };

    // One bounded page of books for the app's and the calibre plugin's
    // client-driven paged pull: a 10k-book delta accumulated into a single
    // response exceeds the Worker's resource limits (CF error 1102). Rows come
    // back ordered by synced_at ASCENDING, completed to the trailing synced_at
    // millisecond — batch upserts stamp one now() per statement, so rows share
    // boundary timestamps and a strict `> cursor` re-pull would otherwise skip
    // the rest of a batch split by the page boundary. A page shorter than
    // `limit` tells the client the delta is exhausted.
    const fetchPagedBooks = async () => {
      const bookFilters = <T extends { or: (f: string) => T; eq: (c: string, v: string) => T }>(
        q: T,
      ): T => {
        if (bookParam && metaHashParam) {
          return q.or(`book_hash.eq.${bookParam},meta_hash.eq.${metaHashParam}`);
        } else if (bookParam) {
          return q.eq('book_hash', bookParam);
        } else if (metaHashParam) {
          return q.eq('meta_hash', metaHashParam);
        }
        return q;
      };
      const { data, error } = await bookFilters(
        supabase
          .from('books')
          .select('*')
          .eq('user_id', user.id)
          .gt('synced_at', sinceIso)
          .order('synced_at', { ascending: true })
          .range(0, limit - 1),
      );
      if (error) throw { table: 'books', error } as DBError;
      const rows = (data ?? []) as SyncRecord[];
      if (rows.length === limit) {
        const lastSynced = (rows[rows.length - 1] as unknown as { synced_at: string }).synced_at;
        const { data: extra, error: extraError } = await bookFilters(
          supabase.from('books').select('*').eq('user_id', user.id).eq('synced_at', lastSynced),
        );
        if (extraError) throw { table: 'books', error: extraError } as DBError;
        const seen = new Set(rows.map((r) => r.book_hash));
        for (const r of (extra ?? []) as SyncRecord[]) {
          if (!seen.has(r.book_hash)) {
            seen.add(r.book_hash);
            rows.push(r);
          }
        }
      }
      results.books = rows;
    };

    if (!typeParam || typeParam === 'books') {
      const booksQuery =
        limit > 0 && typeParam === 'books' ? fetchPagedBooks : () => queryTables('books');
      await booksQuery().catch((err) => (errors['books'] = err));
      // TODO: Remove this hotfix for the initial race condition for books sync
      if (results.books?.length === 0 && since.getTime() < 1000) {
        const dummyHash = '00000000000000000000000000000000';
        const now = Date.now();
        results.books.push({
          user_id: user.id,
          id: dummyHash,
          book_hash: dummyHash,
          deleted_at: now,
          updated_at: now,

          hash: dummyHash,
          title: 'Dummy Book',
          format: 'EPUB',
          author: '',
          createdAt: now,
          updatedAt: now,
          deletedAt: now,
        });
      }
    }
    if (!typeParam || typeParam === 'configs') {
      await queryTables('book_configs').catch((err) => (errors['book_configs'] = err));
    }

    const dbErrors = Object.values(errors).filter((err) => err !== null);
    if (dbErrors.length > 0) {
      console.error('Errors occurred:', dbErrors);
      const errorMsg = dbErrors
        .map((err) => `${err.table}: ${err.error.message || 'Unknown error'}`)
        .join('; ');
      return NextResponse.json({ error: errorMsg }, { status: 500 });
    }

    const response = NextResponse.json(results, { status: 200 });
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('Pragma', 'no-cache');
    response.headers.delete('ETag');
    return response;
  } catch (error: unknown) {
    console.error(error);
    const errorMessage = (error as PostgrestError).message || 'Unknown error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { user, token } = await validateUserAndToken(req.headers.get('authorization'));
  if (!user || !token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 403 });
  }
  const supabase = createSupabaseClient(token);
  const body = (await req.json()) as SyncData;
  const unsupportedBody = body as SyncData & Record<string, unknown>;
  if (
    'notes' in unsupportedBody ||
    'statBooks' in unsupportedBody ||
    'statPages' in unsupportedBody
  ) {
    return NextResponse.json({ error: 'Unsupported sync data' }, { status: 400 });
  }
  const { books = [], configs = [] } = body;

  const BATCH_SIZE = 100;
  const upsertRecords = async (
    table: TableName,
    primaryKeys: (keyof BookDataRecord)[],
    records: BookDataRecord[],
  ) => {
    if (records.length === 0) return { data: [] };

    const allAuthoritativeRecords: BookDataRecord[] = [];

    // Process in batches
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);

      // Transform all records to DB format
      const dbRecords = batch.map((rec) => {
        const dbRec = transformsToDB[table](rec, user.id);
        rec.user_id = user.id;
        rec.book_hash = dbRec.book_hash;
        return { original: rec, db: dbRec };
      });

      // Build match conditions for batch
      const matchConditions = dbRecords.map(({ original }) => {
        const conditions: Record<string, string | number> = { user_id: user.id };
        for (const pk of primaryKeys) {
          conditions[pk] = original[pk]!;
        }
        return conditions;
      });

      // Fetch existing records for this batch
      const orConditions = matchConditions
        .map((cond) => {
          const parts = Object.entries(cond).map(([key, val]) => `${key}.eq.${val}`);
          return `and(${parts.join(',')})`;
        })
        .join(',');

      const { data: serverRecords, error: fetchError } = await supabase
        .from(table)
        .select()
        .or(orConditions);

      if (fetchError) {
        return { error: fetchError.message };
      }

      // Create lookup map
      const serverRecordsMap = new Map<string, BookDataRecord>();
      (serverRecords || []).forEach((record) => {
        const key = primaryKeys.map((pk) => record[pk]).join('|');
        serverRecordsMap.set(key, record);
      });

      // Separate into inserts and updates
      const toInsert: (DBBook | DBBookConfig)[] = [];
      const toUpdate: (DBBook | DBBookConfig)[] = [];
      const batchAuthoritativeRecords: BookDataRecord[] = [];

      for (const { original, db: dbRec } of dbRecords) {
        const key = primaryKeys.map((pk) => original[pk]).join('|');
        const serverData = serverRecordsMap.get(key);

        if (!serverData) {
          dbRec.updated_at = new Date().toISOString();
          toInsert.push(dbRec);
        } else {
          const clientUpdatedAt = dbRec.updated_at ? new Date(dbRec.updated_at).getTime() : 0;
          const serverUpdatedAt = serverData.updated_at
            ? new Date(serverData.updated_at).getTime()
            : 0;
          const clientDeletedAt = dbRec.deleted_at ? new Date(dbRec.deleted_at).getTime() : 0;
          const serverDeletedAt = serverData.deleted_at
            ? new Date(serverData.deleted_at).getTime()
            : 0;
          const clientIsNewer =
            clientDeletedAt > serverDeletedAt || clientUpdatedAt > serverUpdatedAt;

          if (table === 'books') {
            const clientBook = dbRec as DBBook;
            const serverBook = serverData as BookDataRecord &
              Partial<Pick<DBBook, 'cover_hash' | 'cover_updated_at'>>;
            const cover = resolveCoverMerge(clientBook, serverBook);
            if (clientIsNewer) {
              clientBook.cover_hash = cover.cover_hash;
              clientBook.cover_updated_at = cover.cover_updated_at;
              toUpdate.push(clientBook);
            } else {
              const coverChanged = (cover.cover_hash ?? null) !== (serverBook.cover_hash ?? null);
              if (coverChanged) {
                toUpdate.push({
                  ...(serverBook as unknown as DBBook),
                  cover_hash: cover.cover_hash,
                  cover_updated_at: cover.cover_updated_at,
                });
              } else {
                batchAuthoritativeRecords.push(serverData);
              }
            }
          } else if (clientIsNewer) {
            toUpdate.push(dbRec);
          } else {
            batchAuthoritativeRecords.push(serverData);
          }
        }
      }

      // Batch insert
      if (toInsert.length > 0) {
        const { data: inserted, error: insertError } = await supabase
          .from(table)
          .insert(toInsert)
          .select();

        if (insertError) {
          console.log(`Failed to insert ${table} records:`, JSON.stringify(toInsert));
          return { error: insertError.message };
        }
        batchAuthoritativeRecords.push(...(inserted || []));
      }

      // Batch upsert
      if (toUpdate.length > 0) {
        const { data: updated, error: updateError } = await supabase
          .from(table)
          .upsert(toUpdate, {
            onConflict: ['user_id', ...primaryKeys].join(','),
          })
          .select();

        if (updateError) {
          console.log(`Failed to update ${table} records:`, JSON.stringify(toUpdate));
          return { error: updateError.message };
        }
        batchAuthoritativeRecords.push(...(updated || []));
      }

      allAuthoritativeRecords.push(...batchAuthoritativeRecords);
    }

    return { data: allAuthoritativeRecords };
  };

  try {
    const [booksResult, configsResult] = await Promise.all([
      upsertRecords('books', ['book_hash'], books as BookDataRecord[]),
      upsertRecords('book_configs', ['book_hash'], configs as BookDataRecord[]),
    ]);

    if (booksResult?.error) throw new Error(booksResult.error);
    if (configsResult?.error) throw new Error(configsResult.error);

    // Piggyback the per-book reading progress from the configs push onto the
    // matching `books` row. Other devices' library pull-to-refresh reads
    // books.progress + books.updated_at, so without this the row would stay
    // stale until the user navigates back to the library and useBooksSync
    // re-pushes. The .lt('updated_at') predicate keeps last-writer-wins —
    // a concurrent newer books push is never downgraded — and a missing
    // row is a silent no-op (useBooksSync will insert it later).
    type BookProgressUpdate = {
      book_hash: string;
      progress: [number, number];
      updated_at: string;
    };
    const bookProgressUpdates: BookProgressUpdate[] = [];
    for (const rec of (configsResult.data ?? []) as unknown as DBBookConfig[]) {
      if (!rec.book_hash || !rec.updated_at || rec.progress == null) continue;
      let parsed: unknown;
      try {
        parsed = typeof rec.progress === 'string' ? JSON.parse(rec.progress) : rec.progress;
      } catch {
        continue;
      }
      if (
        !Array.isArray(parsed) ||
        parsed.length !== 2 ||
        typeof parsed[0] !== 'number' ||
        typeof parsed[1] !== 'number'
      ) {
        continue;
      }
      bookProgressUpdates.push({
        book_hash: rec.book_hash,
        progress: [parsed[0], parsed[1]],
        updated_at: rec.updated_at,
      });
    }

    if (bookProgressUpdates.length > 0) {
      await Promise.all(
        bookProgressUpdates.map(async (u) => {
          const { error } = await supabase
            .from('books')
            .update({ progress: u.progress, updated_at: u.updated_at })
            .eq('user_id', user.id)
            .eq('book_hash', u.book_hash)
            .lt('updated_at', u.updated_at);
          if (error) {
            // Best-effort: never fail the configs push because of this side
            // effect — useBooksSync will reconcile the row later.
            console.warn('books.progress piggyback failed for', u.book_hash, error.message);
          }
        }),
      );
    }

    return NextResponse.json(
      {
        books: booksResult?.data || [],
        configs: configsResult?.data || [],
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    console.error(error);
    const errorMessage = (error as PostgrestError).message || 'Unknown error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (!req.url) {
    return res.status(400).json({ error: 'Invalid request URL' });
  }

  const protocol = process.env['PROTOCOL'] || 'http';
  const host = process.env['HOST'] || 'localhost:3000';
  const url = new URL(req.url, `${protocol}://${host}`);

  await runMiddleware(req, res, corsAllMethods);

  try {
    let response: Response;

    if (req.method === 'GET') {
      const nextReq = new NextRequest(url.toString(), {
        headers: new Headers(req.headers as Record<string, string>),
        method: 'GET',
      });
      response = await GET(nextReq);
    } else if (req.method === 'POST') {
      const nextReq = new NextRequest(url.toString(), {
        headers: new Headers(req.headers as Record<string, string>),
        method: 'POST',
        body: JSON.stringify(req.body), // Ensure the body is a string
      });
      response = await POST(nextReq);
    } else {
      res.setHeader('Allow', ['GET', 'POST']);
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    res.status(response.status);

    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.send(buffer);
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export default handler;
