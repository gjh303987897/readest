import { describe, expect, it, vi } from 'vitest';
import {
  createOpdsBrowseSession,
  getOpdsRootUrl,
  loadOpdsFeedPage,
  loadOpdsDetails,
  loadOpdsCover,
  parseOpdsFeed,
} from '@/services/opdsService';
const base = 'https://books.example/opds';
const entry = (id: string) =>
  '<entry><id>' +
  id +
  '</id><title>Book ' +
  id +
  '</title><link rel="http://opds-spec.org/acquisition" href="/download/' +
  id +
  '.epub" type="application/epub+zip"/></entry>';
const feed = (body: string) =>
  '<feed xmlns="http://www.w3.org/2005/Atom"><title>Books</title>' + body + '</feed>';
const nav = (url: string) =>
  '<entry><title>Category</title><link rel="subsection" href="' +
  url +
  '" type="application/atom+xml;profile=opds-catalog;kind=navigation"/></entry>';
describe('OPDS browsing', () => {
  it('keeps reverse proxy paths and Kavita API keys in provider roots', () => {
    expect(getOpdsRootUrl('https://books.example/proxy/opds/category/2', 'calibre-web')).toBe(
      'https://books.example/proxy/opds',
    );
    expect(getOpdsRootUrl('https://books.example/proxy/api/opds/key/libraries/1', 'kavita')).toBe(
      'https://books.example/proxy/api/opds/key',
    );
  });
  it('loads only one feed page for the home screen', async () => {
    const fetcher = vi.fn(
      async () => new Response(feed(nav('/categories') + '<link rel="next" href="?offset=20"/>')),
    );
    const page = await loadOpdsFeedPage(base, {}, undefined, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(page.navigation).toHaveLength(1);
    expect(page.nextUrl).toBe(base + '?offset=20');
  });
  it('buffers large pages and does not request the next page until needed', async () => {
    const fetcher = vi.fn(
      async (url) =>
        new Response(
          String(url).includes('?')
            ? feed(entry('next'))
            : feed(
                Array.from({ length: 100 }, (_, i) => entry(String(i))).join('') +
                  '<link rel="next" href="?offset=100"/>',
              ),
        ),
    );
    const session = createOpdsBrowseSession(base, {}, fetcher);
    expect((await session.next(8)).books).toHaveLength(8);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await session.next(92)).books).toHaveLength(92);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await session.next(8)).books.map((b) => b.id)).toEqual(['next']);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('walks every branch of mixed feeds, deduplicates and rejects foreign hosts and cycles', async () => {
    const pages: Record<string, string> = {
      [base]: feed(
        entry('first') +
          nav('/opds/series') +
          nav('https://foreign.example/books') +
          '<link rel="next" href="?page=2"/>',
      ),
      [base + '/series']: feed(entry('second') + nav(base)),
      [base + '?page=2']: feed(entry('first') + entry('third')),
    };
    const fetcher = vi.fn(async (url) => new Response(pages[String(url)]));
    const session = createOpdsBrowseSession(base, {}, fetcher);
    const result = await session.next(24);
    expect(result.books.map((b) => b.id)).toEqual(['first', 'second', 'third']);
    expect(result.hasMore).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('preserves books already buffered when a later page fails, so retry loses nothing', async () => {
    let failing = true;
    const fetcher = vi.fn(async (url) => {
      if (String(url).includes('?')) {
        if (failing) throw new Error('offline');
        return new Response(feed(entry('second')));
      }
      return new Response(feed(entry('first') + '<link rel="next" href="?page=2"/>'));
    });
    const session = createOpdsBrowseSession(base, {}, fetcher);
    await expect(session.next(24)).rejects.toThrow('offline');
    failing = false;
    expect((await session.next(24)).books.map((b) => b.id)).toEqual(['first', 'second']);
  });
  it('bounds empty navigation work per interaction and resumes deeper catalogs', async () => {
    const fetcher = vi.fn(async (url) => {
      const n = Number(new URL(String(url)).searchParams.get('level') || 0);
      return new Response(feed(n < 10 ? nav('?level=' + (n + 1)) : entry('deep')));
    });
    const session = createOpdsBrowseSession(base, {}, fetcher);
    expect(await session.next(8)).toEqual({ books: [], hasMore: true });
    expect(fetcher).toHaveBeenCalledTimes(8);
    expect((await session.next(8)).books[0]?.id).toBe('deep');
  });
  it('cancels before making a feed request', async () => {
    const c = new AbortController();
    c.abort();
    const fetcher = vi.fn();
    await expect(
      createOpdsBrowseSession(base, {}, fetcher).next(8, c.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('extracts detailed metadata and renders HTML descriptions as safe text', () => {
    const xml = feed(
      entry('1').replace(
        '</entry>',
        '<summary type="html">&lt;p&gt;Description&lt;/p&gt;&lt;script&gt;bad()&lt;/script&gt;</summary><publisher>Publisher</publisher><issued>2026-01-01</issued><category term="novel" label="小说"/><identifier>ISBN</identifier><link rel="alternate" type="application/atom+xml" href="/details/1"/></entry>',
      ),
    );
    expect(parseOpdsFeed(xml, base).publications[0]).toMatchObject({
      summary: 'Description',
      publisher: 'Publisher',
      published: '2026-01-01',
      categories: ['小说'],
      identifier: 'ISBN',
      detailUrl: 'https://books.example/details/1',
    });
  });
  it('enriches a single entry without discarding an existing summary', async () => {
    const book = {
      ...parseOpdsFeed(feed(entry('1')), base).publications[0]!,
      summary: 'Original',
      detailUrl: base + '/1',
    };
    const result = await loadOpdsDetails(
      book,
      {},
      undefined,
      async () =>
        new Response(entry('1').replace('</entry>', '<publisher>Press</publisher></entry>')),
    );
    expect(result.summary).toBe('Original');
    expect(result.publisher).toBe('Press');
  });
  it('authenticates cover requests without putting credentials in the URL', async () => {
    const fetcher = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response('image', { headers: { 'Content-Type': 'image/png' } }),
    );
    const blob = await loadOpdsCover(
      base + '/cover',
      { username: 'reader', password: 'secret' },
      undefined,
      fetcher,
    );
    expect(blob.type).toBe('image/png');
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('Authorization')).toBe(
      'Basic ' + btoa('reader:secret'),
    );
  });
});

it('does not mistake a book detail link for a navigable category', () => {
  const xml = feed(
    entry('1').replace(
      '</entry>',
      '<link rel="alternate" type="application/atom+xml;profile=opds-catalog;kind=acquisition" href="/opds/book/1"/></entry>',
    ),
  );
  const page = parseOpdsFeed(xml, base);
  expect(page.publications).toHaveLength(1);
  expect(page.navigation).toEqual([]);
  expect(page.publications[0]?.detailUrl).toBe('https://books.example/opds/book/1');
});

it('reuses a category page already loaded for navigation without fetching it again', async () => {
  const initial = parseOpdsFeed(feed(entry('first') + '<link rel="next" href="?page=2"/>'), base);
  const fetcher = vi.fn(async () => new Response(feed(entry('second'))));
  const session = createOpdsBrowseSession(base, {}, fetcher, initial);
  expect((await session.next(1)).books[0]?.id).toBe('first');
  expect(fetcher).not.toHaveBeenCalled();
  expect((await session.next(1)).books[0]?.id).toBe('second');
  expect(fetcher).toHaveBeenCalledTimes(1);
});
