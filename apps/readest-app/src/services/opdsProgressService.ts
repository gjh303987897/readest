import type { Book, BookProgress } from '@/types/book';
import {
  defaultOpdsFetch,
  getOpdsRootUrl,
  type OpdsFetch,
  type OpdsPublication,
} from './opdsService';
import { readSavedLogins, type SavedOpdsLogin } from './opdsLoginService';
import { stubTranslation as _ } from '@/utils/misc';

export interface OpdsProgressSource {
  provider: 'calibre-web' | 'kavita';
  loginUrl: string;
  username: string;
  bookId: string;
}

const SOURCE_KEY = 'readest-opds-progress-sources-v1';
const CACHE_SOURCE_KEY = 'readest-opds-cache-sources-v1';
type SourceMap = Record<string, OpdsProgressSource[]>;

const readSources = (cacheOnly = false): SourceMap => {
  try {
    const value = JSON.parse(
      (cacheOnly ? sessionStorage : localStorage).getItem(
        cacheOnly ? CACHE_SOURCE_KEY : SOURCE_KEY,
      ) ?? '{}',
    );
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const result: SourceMap = {};
    for (const [hash, sources] of Object.entries(value)) {
      if (!Array.isArray(sources)) continue;
      result[hash] = sources.filter(
        (source): source is OpdsProgressSource =>
          source &&
          ['calibre-web', 'kavita'].includes(source.provider) &&
          typeof source.loginUrl === 'string' &&
          typeof source.username === 'string' &&
          typeof source.bookId === 'string',
      );
    }
    return result;
  } catch {
    return {};
  }
};

const rootUrl = (login: SavedOpdsLogin) =>
  getOpdsRootUrl(login.url, login.provider!).replace(/\/$/, '');

export const createOpdsProgressSource = (
  login: SavedOpdsLogin,
  publication: OpdsPublication,
): OpdsProgressSource | undefined => {
  if (!login.provider) return;
  const root = rootUrl(login);
  const download = new URL(publication.downloadUrl);
  if (download.origin !== new URL(root).origin) return;
  const bookId =
    login.provider === 'calibre-web'
      ? publication.id.match(/^(?:urn:uuid:)?([\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12})$/i)?.[1]
      : download.pathname.startsWith(new URL(root).pathname + '/')
        ? download.pathname.match(/\/chapter\/(\d+)\/download\//i)?.[1]
        : undefined;
  if (!bookId) return;
  return {
    provider: login.provider,
    loginUrl: new URL(login.url).toString(),
    username: login.username,
    bookId,
  };
};

export const getOpdsProgressSources = (book: Pick<Book, 'hash' | 'cacheOnly'>) =>
  readSources(book.cacheOnly)[book.hash] ?? [];

export const rememberOpdsProgressSource = (
  book: Book,
  source: OpdsProgressSource | undefined,
  replacedHashes: string[] = [],
) => {
  if (!source) return;
  // Only source identities live here. Passwords/tokens stay in the saved login;
  // cached reading progress is never written to either storage.
  const sources = readSources(book.cacheOnly);
  const previous = book.cacheOnly
    ? []
    : [sources[book.hash] ?? [], ...replacedHashes.map((hash) => sources[hash] ?? [])].flat();
  sources[book.hash] = [
    ...previous.filter((entry) => JSON.stringify(entry) !== JSON.stringify(source)),
    source,
  ];
  if (!book.cacheOnly)
    for (const hash of replacedHashes) if (hash !== book.hash) delete sources[hash];
  (book.cacheOnly ? sessionStorage : localStorage).setItem(
    book.cacheOnly ? CACHE_SOURCE_KEY : SOURCE_KEY,
    JSON.stringify(sources),
  );
};

export const updateOpdsProgressLogin = (oldLogin: SavedOpdsLogin, next: SavedOpdsLogin) => {
  for (const cacheOnly of [false, true]) {
    const sources = readSources(cacheOnly);
    for (const [hash, entries] of Object.entries(sources)) {
      sources[hash] = entries.flatMap((entry) => {
        if (
          entry.loginUrl !== oldLogin.url ||
          entry.username !== oldLogin.username ||
          entry.provider !== oldLogin.provider
        )
          return [entry];
        // Switching servers/accounts must not assign the old server's book ID
        // to an unrelated book. Token/password edits retain the association.
        if (
          entry.provider !== next.provider ||
          entry.username !== next.username ||
          rootUrl(oldLogin) !== rootUrl(next)
        )
          return [];
        return [{ ...entry, loginUrl: next.url }];
      });
    }
    (cacheOnly ? sessionStorage : localStorage).setItem(
      cacheOnly ? CACHE_SOURCE_KEY : SOURCE_KEY,
      JSON.stringify(sources),
    );
  }
};

export const opdsProgressSetupMessage = (login: SavedOpdsLogin) =>
  login.provider === 'calibre-web' && !login.koboToken?.trim()
    ? _(
        'To send reading progress to Calibre-Web, edit this saved login and add its Kobo sync token.',
      )
    : _(
        'Reading progress will be sent to this OPDS service. Exact reading positions may differ between readers.',
      );

const request = async (url: string, init: RequestInit, fetcher: OpdsFetch) => {
  const response = await fetcher(url, {
    ...init,
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...init.headers },
  });
  if (!response.ok)
    throw new Error(
      _('Could not send reading progress to the OPDS service') + ` (${response.status})`,
    );
  return response;
};

const tokens = new Map<string, { token: string; expires: number }>();
const chapters = new Map<
  string,
  { pages: number; volumeId: number; seriesId: number; libraryId: number }
>();

const pushSource = async (
  source: OpdsProgressSource,
  progress: Pick<BookProgress, 'fraction' | 'pageinfo'>,
  fetcher: OpdsFetch,
) => {
  const login = readSavedLogins().find(
    (entry) =>
      entry.provider === source.provider &&
      new URL(entry.url).toString() === source.loginUrl &&
      entry.username === source.username,
  );
  // Removing a saved account stops sending to that account.
  if (!login) return;
  const root = rootUrl(login);
  const completed =
    progress.pageinfo.total > 0 && progress.pageinfo.current >= progress.pageinfo.total;
  const fraction = completed ? 1 : Math.min(1, Math.max(0, progress.fraction));
  if (!Number.isFinite(fraction)) return;
  if (source.provider === 'calibre-web') {
    if (!login.koboToken?.trim()) return;
    const base = root.replace(/\/opds$/i, '');
    let token = login.koboToken.trim();
    if (/^https?:\/\//i.test(token)) {
      const tokenUrl = new URL(token);
      const basePath = new URL(base).pathname.replace(/\/$/, '');
      if (
        tokenUrl.origin !== new URL(base).origin ||
        !tokenUrl.pathname.startsWith(basePath + '/kobo/')
      ) {
        throw new Error(_('The Kobo sync URL must belong to this Calibre-Web server'));
      }
      token = tokenUrl.pathname.slice(basePath.length + '/kobo/'.length).split('/')[0]!;
    }
    // Calibre-Web's Kobo API accepts percentages. Do not label Readest CFIs
    // as Kobo locations: those coordinate systems are not interchangeable.
    const percent = Math.round(fraction * 10000) / 100;
    const response = await request(
      `${base}/kobo/${encodeURIComponent(token)}/v1/library/${encodeURIComponent(source.bookId)}/state`,
      {
        method: 'PUT',
        body: JSON.stringify({
          ReadingStates: [
            {
              CurrentBookmark: {
                ProgressPercent: percent,
                ContentSourceProgressPercent: percent,
                Location: null,
              },
              Statistics: null,
              StatusInfo: {
                Status: completed ? 'Finished' : fraction > 0 ? 'Reading' : 'ReadyToRead',
              },
            },
          ],
        }),
      },
      fetcher,
    );
    const result = await response.json();
    if (result.RequestResult !== 'Success')
      throw new Error(_('Could not send reading progress to the OPDS service'));
    return;
  }

  const match = root.match(/^(.*)\/api\/opds\/([^/]+)$/i);
  if (!match) throw new Error(_('Enter the full Kavita OPDS URL from your user settings'));
  const [, base, apiKey] = match;
  const authId = JSON.stringify([root, login.username, login.password]);
  let auth = tokens.get(authId);
  if (!auth || auth.expires <= Date.now()) {
    // Official Account/login accepts an OPDS auth key and returns a JWT.
    const response = await request(
      `${base}/api/Account/login`,
      {
        method: 'POST',
        body: JSON.stringify({
          username: login.username,
          password: login.password,
          apiKey: decodeURIComponent(apiKey!),
        }),
      },
      fetcher,
    );
    const result = await response.json();
    if (typeof result.token !== 'string' || !result.token)
      throw new Error(_('OPDS authentication failed'));
    auth = { token: result.token, expires: Date.now() + 5 * 60 * 1000 };
    tokens.set(authId, auth);
  }
  const headers = { Authorization: `Bearer ${auth.token}` };
  const chapterKey = `${authId}:${source.bookId}`;
  try {
    let chapter = chapters.get(chapterKey);
    if (!chapter) {
      const response = await request(
        `${base}/api/Reader/chapter-info?chapterId=${encodeURIComponent(source.bookId)}`,
        { headers },
        fetcher,
      );
      const info = await response.json();
      if (
        !Number.isInteger(info.pages) ||
        info.pages <= 0 ||
        ![info.volumeId, info.seriesId, info.libraryId].every(Number.isInteger)
      ) {
        throw new Error(_('Could not send reading progress to the OPDS service'));
      }
      chapter = {
        pages: info.pages,
        volumeId: info.volumeId,
        seriesId: info.seriesId,
        libraryId: info.libraryId,
      };
      chapters.set(chapterKey, chapter);
    }
    // Server pages (EPUB spine fragments / fixed-layout pages), not the
    // reader's viewport-dependent page count, determine Kavita's progress.
    await request(
      `${base}/api/Reader/progress`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          chapterId: Number(source.bookId),
          volumeId: chapter.volumeId,
          seriesId: chapter.seriesId,
          libraryId: chapter.libraryId,
          pageNum: completed
            ? chapter.pages
            : Math.min(chapter.pages - 1, Math.floor(fraction * chapter.pages)),
          bookScrollId: null,
        }),
      },
      fetcher,
    );
  } catch (error) {
    tokens.delete(authId);
    throw error;
  }
};

const pending = new Map<string, Promise<void>>();
export const pushOpdsProgress = (
  book: Pick<Book, 'hash' | 'cacheOnly'>,
  progress: Pick<BookProgress, 'fraction' | 'pageinfo'>,
  fetcher: OpdsFetch = defaultOpdsFetch,
): Promise<void> => {
  const sources = getOpdsProgressSources(book);
  if (!sources.length) return Promise.resolve();
  const key = `${book.cacheOnly ? 'cache' : 'local'}:${book.hash}`;
  const task = (pending.get(key) ?? Promise.resolve())
    .catch(() => {})
    .then(async () => {
      const results = await Promise.allSettled(
        sources.map((source) => pushSource(source, progress, fetcher)),
      );
      const failure = results.find((result) => result.status === 'rejected');
      if (failure?.status === 'rejected') throw failure.reason;
    });
  pending.set(key, task);
  void task
    .finally(() => {
      if (pending.get(key) === task) pending.delete(key);
    })
    .catch(() => {});
  return task;
};
