import { MigrationEntry, SchemaType } from '../migrate';

const migrations: Record<SchemaType, MigrationEntry[]> = {
  'library-search': [
    {
      name: '2026080101_library_search_sections',
      sql: `
        CREATE TABLE IF NOT EXISTS search_meta (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          updated_at INTEGER NOT NULL,
          version INTEGER NOT NULL,
          total_sections INTEGER NOT NULL,
          complete INTEGER NOT NULL DEFAULT 0,
          nav_hash TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS search_sections (
          idx INTEGER PRIMARY KEY,
          label TEXT NOT NULL DEFAULT '',
          text TEXT NOT NULL,
          folded TEXT
        );

        CREATE TABLE IF NOT EXISTS search_nodes (
          node_id INTEGER PRIMARY KEY,
          parent_id INTEGER,
          ord INTEGER NOT NULL,
          depth INTEGER NOT NULL,
          label TEXT NOT NULL DEFAULT '',
          section_start INTEGER NOT NULL,
          section_end INTEGER NOT NULL
        );
      `,
    },
  ],
};

export function getMigrations(schema: SchemaType): MigrationEntry[] {
  return migrations[schema];
}
