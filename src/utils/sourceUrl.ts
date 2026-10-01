/**
 * An artwork's own museum page, for works saved without it (likes made
 * outside the map did not keep the address). The museum's collection file
 * has it: the files are read only when the link is pressed, once each.
 */
const files = new Map<string, Promise<any[]>>();

function readCollection(file: string): Promise<any[]> {
  const url = /^https?:\/\//.test(file) ? file : `/data/${file.replace(/^\/+/, "")}`;
  if (!files.has(url)) {
    files.set(url, fetch(url)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => (Array.isArray(data) ? data : data?.artworks || data?.items || data?.collection || data?.works || []))
      .catch(() => []));
  }
  return files.get(url)!;
}

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

/** The page address, or "" when the work cannot be found in its museum's files. */
export async function findSourceUrl(
  artwork: { id?: unknown; artworkId?: unknown; title?: unknown; artist?: unknown; exhibitionId?: unknown },
  museum: { permanentExhibitions?: { id?: string; collectionFile?: string }[] } | null | undefined,
): Promise<string> {
  const collections = (museum?.permanentExhibitions || []).filter((p) => p.collectionFile);
  /* the exhibition the work was saved from first, when it is known */
  collections.sort((a, b) => Number(b.id === artwork.exhibitionId) - Number(a.id === artwork.exhibitionId));
  const ids = [artwork.artworkId, artwork.id].map(norm).filter(Boolean);
  const title = norm(artwork.title), artist = norm(artwork.artist);
  for (const c of collections) {
    const items = await readCollection(c.collectionFile!);
    const hit = items.find((item) => {
      const id = norm(item?.id);
      /* a saved id is often the file's id with the museum's prefix in front ("vam-painting-O97898") */
      if (id && ids.some((saved) => saved === id || saved.endsWith(`-${id}`) || saved.endsWith(`_${id}`))) return true;
      return !!title && norm(item?.title) === title && (!artist || norm(item?.artist) === artist);
    });
    const url = hit && (hit.sourceUrl || hit.url || hit.detailUrl || hit.objectURL || hit.link);
    if (url && /^https?:\/\//.test(String(url))) return String(url);
  }
  return "";
}
