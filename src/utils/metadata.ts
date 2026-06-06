/**
 * Unified artwork name extractor.
 * Handles all known museum JSON field naming conventions.
 * Falls back gracefully through a comprehensive list of candidate fields.
 */
export function getUnifiedArtworkName(item: any): string {
  if (!item) return 'Untitled';

  // Try all known title field names in priority order
  const raw =
    item.title ??
    item.name ??
    item.itemTitle ??
    item.shortName ??
    item.displayTitle ??
    item.objectName ??
    item.artworkTitle ??
    item.tytul ??    // Polish (Wawel)
    item.titre ??    // French
    item.titelSv ??  // Swedish
    item.titelNo ??  // Norwegian
    item.titelDa ??  // Danish
    item.t ??        // Short-form (some aggregators)
    null;

  if (raw === null || raw === undefined) return 'Untitled';

  // Handle nested object (e.g. { name: 'Mona Lisa' })
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const s = raw.name ?? raw.title ?? raw.value ?? raw.text ?? '';
    return String(s).trim() || 'Untitled';
  }

  // Handle array of strings or objects
  if (Array.isArray(raw)) {
    if (raw.length === 0) return 'Untitled';
    if (typeof raw[0] === 'string') return raw.join(', ').trim() || 'Untitled';
    if (raw[0]?.name) return raw.map((v: any) => v.name).join(', ').trim() || 'Untitled';
    if (raw[0]?.title) return raw.map((v: any) => v.title).join(', ').trim() || 'Untitled';
    return 'Untitled';
  }

  return String(raw).trim() || 'Untitled';
}

/**
 * Unified artwork creator extractor.
 * Handles all known museum JSON field naming conventions.
 * Falls back gracefully through a comprehensive list of candidate fields.
 */
export function getUnifiedArtworkCreator(item: any): string {
  if (!item) return 'Unknown';

  // Try all known artist/creator field names in priority order
  const raw =
    item.artist ??
    item.artistName ??
    item.creator ??
    item.maker ??
    item.author ??
    item.attribution ??
    item.autor ??          // Spanish/Polish
    item.auteur ??         // French
    item.a ??              // Short-form aggregators
    item.authors ??
    item.principalOrFirstMaker ?? // Rijksmuseum
    item.raw?.artist ??
    item.raw?.author ??
    item.raw?.authors ??
    null;

  if (raw === null || raw === undefined) return 'Unknown';

  // Handle nested object
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const s = raw.name ?? raw.title ?? raw.value ?? raw.text ?? '';
    return String(s).trim() || 'Unknown';
  }

  // Handle array of strings or objects
  if (Array.isArray(raw)) {
    if (raw.length === 0) return 'Unknown';
    if (typeof raw[0] === 'string') return raw.join(', ').trim() || 'Unknown';
    if (raw[0]?.name) return raw.map((v: any) => v.name).join(', ').trim() || 'Unknown';
    if (raw[0]?.title) return raw.map((v: any) => v.title).join(', ').trim() || 'Unknown';
    return 'Unknown';
  }

  return String(raw).trim() || 'Unknown';
}
