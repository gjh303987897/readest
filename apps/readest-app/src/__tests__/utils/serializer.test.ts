import { describe, expect, it } from 'vitest';
import {
  BOOK_CONFIG_SCHEMA_VERSION,
  BookConfig,
  BookSearchConfig,
  ViewSettings,
} from '@/types/book';
import { deserializeConfig, serializeConfig, serializeRawConfig } from '@/utils/serializer';

const globalViewSettings = {
  zoomLevel: 100,
  scrolled: false,
} as ViewSettings;

const defaultSearchConfig = {
  scope: 'book',
  matchCase: false,
  matchWholeWords: false,
  matchDiacritics: false,
} as BookSearchConfig;

describe('BookConfig serialization', () => {
  it('writes schemaVersion to settings-aware config JSON using camelCase', () => {
    const config: BookConfig = {
      updatedAt: 123,
      viewSettings: { zoomLevel: 120 },
      searchConfig: { query: 'alice' },
    };

    const serialized = serializeConfig(config, globalViewSettings, defaultSearchConfig);
    const parsed = JSON.parse(serialized);

    expect(parsed.schemaVersion).toBe(BOOK_CONFIG_SCHEMA_VERSION);
    expect(parsed.schema_version).toBeUndefined();
    expect(parsed.viewSettings).toEqual({ zoomLevel: 120 });
    expect(parsed.searchConfig).toEqual({ query: 'alice' });
  });

  it('round-trips bookmarks in per-book config JSON', () => {
    const config: BookConfig = {
      updatedAt: 123,
      bookmarks: [
        {
          id: 'bookmark-1',
          location: 'epubcfi(/6/8!/4/2)',
          title: 'Opening scene',
          sectionLabel: 'Chapter 1',
          page: 3,
          fraction: 0.03,
          createdAt: 100,
          updatedAt: 100,
        },
      ],
    };

    const serialized = serializeConfig(config, globalViewSettings, defaultSearchConfig);
    const restored = deserializeConfig(serialized, globalViewSettings, defaultSearchConfig);

    expect(restored.bookmarks).toEqual(config.bookmarks);
    expect(restored.schemaVersion).toBe(BOOK_CONFIG_SCHEMA_VERSION);
  });

  it('writes schemaVersion to raw config JSON without mutating the caller object', () => {
    const config: Partial<BookConfig> = {
      updatedAt: 456,
      progress: [10, 100],
      location: 'epubcfi(/6/8!/4/2)',
    };

    const serialized = serializeRawConfig(config);
    const parsed = JSON.parse(serialized);

    expect(parsed.schemaVersion).toBe(BOOK_CONFIG_SCHEMA_VERSION);
    expect(parsed.progress).toEqual([10, 100]);
    expect(config.schemaVersion).toBeUndefined();
  });

  it('hydrates legacy config JSON without schemaVersion', () => {
    const config = deserializeConfig(
      JSON.stringify({
        updatedAt: 789,
        location: 'epubcfi(/6/10!/4/2)',
        viewSettings: { zoomLevel: 90 },
        searchConfig: { query: 'rabbit' },
      }),
      globalViewSettings,
      defaultSearchConfig,
    );

    expect(config.schemaVersion).toBe(BOOK_CONFIG_SCHEMA_VERSION);
    expect(config.location).toBe('epubcfi(/6/10!/4/2)');
    expect(config.viewSettings?.zoomLevel).toBe(90);
    expect(config.searchConfig?.query).toBe('rabbit');
  });

  it('migrates v2 search config: matchWholeWords:true -> mode "whole-words"', () => {
    const config = deserializeConfig(
      JSON.stringify({ schemaVersion: 2, searchConfig: { matchWholeWords: true } }),
      globalViewSettings,
      defaultSearchConfig,
    );
    const sc = config.searchConfig as BookSearchConfig;
    expect(sc.mode).toBe('whole-words');
    expect(sc.matchWholeWords).toBe(true);
    expect(sc.nearbyWords).toBe(10);
  });

  it('migrates v2 search config: matchWholeWords:false -> mode "contains"', () => {
    const config = deserializeConfig(
      JSON.stringify({ schemaVersion: 2, searchConfig: { matchWholeWords: false } }),
      globalViewSettings,
      defaultSearchConfig,
    );
    const sc = config.searchConfig as BookSearchConfig;
    expect(sc.mode).toBe('contains');
    expect(sc.matchWholeWords).toBe(false);
  });

  it('preserves an explicit mode and mirrors the deprecated boolean', () => {
    const config = deserializeConfig(
      JSON.stringify({ schemaVersion: 3, searchConfig: { mode: 'regex' } }),
      globalViewSettings,
      defaultSearchConfig,
    );
    const sc = config.searchConfig as BookSearchConfig;
    expect(sc.mode).toBe('regex');
    expect(sc.matchWholeWords).toBe(false);
  });
});
