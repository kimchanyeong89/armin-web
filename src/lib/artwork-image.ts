// Shared image-URL picker used by both the Node-side collection indexer
// (scripts/weekly/collection-index.ts) and browser-side overlays
// (MuseumOverlay). Different collection JSONs use different field names —
// imageUrl (AIC-style), image (SMK/Hirschsprung/Aros/etc.), img, src.

export interface MaybeArtwork {
  imageUrl?: string;
  image?: string;
  img?: string;
  src?: string;
}

export function pickImageUrl(r: MaybeArtwork): string | undefined {
  return r.imageUrl || r.image || r.img || r.src;
}
