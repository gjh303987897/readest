import { describe, expect, it, vi } from 'vitest';

import {
  downloadOpdsPublication,
  loadOpdsPublications,
  parseOpdsFeed,
  type OpdsPublication,
} from '@/services/opdsService';

const navigationFeed = (links: string[], next?: string) =>
  `<feed xmlns="http://www.w3.org/2005/Atom"><title>Library</title>
    ${next ? `<link rel="next" href="${next}"/>` : ''}
    ${links.map((href) => `<entry><title>目录</title><link rel="subsection" href="${href}" type="application/atom+xml;profile=opds-catalog;kind=navigation"/></entry>`).join('')}
  </feed>`;

const bookFeed = (id: string, next?: string) =>
  `<feed xmlns="http://www.w3.org/2005/Atom"><title>Books</title>
    ${next ? `<link rel="next" href="${next}"/>` : ''}
    <entry><id>${id}</id><title>Book ${id}</title><link rel="http://opds-spec.org/acquisition" href="/download/${id}.epub" type="application/epub+zip"/></entry>
  </feed>`;

describe('Provider-specific OPDS catalogs', () => {
  it.each([
    'https://books.example.com/calibre',
    'https://books.example.com/calibre/opds/',
    'https://books.example.com/calibre/opds/new?offset=40',
  ])('loads all Calibre-Web books from %s and follows pagination', async (url) => {
    const fetcher = vi.fn(
      async (input: string | URL | Request) =>
        new Response(
          String(input).includes('?offset=20')
            ? bookFeed('second')
            : bookFeed('first', '?offset=20'),
        ),
    );
    const catalog = await loadOpdsPublications(url, {}, fetcher, undefined, 'calibre-web');
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      'https://books.example.com/calibre/opds/books/letter/00',
      'https://books.example.com/calibre/opds/books/letter/00?offset=20',
    ]);
    expect(catalog.publications.map((book) => book.id)).toEqual(['first', 'second']);
  });

  it('loads provider catalogs beyond the generic 100-page navigation budget', async () => {
    let pages = 0;
    const fetcher = vi.fn(async () => {
      pages++;
      return new Response(bookFeed(String(pages), pages < 103 ? `?offset=${pages}` : undefined));
    });
    const catalog = await loadOpdsPublications(
      'https://books.example.com/opds',
      {},
      fetcher,
      undefined,
      'calibre-web',
    );
    expect(fetcher).toHaveBeenCalledTimes(103);
    expect(catalog.publications).toHaveLength(103);
    expect(catalog.truncated).toBeUndefined();
  });

  it('visits every Kavita library and paginated series, including mixed feeds and deeper chapters', async () => {
    const base = 'https://books.example.com/kavita/api/opds/user-key';
    const feeds: Record<string, string> = {
      '/libraries': navigationFeed([`${base}/libraries/1`, `${base}/libraries/2`]),
      '/libraries/1': navigationFeed([`${base}/series/10`], '?pageNumber=2'),
      '/libraries/1?pageNumber=2': navigationFeed([`${base}/series/11`]),
      '/libraries/2': navigationFeed([`${base}/series/20`]),
      '/series/10': bookFeed('first').replace(
        '</feed>',
        navigationFeed([`${base}/series/10/volume/1`]).match(/<entry>.*<\/entry>/s)![0] + '</feed>',
      ),
      '/series/10/volume/1': navigationFeed([`${base}/series/10/volume/1/chapter/100`]),
      '/series/10/volume/1/chapter/100': bookFeed('deeper'),
      '/series/11': bookFeed('second', '?pageNumber=2'),
      '/series/11?pageNumber=2': bookFeed('third'),
      '/series/20': bookFeed('first').replace(
        '</feed>',
        `<entry><id>last</id><title>Last</title><link rel="http://opds-spec.org/acquisition" href="/download/last.epub"/></entry></feed>`,
      ),
    };
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const path = String(input).slice(base.length);
      expect(feeds[path]).toBeDefined();
      return new Response(feeds[path]);
    });
    const catalog = await loadOpdsPublications(
      `${base}/recently-added`,
      {},
      fetcher,
      undefined,
      'kavita',
    );
    expect(new Set(catalog.publications.map((book) => book.id))).toEqual(
      new Set(['first', 'second', 'third', 'deeper', 'last']),
    );
    expect(fetcher).toHaveBeenCalledTimes(Object.keys(feeds).length);
    expect(fetcher.mock.calls[0]?.[0]).toBe(`${base}/libraries`);
  });

  it('does not require books in the first library and stops repeated navigation URLs', async () => {
    const base = 'https://books.example.com/api/Opds/user-key';
    const advertisedBase = base.replace('/api/Opds/', '/api/opds/');
    const feeds: Record<string, string> = {
      '/libraries': navigationFeed([
        `${advertisedBase}/libraries/1`,
        `${advertisedBase}/libraries/2`,
      ]),
      '/libraries/1': navigationFeed([]),
      '/libraries/2': navigationFeed([`${advertisedBase}/series/1`, `${advertisedBase}/series/1`]),
      '/series/1': bookFeed('book', `${advertisedBase}/series/1`),
    };
    const fetcher = vi.fn(
      async (input: string | URL | Request) =>
        new Response(feeds[String(input).slice(base.length)]),
    );
    const catalog = await loadOpdsPublications(base, {}, fetcher, undefined, 'kavita');
    expect(catalog.publications).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it('requires the complete Kavita OPDS URL containing the user key', async () => {
    const fetcher = vi.fn();
    await expect(
      loadOpdsPublications('https://books.example.com', {}, fetcher, undefined, 'kavita'),
    ).rejects.toThrow('Enter the full Kavita OPDS URL from your user settings');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('cancels Kavita traversal before starting another request', async () => {
    const controller = new AbortController();
    const base = 'https://books.example.com/api/opds/key';
    const fetcher = vi.fn(async () => {
      controller.abort();
      return new Response(navigationFeed([`${base}/libraries/1`]));
    });
    await expect(
      loadOpdsPublications(base, {}, fetcher, controller.signal, 'kavita'),
    ).rejects.toThrow('Request cancelled');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

const acquisitionFeed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/terms/">
  <title>All Books</title>
  <link rel="next" href="?page=2" />
  <entry>
    <title>Alice in Wonderland</title>
    <id>urn:book:alice</id>
    <author><name>Lewis Carroll</name></author>
    <dc:language>en</dc:language>
    <summary type="text">A curious adventure.</summary>
    <link rel="http://opds-spec.org/image/thumbnail" href="/covers/alice.jpg" type="image/jpeg" />
    <link rel="http://opds-spec.org/acquisition/open-access" href="/download/alice.pdf" type="application/pdf" />
    <link rel="http://opds-spec.org/acquisition/open-access" href="/download/alice.epub" type="application/epub+zip" />
  </entry>
</feed>`;

describe('OPDS 1 catalog support', () => {
  it('parses acquisition entries, resolves relative URLs, and prefers EPUB', () => {
    const parsed = parseOpdsFeed(acquisitionFeed, 'https://books.example.com/opds/all');

    expect(parsed.title).toBe('All Books');
    expect(parsed.nextUrl).toBe('https://books.example.com/opds/all?page=2');
    expect(parsed.publications).toEqual([
      expect.objectContaining({
        id: 'urn:book:alice',
        title: 'Alice in Wonderland',
        authors: ['Lewis Carroll'],
        language: 'en',
        format: 'EPUB',
        downloadUrl: 'https://books.example.com/download/alice.epub',
        coverUrl: 'https://books.example.com/covers/alice.jpg',
      }),
    ]);
  });

  it('preserves the format suffix used by Calibre-Web download routes', () => {
    const feed = `<?xml version="1.0"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title>Books</title>
        <entry>
          <title>Kindle Book</title>
          <id>urn:book:kindle</id>
          <link rel="http://opds-spec.org/acquisition" href="/opds/download/9/azw3" type="application/x-mobipocket-ebook" />
        </entry>
      </feed>`;

    const parsed = parseOpdsFeed(feed, 'https://books.example.com/opds/search');

    expect(parsed.publications[0]?.format).toBe('AZW3');
  });

  it('follows a Calibre-Web All Books navigation entry and every next page', async () => {
    const navigationFeed = `<?xml version="1.0"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title>Library</title>
        <entry>
          <title>All Books</title>
          <id>urn:nav:all</id>
          <link rel="subsection" href="/opds/category/0" type="application/atom+xml;profile=opds-catalog;kind=acquisition" />
        </entry>
      </feed>`;
    const secondPage = acquisitionFeed
      .replace('<link rel="next" href="?page=2" />', '')
      .replaceAll('alice', 'second')
      .replace('Alice in Wonderland', 'Second Book')
      .replace('urn:book:alice', 'urn:book:second');
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = url.endsWith('/opds')
        ? navigationFeed
        : url.endsWith('?page=2')
          ? secondPage
          : acquisitionFeed;
      expect(new Headers(init?.headers).get('Authorization')).toBe('Basic dXNlcjpwYXNz');
      return new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'application/atom+xml' },
      });
    });

    const result = await loadOpdsPublications(
      'https://books.example.com/opds',
      { username: 'user', password: 'pass' },
      fetcher,
    );

    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(result.title).toBe('All Books');
    expect(result.publications.map((book) => book.title)).toEqual([
      'Alice in Wonderland',
      'Second Book',
    ]);
  });

  it('uses the empty Atom search feed exposed by current Calibre-Web catalogs', async () => {
    const calibreWebRoot = `<?xml version="1.0"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title>Calibre-Web</title>
        <link type="application/atom+xml" rel="search" href="/opds/search/{searchTerms}" />
        <entry>
          <title>Alphabetical Books</title>
          <id>/opds/books</id>
          <link href="/opds/books" type="application/atom+xml;profile=opds-catalog" />
        </entry>
      </feed>`;
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      return new Response(
        url.endsWith('/opds')
          ? calibreWebRoot
          : acquisitionFeed.replace('<link rel="next" href="?page=2" />', ''),
        {
          status: 200,
          headers: { 'Content-Type': 'application/atom+xml' },
        },
      );
    });

    const result = await loadOpdsPublications('https://books.example.com/opds', {}, fetcher);

    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      'https://books.example.com/opds/books',
      expect.anything(),
    );
    expect(result.publications).toHaveLength(1);
  });

  it('downloads a selected publication as an importable File', async () => {
    const publication: OpdsPublication = {
      id: 'urn:book:alice',
      title: 'Alice / Wonderland',
      authors: ['Lewis Carroll'],
      format: 'EPUB',
      downloadUrl: 'https://books.example.com/download/42',
    };
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('Accept')).toBe('*/*');
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'Content-Type': 'application/epub+zip' },
      });
    });

    const file = await downloadOpdsPublication(publication, {}, fetcher);

    expect(file.name).toBe('Alice _ Wonderland.epub');
    expect(file.type).toBe('application/epub+zip');
    expect(file.size).toBe(3);
  });
});

it('accepts OPDS MIME parameters regardless of their order or spacing', () => {
  const feed =
    '<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>All Books</title><link href="/all" type="application/atom+xml; type=feed; profile=&quot;opds-catalog&quot;; kind = acquisition"/></entry></feed>';
  expect(parseOpdsFeed(feed, 'https://books.example.com/opds').navigation).toEqual([
    { title: 'All Books', url: 'https://books.example.com/all', acquisition: true },
  ]);
});

it('stops distinct pagination URLs at the page budget and exposes truncation', async () => {
  let calls = 0;
  const fetcher = vi.fn(async () => {
    calls++;
    return new Response(
      '<feed xmlns="http://www.w3.org/2005/Atom"><title>Books</title><link rel="next" href="?page=' +
        (calls + 1) +
        '"/><entry><id>book-' +
        calls +
        '</id><title>Book</title><link rel="http://opds-spec.org/acquisition" href="/book.epub"/></entry></feed>',
    );
  });
  const result = await loadOpdsPublications('https://books.example.com/opds', {}, fetcher);
  expect(calls).toBe(100);
  expect(result.truncated).toBe(true);
  expect(result.publications).toHaveLength(100);
});

it('aborts a stalled catalog request after its deadline', async () => {
  vi.useFakeTimers();
  try {
    const fetcher = (_input: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('aborted', 'AbortError')),
          { once: true },
        );
      });
    const rejected = expect(
      loadOpdsPublications('https://books.example.com/opds', {}, fetcher),
    ).rejects.toThrow('aborted');
    await vi.advanceTimersByTimeAsync(30000);
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

it('propagates cancellation into the HTTP request', async () => {
  const controller = new AbortController();
  const fetcher = (_input: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener(
        'abort',
        () => reject(new DOMException('cancelled', 'AbortError')),
        { once: true },
      );
    });
  const rejected = expect(
    loadOpdsPublications('https://books.example.com/opds', {}, fetcher, controller.signal),
  ).rejects.toThrow('cancelled');
  controller.abort();
  await rejected;
});
