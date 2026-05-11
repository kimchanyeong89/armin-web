import { matchByText } from '../embedding/match';
import { buildIndex, type IndexedWork } from '../collection-index';

export async function buildThematicLens(
  theme: string,
  opts: { count?: number; maxPerArtist?: number } = {},
): Promise<IndexedWork[]> {
  const count = opts.count ?? 10;
  const maxPerArtist = opts.maxPerArtist ?? 3;
  const idx = await buildIndex();
  const matches = await matchByText(theme, { topK: count * 4 });
  const byRef = new Map(idx.all.map((w) => [w.artwork_ref, w]));
  const picked: IndexedWork[] = [];
  const perArtist = new Map<string, number>();
  for (const m of matches) {
    const w = byRef.get(m.artwork_ref);
    if (!w) continue;
    const c = perArtist.get(w.artist) ?? 0;
    if (c >= maxPerArtist) continue;
    picked.push(w);
    perArtist.set(w.artist, c + 1);
    if (picked.length >= count) break;
  }
  return picked;
}
