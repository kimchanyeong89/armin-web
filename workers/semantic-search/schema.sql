-- D1 schema for keyword text search.
-- Apply once after `wrangler d1 create armin-text-search`:
--   npx wrangler d1 execute armin-text-search --file=./schema.sql

CREATE TABLE IF NOT EXISTS artworks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  artist TEXT NOT NULL DEFAULT '',
  museum TEXT NOT NULL DEFAULT '',
  exhibition_id TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT ''
);

-- FTS5 full-text index over the searchable columns.
-- `unicode61 remove_diacritics 2` lets queries like "cezanne" match "Cézanne".
-- `porter` stems English plurals so "paintings" hits "painting".
-- `content='artworks'` keeps storage external so we don't duplicate the table.
CREATE VIRTUAL TABLE IF NOT EXISTS artworks_fts USING fts5(
  name, artist, museum,
  tokenize = "porter unicode61 remove_diacritics 2",
  content = 'artworks',
  content_rowid = 'rowid'
);

-- Triggers keep the FTS index in sync with the base table.
CREATE TRIGGER IF NOT EXISTS artworks_ai AFTER INSERT ON artworks BEGIN
  INSERT INTO artworks_fts(rowid, name, artist, museum)
  VALUES (new.rowid, new.name, new.artist, new.museum);
END;

CREATE TRIGGER IF NOT EXISTS artworks_ad AFTER DELETE ON artworks BEGIN
  INSERT INTO artworks_fts(artworks_fts, rowid, name, artist, museum)
  VALUES ('delete', old.rowid, old.name, old.artist, old.museum);
END;

CREATE TRIGGER IF NOT EXISTS artworks_au AFTER UPDATE ON artworks BEGIN
  INSERT INTO artworks_fts(artworks_fts, rowid, name, artist, museum)
  VALUES ('delete', old.rowid, old.name, old.artist, old.museum);
  INSERT INTO artworks_fts(rowid, name, artist, museum)
  VALUES (new.rowid, new.name, new.artist, new.museum);
END;

-- Helpful indexes for ORDER BY rank and for narrowed queries.
CREATE INDEX IF NOT EXISTS artworks_artist_idx ON artworks(artist);
CREATE INDEX IF NOT EXISTS artworks_museum_idx ON artworks(museum);
