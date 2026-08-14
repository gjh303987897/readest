import { describe, expect, it, vi } from 'vitest';

import {
  downloadOpdsPublication,
  loadOpdsPublications,
  parseOpdsFeed,
  type OpdsPublication,
} from '@/services/opdsService';

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
      'https://books.example.com/opds/search',
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
