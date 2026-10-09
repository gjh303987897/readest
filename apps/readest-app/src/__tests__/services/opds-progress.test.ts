import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createOpdsProgressSource,
  getOpdsProgressSources,
  rememberOpdsProgressSource,
  pushOpdsProgress,
  updateOpdsProgressLogin,
} from '@/services/opdsProgressService';
import { SAVED_LOGINS_KEY, type SavedOpdsLogin } from '@/services/opdsLoginService';
import type { Book } from '@/types/book';
import type { OpdsPublication, OpdsFetch } from '@/services/opdsService';

const uuid = '12345678-1234-1234-1234-123456789abc';
const calibre: SavedOpdsLogin = {
  provider: 'calibre-web',
  url: 'https://books.example/reader/opds',
  username: 'reader',
  password: 'secret',
  title: 'Books',
  koboToken: 'kobo-secret',
};
const kavita: SavedOpdsLogin = {
  provider: 'kavita',
  url: 'https://kavita.example/shelf/api/opds/OPDS-KEY',
  username: '',
  password: '',
  title: 'Kavita',
};
const book = {
  hash: 'localhash',
  format: 'EPUB',
  title: 'Book',
  author: 'Writer',
  createdAt: 1,
  updatedAt: 1,
} as Book;
const publication = (login = calibre): OpdsPublication => ({
  id: `urn:uuid:${uuid}`,
  title: 'Book',
  authors: ['Writer'],
  format: 'EPUB',
  downloadUrl:
    login.provider === 'kavita'
      ? `${login.url}/series/2/volume/3/chapter/41/download/book.epub`
      : 'https://books.example/reader/opds/download/4/EPUB',
});
const progress = { fraction: 0.427, pageinfo: { current: 20, total: 100 } };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const remember = (login = calibre, cached = false, hash = book.hash) => {
  const entry = { ...book, hash, cacheOnly: cached };
  rememberOpdsProgressSource(entry, createOpdsProgressSource(login, publication(login)));
  return entry;
};
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem(SAVED_LOGINS_KEY, JSON.stringify([calibre, kavita]));
});

describe('OPDS provider progress writeback', () => {
  it('sends percentages/status to Calibre-Web with a Kobo token, never a fake Kobo location or OPDS password', async () => {
    const entry = remember();
    const fetcher = vi.fn<OpdsFetch>(async () => response({ RequestResult: 'Success' }));
    await pushOpdsProgress(entry, progress, fetcher);
    expect(fetcher).toHaveBeenCalledWith(
      `https://books.example/reader/kobo/kobo-secret/v1/library/${uuid}/state`,
      expect.objectContaining({ method: 'PUT', redirect: 'error' }),
    );
    const init = fetcher.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(init.body as string).ReadingStates[0]).toEqual({
      CurrentBookmark: {
        ProgressPercent: 42.7,
        ContentSourceProgressPercent: 42.7,
        Location: null,
      },
      Statistics: null,
      StatusInfo: { Status: 'Reading' },
    });
    expect(JSON.stringify(init.headers)).not.toContain('secret');
    await pushOpdsProgress(
      entry,
      { fraction: 0.99, pageinfo: { current: 100, total: 100 } },
      fetcher,
    );
    expect(
      JSON.parse(fetcher.mock.calls[1]![1]!.body as string).ReadingStates[0].StatusInfo.Status,
    ).toBe('Finished');
  });
  it.each([
    'https://books.example/reader/kobo/TOKEN/',
    'https://books.example/kobo/TOKEN/',
  ])('accepts a Kobo profile URL %s', async (tokenUrl) => {
    const login = {
      ...calibre,
      url: tokenUrl.includes('/reader/') ? calibre.url : 'https://books.example/opds',
      koboToken: tokenUrl,
    };
    localStorage.setItem(SAVED_LOGINS_KEY, JSON.stringify([login]));
    const entry = remember(login);
    const fetcher = vi.fn<OpdsFetch>(async () => response({ RequestResult: 'Success' }));
    await pushOpdsProgress(entry, progress, fetcher);
    expect(fetcher.mock.calls[0]![0]).toBe(
      `${tokenUrl.replace(/\/$/, '')}/v1/library/${uuid}/state`,
    );
  });
  it('rejects a foreign Kobo URL without sending credentials or progress', async () => {
    localStorage.setItem(
      SAVED_LOGINS_KEY,
      JSON.stringify([{ ...calibre, koboToken: 'https://foreign.example/kobo/token' }]),
    );
    const fetcher = vi.fn();
    await expect(pushOpdsProgress(remember(), progress, fetcher)).rejects.toThrow('must belong');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('uses the Kavita OPDS key to obtain a JWT and maps progress to server pages', async () => {
    const login = { ...kavita, url: kavita.url.replace('OPDS-KEY', 'TEST-KEY-1') };
    localStorage.setItem(SAVED_LOGINS_KEY, JSON.stringify([login]));
    const entry = remember(login);
    const fetcher = vi.fn<OpdsFetch>(async (url) => {
      if (String(url).endsWith('/login')) return response({ token: 'JWT' });
      if (String(url).includes('/chapter-info'))
        return response({ pages: 60, volumeId: 3, seriesId: 2, libraryId: 1 });
      return new Response(null, { status: 200 });
    });
    await pushOpdsProgress(entry, progress, fetcher);
    expect(fetcher.mock.calls[0]![0]).toBe('https://kavita.example/shelf/api/Account/login');
    expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string).apiKey).toBe('TEST-KEY-1');
    expect(fetcher.mock.calls[1]![0]).toBe(
      'https://kavita.example/shelf/api/Reader/chapter-info?chapterId=41',
    );
    expect(JSON.parse(fetcher.mock.calls[2]![1]!.body as string)).toEqual({
      chapterId: 41,
      volumeId: 3,
      seriesId: 2,
      libraryId: 1,
      pageNum: 25,
      bookScrollId: null,
    });
    expect(fetcher.mock.calls[2]![1]!.headers).toMatchObject({ Authorization: 'Bearer JWT' });
    await pushOpdsProgress(
      entry,
      { fraction: 0.9, pageinfo: { current: 100, total: 100 } },
      fetcher,
    );
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(JSON.parse(fetcher.mock.calls[3]![1]!.body as string).pageNum).toBe(60);
  });
  it('keeps cache associations separate without persisting any progress or extra credentials', async () => {
    remember(calibre);
    const cached = remember(kavita, true);
    expect(getOpdsProgressSources(book)[0]?.provider).toBe('calibre-web');
    expect(getOpdsProgressSources(cached)[0]?.provider).toBe('kavita');
    const stored = sessionStorage.getItem('readest-opds-cache-sources-v1')!;
    expect(stored).not.toMatch(/password|koboToken|fraction|pageinfo|location/);
    expect(stored).not.toContain('secret');
  });
  it('retains multiple provider identities when local files are deduplicated or re-keyed', () => {
    remember(calibre, false, 'oldhash');
    rememberOpdsProgressSource(book, createOpdsProgressSource(kavita, publication(kavita)), [
      'oldhash',
    ]);
    expect(getOpdsProgressSources(book).map((s) => s.provider)).toEqual(['calibre-web', 'kavita']);
    expect(getOpdsProgressSources({ hash: 'oldhash' })).toEqual([]);
    rememberOpdsProgressSource(book, createOpdsProgressSource(kavita, publication(kavita)));
    expect(getOpdsProgressSources(book)).toHaveLength(2);
  });
  it('stops sending after a login is removed and skips Calibre-Web without a sync token', async () => {
    const entry = remember();
    const fetcher = vi.fn();
    localStorage.setItem(SAVED_LOGINS_KEY, JSON.stringify([{ ...calibre, koboToken: '' }]));
    await pushOpdsProgress(entry, progress, fetcher);
    localStorage.setItem(SAVED_LOGINS_KEY, '[]');
    await pushOpdsProgress(entry, progress, fetcher);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('does not assign a foreign acquisition to the logged-in provider', () => {
    expect(
      createOpdsProgressSource(kavita, {
        ...publication(kavita),
        downloadUrl: 'https://other.example/chapter/41/download/book.epub',
      }),
    ).toBeUndefined();
  });
  it('drops old IDs when a saved account/server is changed', () => {
    remember();
    updateOpdsProgressLogin(calibre, { ...calibre, password: 'newpassword' });
    expect(getOpdsProgressSources(book)).toHaveLength(1);
    updateOpdsProgressLogin(calibre, { ...calibre, username: 'someone-else' });
    expect(getOpdsProgressSources(book)).toHaveLength(0);
  });
  it('serializes updates so a slower old request cannot overwrite new progress', async () => {
    const entry = remember();
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetcher = vi.fn<OpdsFetch>(async () => {
      await blocked;
      return response({ RequestResult: 'Success' });
    });
    const first = pushOpdsProgress(entry, progress, fetcher);
    const second = pushOpdsProgress(entry, { ...progress, fraction: 0.8 }, fetcher);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    release();
    await Promise.all([first, second]);
    expect(
      JSON.parse(fetcher.mock.calls[1]![1]!.body as string).ReadingStates[0].CurrentBookmark
        .ProgressPercent,
    ).toBe(80);
  });
  it('reports unsuccessful writes and allows a later retry', async () => {
    const entry = remember();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({}, 401))
      .mockResolvedValueOnce(response({ RequestResult: 'Success' }));
    await expect(pushOpdsProgress(entry, progress, fetcher)).rejects.toThrow('(401)');
    await expect(pushOpdsProgress(entry, progress, fetcher)).resolves.toBeUndefined();
  });
});
