import { worksByArtist, type IndexedWork } from '../collection-index';

export async function buildDialogueLens(
  artistA: string,
  artistB: string,
  opts: { perArtist?: number } = {},
): Promise<IndexedWork[]> {
  const n = opts.perArtist ?? 5;
  const a = (await worksByArtist(artistA)).slice(0, n);
  const b = (await worksByArtist(artistB)).slice(0, n);
  const out: IndexedWork[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i]) out.push(a[i]);
    if (b[i]) out.push(b[i]);
  }
  return out;
}
