import { worksByArtist, type IndexedWork } from '../collection-index';

function parseYear(raw: string): number {
  const m = raw.match(/-?\d{4}/);
  return m ? parseInt(m[0], 10) : 0;
}

export async function buildBiographicalLens(
  artist: string,
  opts: { count?: number } = {},
): Promise<IndexedWork[]> {
  const count = opts.count ?? 10;
  const all = await worksByArtist(artist);
  if (all.length === 0) return [];
  // Sort by year, then bucket into early/mid/late and take a balanced sample.
  const sorted = [...all].sort((a, b) => parseYear(a.year) - parseYear(b.year));
  if (sorted.length <= count) return sorted;
  const bucketSize = Math.floor(sorted.length / count);
  const picked: IndexedWork[] = [];
  for (let i = 0; i < count; i++) {
    picked.push(sorted[Math.min(i * bucketSize, sorted.length - 1)]);
  }
  return picked;
}
