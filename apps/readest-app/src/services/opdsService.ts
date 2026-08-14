import type { BookFormat } from '@/types/book';
import { SUPPORTED_BOOK_EXTS } from '@/services/constants';
import { isTauriAppPlatform } from '@/services/environment';
import { stubTranslation as _ } from '@/utils/misc';

const ATOM_FEED_TYPE = 'application/atom+xml;profile=opds-catalog';
const ACQUISITION_REL = 'http://opds-spec.org/acquisition';

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
}

interface OpdsNavigationLink {
  title: string;
  url: string;
  acquisition: boolean;
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

  return {
    id: childText(entry, 'id') ?? acquisition.url,
    title,
    authors,
    summary: childText(entry, 'summary') ?? childText(entry, 'content'),
    language: childText(entry, 'language'),
    coverUrl: coverHref ? resolveUrl(coverHref, baseUrl) : undefined,
    format: acquisition.format,
    downloadUrl: acquisition.url,
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
    return directChildren(entry, 'link').flatMap((link) => {
      const href = link.getAttribute('href');
      const relation = link.getAttribute('rel') ?? '';
      const type = link.getAttribute('type') ?? '';
      if (
        !href ||
        (!relation.split(/\s+/).includes('subsection') && !type.includes(ATOM_FEED_TYPE))
      ) {
        return [];
      }
      return [
        {
          title,
          url: resolveUrl(href, feedUrl),
          acquisition: type.includes('kind=acquisition'),
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

const defaultOpdsFetch: OpdsFetch = async (input, init) => {
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

const fetchFeed = async (
  url: string,
  credentials: OpdsCredentials,
  fetcher: OpdsFetch,
): Promise<ParsedOpdsFeed> => {
  const response = await fetcher(url, { headers: requestHeaders(credentials) });
  if (response.status === 401) throw new Error(_('OPDS authentication failed'));
  if (!response.ok) throw new Error(`${_('OPDS request failed')} (${response.status})`);
  return parseOpdsFeed(await response.text(), response.url || url);
};

const findAllBooksLink = (navigation: OpdsNavigationLink[]): OpdsNavigationLink | undefined => {
  const allBooksPattern = /^all( books| publications| titles)?$/i;
  return (
    navigation.find((link) => allBooksPattern.test(link.title.trim())) ??
    navigation.find((link) => /\/category\/0(?:\/|$|\?)/.test(link.url)) ??
    (navigation.filter((link) => link.acquisition).length === 1
      ? navigation.find((link) => link.acquisition)
      : undefined)
  );
};

export const loadOpdsPublications = async (
  catalogUrl: string,
  credentials: OpdsCredentials = {},
  fetcher: OpdsFetch = defaultOpdsFetch,
): Promise<OpdsCatalog> => {
  let pageUrl = normalizeCatalogUrl(catalogUrl);
  let page = await fetchFeed(pageUrl, credentials, fetcher);

  if (page.publications.length === 0) {
    const allBooks = findAllBooksLink(page.navigation);
    const acquisitionUrl = allBooks?.url ?? page.searchUrl;
    if (!acquisitionUrl) {
      throw new Error(_('No acquisition feed was found in this OPDS catalog'));
    }
    pageUrl = acquisitionUrl;
    page = await fetchFeed(pageUrl, credentials, fetcher);
  }

  const title = page.title;
  const publications = new Map<string, OpdsPublication>();
  const visited = new Set<string>();

  while (!visited.has(pageUrl)) {
    visited.add(pageUrl);
    for (const publication of page.publications) {
      publications.set(publication.id || publication.downloadUrl, publication);
    }
    if (!page.nextUrl) break;
    pageUrl = page.nextUrl;
    page = await fetchFeed(pageUrl, credentials, fetcher);
  }

  return { title, publications: Array.from(publications.values()) };
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
): Promise<File> => {
  const response = await fetcher(publication.downloadUrl, {
    headers: requestHeaders(credentials, '*/*'),
  });
  if (response.status === 401) throw new Error(_('OPDS authentication failed'));
  if (!response.ok) throw new Error(`${_('Book download failed')} (${response.status})`);

  const contentType = response.headers.get('Content-Type')?.split(';', 1)[0] || '';
  return new File(
    [await response.arrayBuffer()],
    safeFilename(publication.title, publication.format),
    {
      type: contentType || undefined,
    },
  );
};
