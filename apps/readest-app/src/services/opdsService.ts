import type { BookFormat } from '@/types/book';
import { SUPPORTED_BOOK_EXTS } from '@/services/constants';
import { isTauriAppPlatform } from '@/services/environment';
import { stubTranslation as _ } from '@/utils/misc';

const ATOM_FEED_TYPE = 'application/atom+xml;profile=opds-catalog';
const ACQUISITION_REL = 'http://opds-spec.org/acquisition';

export type OpdsProvider = 'calibre-web' | 'kavita';

export interface OpdsCredentials {
  username?: string;
  password?: string;
}

export interface OpdsPublication {
  id: string;
  title: string;
  authors: string[];
  summary?: string;
  language?: string;
  coverUrl?: string;
  format: BookFormat;
  downloadUrl: string;
  publisher?: string;
  published?: string;
  categories?: string[];
  identifier?: string;
  detailUrl?: string;
}

export interface OpdsNavigationLink {
  title: string;
  url: string;
  acquisition: boolean;
  summary?: string;
}

export interface ParsedOpdsFeed {
  title: string;
  publications: OpdsPublication[];
  navigation: OpdsNavigationLink[];
  searchUrl?: string;
  nextUrl?: string;
}

export interface OpdsCatalog {
  title: string;
  publications: OpdsPublication[];
  truncated?: boolean;
}

export type OpdsFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const MIME_FORMATS: Record<string, BookFormat> = {
  'application/epub+zip': 'EPUB',
  'application/pdf': 'PDF',
  'application/x-pdf': 'PDF',
  'application/x-mobipocket-ebook': 'MOBI',
  'application/vnd.amazon.ebook': 'AZW3',
  'application/x-cbz': 'CBZ',
  'application/vnd.comicbook+zip': 'CBZ',
  'application/fb2+xml': 'FB2',
  'application/x-fictionbook+xml': 'FB2',
  'text/plain': 'TXT',
  'text/markdown': 'MD',
};

const FORMAT_PRIORITY: Record<BookFormat, number> = {
  EPUB: 0,
  PDF: 1,
  AZW3: 2,
  AZW: 3,
  MOBI: 4,
  FB2: 5,
  FBZ: 6,
  CBZ: 7,
  TXT: 8,
  MD: 9,
};

const directChildren = (element: Element, localName: string): Element[] =>
  Array.from(element.children).filter((child) => child.localName === localName);

const childText = (element: Element, localName: string): string | undefined => {
  const value = directChildren(element, localName)[0]?.textContent?.trim();
  return value || undefined;
};

const descriptionText = (entry: Element): string | undefined => {
  const element = directChildren(entry, 'summary')[0] ?? directChildren(entry, 'content')[0];
  if (!element) return undefined;
  const type = element.getAttribute('type');
  const text = type === 'xhtml' ? element.innerHTML : (element.textContent?.trim() ?? '');
  if (type === 'html' || type === 'xhtml') {
    const document = new DOMParser().parseFromString(text, 'text/html');
    document.querySelectorAll('script,style').forEach((node) => node.remove());
    document.querySelectorAll('br').forEach((node) => node.replaceWith('\n'));
    document.querySelectorAll('p,div,li').forEach((node) => node.append('\n\n'));
    return document.body.textContent?.replace(/\n{3,}/g, '\n\n').trim() || undefined;
  }
  return text || undefined;
};

const resolveUrl = (href: string, baseUrl: string): string => new URL(href, baseUrl).toString();

const inferFormat = (type: string | null, href: string): BookFormat | undefined => {
  const pathname = new URL(href).pathname;
  const lastSegment = pathname.split('/').filter(Boolean).at(-1);
  const extension = lastSegment?.split('.').pop()?.toLocaleLowerCase();
  if (extension && SUPPORTED_BOOK_EXTS.includes(extension)) {
    return extension.toLocaleUpperCase() as BookFormat;
  }

  const mime = type?.split(';', 1)[0]?.trim().toLocaleLowerCase();
  if (mime && MIME_FORMATS[mime]) return MIME_FORMATS[mime];
  return undefined;
};

const isNextRelation = (relation: string) =>
  relation.split(/\s+/).some((value) => value === 'next' || value.endsWith('/next'));

const parsePublication = (entry: Element, baseUrl: string): OpdsPublication | null => {
  const links = directChildren(entry, 'link');
  const acquisitions = links
    .map((link) => {
      const href = link.getAttribute('href');
      const relation = link.getAttribute('rel') ?? '';
      if (!href || !relation.startsWith(ACQUISITION_REL)) return null;
      const url = resolveUrl(href, baseUrl);
      const format = inferFormat(link.getAttribute('type'), url);
      return format ? { url, format } : null;
    })
    .filter((link): link is { url: string; format: BookFormat } => !!link)
    .sort((a, b) => FORMAT_PRIORITY[a.format] - FORMAT_PRIORITY[b.format]);

  const acquisition = acquisitions[0];
  if (!acquisition) return null;

  const title = childText(entry, 'title') ?? acquisition.url;
  const authors = directChildren(entry, 'author')
    .map((author) => childText(author, 'name'))
    .filter((author): author is string => !!author);
  const coverLink =
    links.find((link) => {
      const relation = link.getAttribute('rel') ?? '';
      return relation === `${ACQUISITION_REL.replace('/acquisition', '')}/image`;
    }) ?? links.find((link) => (link.getAttribute('rel') ?? '').includes('/image/thumbnail'));
  const coverHref = coverLink?.getAttribute('href');
  const detailLink = links
    .find(
      (link) =>
        (link.getAttribute('type') ?? '').includes('application/atom+xml') &&
        ['alternate', 'self'].includes(link.getAttribute('rel') ?? ''),
    )
    ?.getAttribute('href');

  return {
    id: childText(entry, 'id') ?? acquisition.url,
    title,
    authors,
    summary: descriptionText(entry),
    language: childText(entry, 'language'),
    coverUrl: coverHref ? resolveUrl(coverHref, baseUrl) : undefined,
    format: acquisition.format,
    downloadUrl: acquisition.url,
    ...(childText(entry, 'publisher') ? { publisher: childText(entry, 'publisher') } : {}),
    ...((childText(entry, 'issued') ?? childText(entry, 'published'))
      ? { published: childText(entry, 'issued') ?? childText(entry, 'published') }
      : {}),
    ...(directChildren(entry, 'category').length
      ? {
          categories: directChildren(entry, 'category')
            .map((node) => node.getAttribute('label') || node.getAttribute('term') || '')
            .filter(Boolean),
        }
      : {}),
    ...(childText(entry, 'identifier') ? { identifier: childText(entry, 'identifier') } : {}),
    ...(detailLink ? { detailUrl: resolveUrl(detailLink, baseUrl) } : {}),
  };
};

export const parseOpdsFeed = (xml: string, feedUrl: string): ParsedOpdsFeed => {
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  if (document.querySelector('parsererror') || document.documentElement.localName !== 'feed') {
    throw new Error(_('The server did not return a valid OPDS feed'));
  }

  const feed = document.documentElement;
  const entries = directChildren(feed, 'entry');
  const publications = entries
    .map((entry) => parsePublication(entry, feedUrl))
    .filter((publication): publication is OpdsPublication => !!publication);
  const navigation = entries.flatMap((entry) => {
    const title = childText(entry, 'title') ?? '';
    const isPublication = !!parsePublication(entry, feedUrl);
    return directChildren(entry, 'link').flatMap((link) => {
      const href = link.getAttribute('href');
      const relation = link.getAttribute('rel') ?? '';
      const type = link.getAttribute('type') ?? '';
      const [mediaType, ...parameters] = type
        .toLowerCase()
        .split(';')
        .map((value) => value.trim());
      const parameterMap = new Map(
        parameters.map((value) => {
          const separator = value.indexOf('=');
          return [
            value.slice(0, separator).trim(),
            value
              .slice(separator + 1)
              .trim()
              .replace(/^"|"$/g, ''),
          ];
        }),
      );
      if (
        !href ||
        (isPublication && !relation.split(/\s+/).includes('subsection')) ||
        (!relation.split(/\s+/).includes('subsection') &&
          !(mediaType === 'application/atom+xml' && parameterMap.get('profile') === 'opds-catalog'))
      ) {
        return [];
      }
      return [
        {
          title,
          url: resolveUrl(href, feedUrl),
          acquisition: parameterMap.get('kind') === 'acquisition',
          ...(descriptionText(entry) ? { summary: descriptionText(entry) } : {}),
        },
      ];
    });
  });
  const nextHref = directChildren(feed, 'link')
    .find((link) => isNextRelation(link.getAttribute('rel') ?? ''))
    ?.getAttribute('href');
  const searchHref = directChildren(feed, 'link')
    .find((link) => {
      const relations = (link.getAttribute('rel') ?? '').split(/\s+/);
      const type = link.getAttribute('type')?.toLocaleLowerCase() ?? '';
      return relations.includes('search') && type.startsWith('application/atom+xml');
    })
    ?.getAttribute('href');
  const emptySearchHref = searchHref?.replace(/\/?\{searchTerms\}/gi, '');

  return {
    title: childText(feed, 'title') ?? 'OPDS',
    publications,
    navigation,
    searchUrl: emptySearchHref ? resolveUrl(emptySearchHref, feedUrl) : undefined,
    nextUrl: nextHref ? resolveUrl(nextHref, feedUrl) : undefined,
  };
};

const encodeBasicCredentials = ({ username, password }: OpdsCredentials): string | undefined => {
  if (!username) return undefined;
  const bytes = new TextEncoder().encode(`${username}:${password ?? ''}`);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `Basic ${btoa(binary)}`;
};

const requestHeaders = (
  credentials: OpdsCredentials,
  accept = `${ATOM_FEED_TYPE}, application/atom+xml, application/xml`,
): Headers => {
  const headers = new Headers({ Accept: accept });
  const authorization = encodeBasicCredentials(credentials);
  if (authorization) headers.set('Authorization', authorization);
  return headers;
};

export const defaultOpdsFetch: OpdsFetch = async (input, init) => {
  if (isTauriAppPlatform()) {
    const { fetch: nativeFetch } = await import('@tauri-apps/plugin-http');
    return nativeFetch(input, init);
  }
  return fetch(input, init);
};

const normalizeCatalogUrl = (value: string): string => {
  const url = new URL(value.trim());
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(_('OPDS catalog URL must use HTTP or HTTPS'));
  }
  return url.toString();
};

const requestWithTimeout = async <T>(
  url: string,
  credentials: OpdsCredentials,
  fetcher: OpdsFetch,
  consume: (response: Response) => Promise<T>,
  signal?: AbortSignal,
  accept?: string,
  timeoutMs = 30000,
): Promise<T> => {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  try {
    const response = await fetcher(url, {
      headers: requestHeaders(credentials, accept),
      signal: controller.signal,
    });
    if (response.status === 401) throw new Error(_('OPDS authentication failed'));
    if (!response.ok) throw new Error(_('OPDS request failed') + ' (' + response.status + ')');
    return await consume(response);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
};

const fetchFeed = async (
  url: string,
  credentials: OpdsCredentials,
  fetcher: OpdsFetch,
  signal?: AbortSignal,
): Promise<ParsedOpdsFeed> =>
  requestWithTimeout(
    url,
    credentials,
    fetcher,
    async (response) => parseOpdsFeed(await response.text(), response.url || url),
    signal,
  );

/** Fetch one server page; browsing deliberately does not walk the entire catalog. */
export const loadOpdsFeedPage = (
  url: string,
  credentials: OpdsCredentials = {},
  signal?: AbortSignal,
  fetcher: OpdsFetch = defaultOpdsFetch,
) => fetchFeed(url, credentials, fetcher, signal);

export const getOpdsRootUrl = (catalogUrl: string, provider: OpdsProvider): string => {
  const url = new URL(providerCatalogUrl(catalogUrl, provider));
  url.pathname =
    provider === 'calibre-web'
      ? url.pathname.replace(/\/books\/letter\/00$/, '')
      : url.pathname.replace(/\/libraries$/, '');
  return url.toString();
};

export const loadOpdsCover = (
  url: string,
  credentials: OpdsCredentials,
  signal?: AbortSignal,
  fetcher: OpdsFetch = defaultOpdsFetch,
): Promise<Blob> =>
  requestWithTimeout(url, credentials, fetcher, (response) => response.blob(), signal, 'image/*');

export const loadOpdsDetails = async (
  book: OpdsPublication,
  credentials: OpdsCredentials,
  signal?: AbortSignal,
  fetcher: OpdsFetch = defaultOpdsFetch,
): Promise<OpdsPublication> => {
  if (!book.detailUrl) return book;
  return requestWithTimeout(
    book.detailUrl,
    credentials,
    fetcher,
    async (response) => {
      const document = new DOMParser().parseFromString(await response.text(), 'application/xml');
      if (document.querySelector('parsererror'))
        throw new Error(_('The server did not return a valid OPDS feed'));
      const entries =
        document.documentElement.localName === 'entry'
          ? [document.documentElement]
          : directChildren(document.documentElement, 'entry');
      const entriesWithBooks = entries
        .map((entry) => parsePublication(entry, book.detailUrl!))
        .filter(Boolean);
      const detailed = entriesWithBooks.find(
        (entry) => entry?.id === book.id || entry?.downloadUrl === book.downloadUrl,
      );
      return detailed
        ? {
            ...book,
            ...Object.fromEntries(
              Object.entries(detailed).filter(([, value]) => value !== undefined),
            ),
          }
        : book;
    },
    signal,
  );
};

/** A resumable depth-first preview/page loader for navigation-only and mixed OPDS feeds. */
export const createOpdsBrowseSession = (
  url: string,
  credentials: OpdsCredentials,
  fetcher: OpdsFetch = defaultOpdsFetch,
  initialPage?: ParsedOpdsFeed,
) => {
  const pending: OpdsNavigationLink[] = [{ url, title: '', acquisition: false }];
  const visited = new Set<string>();
  const seen = new Set<string>();
  const buffer: OpdsPublication[] = [];
  const origin = new URL(url).origin;
  return {
    async next(count: number, signal?: AbortSignal) {
      const books: OpdsPublication[] = [];
      // Limit each interaction's navigation work even when many folders are empty.
      let requests = 0;
      while (books.length < count && (buffer.length || pending.length) && requests < 8) {
        if (signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
        while (buffer.length && books.length < count) books.push(buffer.shift()!);
        if (books.length >= count || !pending.length) break;
        const link = pending.shift()!;
        const address = new URL(link.url);
        address.hash = '';
        if (address.origin !== origin || visited.has(address.toString())) continue;
        // Keep the cursor retryable if a page request fails.
        let page: ParsedOpdsFeed;
        try {
          page = initialPage ?? (await fetchFeed(address.toString(), credentials, fetcher, signal));
          initialPage = undefined;
        } catch (error) {
          pending.unshift(link);
          buffer.unshift(...books);
          throw error;
        }
        visited.add(address.toString());
        requests++;
        for (const book of page.publications) {
          if (seen.has(book.downloadUrl)) continue;
          seen.add(book.downloadUrl);
          buffer.push({ ...book, summary: book.summary ?? link.summary });
        }
        const children = page.navigation
          .filter((child) => child.url !== link.url)
          .map((child) => ({ ...child, summary: child.summary ?? link.summary }));
        pending.unshift(...children, ...(page.nextUrl ? [{ ...link, url: page.nextUrl }] : []));
      }
      while (buffer.length && books.length < count) books.push(buffer.shift()!);
      return { books, hasMore: !!(buffer.length || pending.length) };
    },
  };
};

const findAllBooksLink = (navigation: OpdsNavigationLink[]): OpdsNavigationLink | undefined => {
  const allBooksPattern = /^all( books| publications| titles)?$/i;
  const alphabeticalPattern = /^alphabetical( books| publications| titles)?$/i;
  return (
    navigation.find((link) => allBooksPattern.test(link.title.trim())) ??
    navigation.find((link) => alphabeticalPattern.test(link.title.trim())) ??
    navigation.find((link) => /\/category\/0(?:\/|$|\?)/.test(link.url)) ??
    (navigation.filter((link) => link.acquisition).length === 1
      ? navigation.find((link) => link.acquisition)
      : undefined)
  );
};

const providerCatalogUrl = (catalogUrl: string, provider: OpdsProvider): string => {
  const url = new URL(normalizeCatalogUrl(catalogUrl));
  if (provider === 'calibre-web') {
    const opdsIndex = url.pathname.search(/\/opds(?:\/|$)/i);
    const basePath =
      opdsIndex >= 0 ? url.pathname.slice(0, opdsIndex) : url.pathname.replace(/\/+$/, '');
    url.pathname = `${basePath}/opds/books/letter/00`;
  } else {
    const root = url.pathname.match(/^(.*\/api\/opds\/[^/]+)(?:\/.*)?$/i)?.[1];
    if (!root) throw new Error(_('Enter the full Kavita OPDS URL from your user settings'));
    url.pathname = `${root}/libraries`;
  }
  url.search = '';
  url.hash = '';
  return url.toString();
};

const loadKavitaPublications = async (
  catalogUrl: string,
  credentials: OpdsCredentials,
  fetcher: OpdsFetch,
  signal?: AbortSignal,
): Promise<OpdsCatalog> => {
  const basePath = new URL(catalogUrl).pathname.slice(0, -'/libraries'.length);
  const pending = new Set([catalogUrl]);
  const visited = new Set<string>();
  const publications = new Map<string, OpdsPublication>();
  let title = '';
  let truncated = false;
  const enqueue = (value: string) => {
    const url = new URL(value);
    url.hash = '';
    if (
      url.pathname.toLowerCase().startsWith(`${basePath.toLowerCase()}/`) &&
      /^(?:libraries(?:\/\d+)?|series\/\d+(?:\/volume\/\d+(?:\/chapter\/\d+)?)?)\/?$/i.test(
        url.pathname.slice(basePath.length + 1),
      ) &&
      !visited.has(url.toString())
    ) {
      pending.add(url.toString());
    }
  };

  // Kavita's libraries and series are navigation feeds, not a flat book list.
  // Traverse every branch and its pagination, including mixed acquisition feeds.
  while (pending.size > 0) {
    if (signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
    if (visited.size >= 10000) {
      truncated = true;
      break;
    }
    const pageUrl = pending.values().next().value!;
    pending.delete(pageUrl);
    visited.add(pageUrl);
    const page = await fetchFeed(pageUrl, credentials, fetcher, signal);
    title ||= page.title;
    for (const publication of page.publications) {
      if (!publications.has(publication.downloadUrl) && publications.size >= 10000) {
        truncated = true;
        break;
      }
      publications.set(publication.downloadUrl, publication);
    }
    if (truncated) break;
    if (page.nextUrl) enqueue(page.nextUrl);
    for (const link of page.navigation) enqueue(link.url);
  }

  if (!publications.size) throw new Error(_('No books were found in this OPDS catalog'));
  return { title, publications: [...publications.values()], ...(truncated ? { truncated } : {}) };
};

export const loadOpdsPublications = async (
  catalogUrl: string,
  credentials: OpdsCredentials = {},
  fetcher: OpdsFetch = defaultOpdsFetch,
  signal?: AbortSignal,
  provider?: OpdsProvider,
): Promise<OpdsCatalog> => {
  let pageUrl = provider
    ? providerCatalogUrl(catalogUrl, provider)
    : normalizeCatalogUrl(catalogUrl);
  if (provider === 'kavita') return loadKavitaPublications(pageUrl, credentials, fetcher, signal);
  let page = await fetchFeed(pageUrl, credentials, fetcher, signal);

  // Navigate through up to 3 levels of navigation to find books
  let navigationDepth = 0;
  while (page.publications.length === 0 && navigationDepth < 3) {
    // First try to find a common "all books" link
    const allBooks = findAllBooksLink(page.navigation);
    if (allBooks) {
      pageUrl = allBooks.url;
      page = await fetchFeed(pageUrl, credentials, fetcher, signal);
      navigationDepth++;
      continue;
    }

    // If no "all books" link, try the search URL
    if (page.searchUrl) {
      pageUrl = page.searchUrl;
      page = await fetchFeed(pageUrl, credentials, fetcher, signal);
      navigationDepth++;
      continue;
    }

    // If we have any acquisition links, try the first one
    const acquisitionLinks = page.navigation.filter((link) => link.acquisition);
    if (acquisitionLinks.length > 0) {
      pageUrl = acquisitionLinks[0]!.url;
      page = await fetchFeed(pageUrl, credentials, fetcher, signal);
      navigationDepth++;
      continue;
    }

    // Otherwise try any navigation link
    if (page.navigation.length > 0) {
      pageUrl = page.navigation[0]!.url;
      page = await fetchFeed(pageUrl, credentials, fetcher, signal);
      navigationDepth++;
      continue;
    }

    // No more navigation options
    break;
  }

  if (page.publications.length === 0) {
    throw new Error(_('No books were found in this OPDS catalog'));
  }

  const title = page.title;
  const publications = new Map<string, OpdsPublication>();
  const visited = new Set<string>();

  let truncated = false;
  while (!visited.has(pageUrl)) {
    if (signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
    visited.add(pageUrl);
    for (const publication of page.publications) {
      if (publications.size >= 10000) {
        truncated = true;
        break;
      }
      publications.set(publication.id || publication.downloadUrl, publication);
    }
    if (truncated || !page.nextUrl) break;
    if (visited.size >= (provider ? 10000 : 100)) {
      truncated = true;
      break;
    }
    pageUrl = page.nextUrl;
    page = await fetchFeed(pageUrl, credentials, fetcher, signal);
  }

  return {
    title,
    publications: Array.from(publications.values()),
    ...(truncated ? { truncated } : {}),
  };
};

const safeFilename = (title: string, format: BookFormat): string => {
  const sanitized = title
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .trim()
    .replace(/[. ]+$/g, '');
  return `${sanitized || 'book'}.${format.toLocaleLowerCase()}`;
};

export const downloadOpdsPublication = async (
  publication: OpdsPublication,
  credentials: OpdsCredentials = {},
  fetcher: OpdsFetch = defaultOpdsFetch,
  signal?: AbortSignal,
): Promise<File> =>
  requestWithTimeout(
    publication.downloadUrl,
    credentials,
    fetcher,
    async (response) => {
      const contentType = response.headers.get('Content-Type')?.split(';', 1)[0] || '';
      return new File(
        [await response.arrayBuffer()],
        safeFilename(publication.title, publication.format),
        { type: contentType || undefined },
      );
    },
    signal,
    '*/*',
    600000,
  );
