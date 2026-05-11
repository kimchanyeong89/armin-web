import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface IndexedWork {
  artwork_ref: string;          // `${collection}#${id}`
  source_collection: string;
  artist: string;
  title: string;
  year: string;
  image_url: string;
  source_url: string;
  lqip?: string;
  category?: string;
  medium?: string;
}

interface RawWork {
  id?: string | number;
  title?: string;
  artist?: string;
  date?: string;
  imageUrl?: string;
  sourceUrl?: string;
  category?: string;
  medium?: string;
  thumbnail?: { lqip?: string };
}

interface Index {
  byArtist: Map<string, IndexedWork[]>;
  all: IndexedWork[];
  artistCount: number;
  workCount: number;
}

let cache: Index | null = null;
const DATA_DIR = join(process.cwd(), 'public', 'data');

function normalizeArtist(raw: string): string {
  // Strip nationality/dates in parentheses e.g. "Walter Shirlaw (American, 1838–1909)"
  return raw.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

export async function buildIndex(): Promise<Index> {
  if (cache) return cache;
  const files = await readdir(DATA_DIR);
  const byArtist = new Map<string, IndexedWork[]>();
  const all: IndexedWork[] = [];
  for (const f of files) {
    if (!f.endsWith('-collection.json') && !f.endsWith('-paintings.json') && !f.endsWith('-prints.json')) continue;
    const collection = f.replace(/\.json$/, '');
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(join(DATA_DIR, f), 'utf-8'));
    } catch {
      continue;
    }
    const rows: RawWork[] = Array.isArray(parsed) ? parsed as RawWork[] : [];
    for (const r of rows) {
      if (!r.imageUrl || !r.artist) continue;
      const artist = normalizeArtist(r.artist);
      const work: IndexedWork = {
        artwork_ref: `${collection}#${r.id ?? ''}`,
        source_collection: collection,
        artist,
        title: r.title ?? '(untitled)',
        year: r.date ?? '',
        image_url: r.imageUrl,
        source_url: r.sourceUrl ?? '',
        lqip: r.thumbnail?.lqip,
        category: r.category,
        medium: r.medium,
      };
      all.push(work);
      const list = byArtist.get(artist) ?? [];
      list.push(work);
      byArtist.set(artist, list);
    }
  }
  cache = { byArtist, all, artistCount: byArtist.size, workCount: all.length };
  return cache;
}

export async function worksByArtist(name: string): Promise<IndexedWork[]> {
  const idx = await buildIndex();
  return idx.byArtist.get(normalizeArtist(name)) ?? [];
}
