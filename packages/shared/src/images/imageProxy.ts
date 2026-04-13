export function normalizeImageUrl(url: string): string {
  if (!url) return '';
  let normalized = url.trim();

  if (normalized === 'default.jpg' || normalized === '/default.jpg') {
    return '';
  }

  if (/iiif\.deutsche-digitale-bibliothek\.de\/image\/2\/[^/]+\/full\/(?:full|!\d+,\d+|max)\/0\/default\.jpg/i.test(normalized)) {
    return '';
  }

  if (normalized.includes('iiif.deutsche-digitale-bibliothek.de')) {
    normalized = normalized.replace(/\/!440,330\//, '/full/');
    normalized = normalized.replace(/\/\d+,\d+\//, '/full/');
  }

  return normalized;
}

export function getWeservUrl(
  url: string,
  width: number = 400,
  quality: number = 80,
  format?: 'avif' | 'webp'
): string {
  if (!url || typeof url !== 'string') return '';
  url = normalizeImageUrl(url);
  if (!url) return '';

  if (url.startsWith('data:') || url.startsWith('blob:')) return url;
  if (url.includes('wsrv.nl') || url.includes('images.weserv.nl')) return url;

  if (
    url.includes('grandpalaisrmn.fr') ||
    url.includes('navigart.fr') ||
    url.includes('archive.louisiana.dk') ||
    url.includes('production-static-stedelijk')
  ) {
    return url;
  }

  if (
    url.includes('upload.wikimedia.org') ||
    url.includes('wikipedia.org') ||
    url.includes('commons.wikimedia.org')
  ) {
    return url;
  }

  if (url.includes('collections.soane.org')) return url;

  if (
    url.includes('d1hhug17qm51in.cloudfront.net') ||
    url.includes('sfmoma.org')
  ) {
    return url;
  }

  if (url.includes('deutsche-digitale-bibliothek.de')) return url;

  if (
    url.includes('r2.dev') ||
    url.includes('pub-396fad1f96754c2f816f260faf970e63')
  ) {
    return url;
  }

  if (url.includes('www.artic.edu/iiif/2/')) {
    const base = 'https://www.artic.edu/iiif/2/';
    const rest = url.slice(base.length);
    const resizedRest = rest.replace(/\/full\/(\d+),\//, `/full/${width},/`);
    return `https://www.artic.edu/iiif/2/${resizedRest}`;
  }

  if (url.includes('famsf.emuseum.com')) {
    const base = 'https://famsf.emuseum.com';
    const path = url.startsWith(base) ? url.slice(base.length) : url;
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `/famsf-image${cleanPath}`;
  }

  if (url.startsWith('/')) return url;

  let targetUrl = url;

  if (
    targetUrl.includes('ssam.seogwipo.go.kr') ||
    targetUrl.includes('seogwipo.go.kr/rest/file/loadThumbnail') ||
    targetUrl.includes('collection.nationalmuseum.se')
  ) {
    targetUrl = targetUrl.replace(/^https?:\/\//, '');
  }

  if (targetUrl.includes('cdn-zbiory.mnk.pl')) {
    targetUrl = targetUrl.replace('https://', 'http://');
  }

  try {
    const encodedUrl = encodeURIComponent(targetUrl);
    const outputParam = format ? `&output=${format}` : '';
    return `https://wsrv.nl/?url=${encodedUrl}&w=${width}&q=${quality}${outputParam}&l=9`;
  } catch {
    return url;
  }
}

export function tuneWeservUrl(
  url: string,
  width: number,
  quality: number = 80,
  format?: 'avif' | 'webp'
): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    if (u.hostname !== 'wsrv.nl' && u.hostname !== 'images.weserv.nl') return url;
    u.searchParams.set('w', String(width));
    u.searchParams.set('q', String(quality));
    u.searchParams.set('l', '9');
    if (format) u.searchParams.set('output', format);
    else u.searchParams.delete('output');
    return u.toString();
  } catch {
    return url;
  }
}

export function getOptimizedImageUrl(
  url: string,
  width: number = 400,
  quality: number = 80,
  format: 'avif' | 'webp' = 'webp'
): string {
  return getWeservUrl(url, width, quality, format);
}

export function getSearchThumbnail(url: string): string {
  return getOptimizedImageUrl(url, 200, 75, 'webp');
}

export function getLightboxImage(url: string): string {
  return getOptimizedImageUrl(url, 1200, 85, 'webp');
}

export const useProxy = false;

export function proxyUrl(
  url: string,
  width: number,
  format: 'avif' | 'webp' = 'webp',
  quality = 75
): string {
  return getOptimizedImageUrl(url, width, quality, format);
}

export function buildSourceSet(
  url: string,
  widths: number[],
  format: 'avif' | 'webp' = 'webp',
  quality = 75
): string {
  const parts: string[] = [];
  for (const w of widths) {
    const p = getOptimizedImageUrl(url, w, quality, format);
    parts.push(`${p} ${w}w`);
  }
  return parts.join(', ');
}
