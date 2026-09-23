-- D1 schema for the search stats database (armin-search-stats, binding STATS).
-- Kept apart from armin-text-search: that one is the full-text index of a
-- million artworks and sits at its size limit; this one only counts searches.
--   npx wrangler d1 execute armin-search-stats --remote --file=./schema-stats.sql

-- What people search for, counted by day (Korea time), for the "trending now"
-- board on the search page. `key` is the search normalised (lower-case, one
-- space between words) so "Van Gogh" and "van gogh" are one line; `term` is
-- how it was last typed, which is how the board shows it.
CREATE TABLE IF NOT EXISTS search_hits (
  key TEXT NOT NULL,
  day TEXT NOT NULL,
  term TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, day)
);
CREATE INDEX IF NOT EXISTS search_hits_day_idx ON search_hits(day);
