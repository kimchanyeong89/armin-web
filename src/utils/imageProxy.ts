
// Robust Image Optimization using wsrv.nl (global CDN for resizing/caching)
// This ensures fast loading for search results and galleries.

export function normalizeImageUrl(url: string): string {
  if (!url) return '';
  let normalized = url;

  // Fix for 404 errors with Deutsche Digitale Bibliothek IIIF server
  if (normalized.includes('iiif.deutsche-digitale-bibliothek.de')) {
      normalized = normalized.replace(/\/!440,330\//, '/full/');
      normalized = normalized.replace(/\/\d+,\d+\//, '/full/');
  }

  return normalized;
}

export function getWeservUrl(url: string, width: number = 400, quality: number = 80, format?: 'avif' | 'webp'): string {
  if (!url || typeof url !== 'string') return '';
  url = normalizeImageUrl(url);

  // 1. If it's a data URL or blob, return as is
  if (url.startsWith('data:') || url.startsWith('blob:')) return url;

  // 2. Prevent double-proxying
  if (url.includes('wsrv.nl') || url.includes('images.weserv.nl')) return url;

  // 3. Bypass sensitive providers that might block the proxy or fail
  // Also bypass Google images (already CDN, no CORS issues)
  // Also bypass Wikipedia/Wikimedia Commons — they allow direct hotlinking and wsrv.nl often fails for large files
  if (url.includes('grandpalaisrmn.fr') || url.includes('navigart.fr') || url.includes('archive.louisiana.dk') || url.includes('production-static-stedelijk')) return url;
  // Also bypass Wikipedia/Wikimedia Commons — they allow direct hotlinking and wsrv.nl often fails for large files
  if (url.includes('upload.wikimedia.org') || url.includes('wikipedia.org') || url.includes('commons.wikimedia.org')) return url;
  // Also bypass Sir John Soane's Museum CDN — serves correctly via direct URL
  if (url.includes('collections.soane.org')) return url;
  // Bypass SFMOMA cloudfront domains since wsrv.nl often fails or gets blocked
  if (url.includes('d1hhug17qm51in.cloudfront.net') || url.includes('sfmoma.org')) return url;
  // Bypass deutsche-digitale-bibliothek.de (Brücke Museum) - proxy blocked
  if (url.includes('deutsche-digitale-bibliothek.de')) return url;
  // Bypass our own R2 bucket entirely - it's already fast and wsrv.nl often fails or caches 404s
  if (url.includes('r2.dev') || url.includes('pub-396fad1f96754c2f816f260faf970e63')) return url;



  // AIC (artic.edu) uses Cloudflare challenge on hotlinked IIIF images.
  // wsrv.nl is blocked (404) and third-party proxies get rate limited.
  // Solution: route through our own Cloudflare Pages Function: /aic-image/*
  if (url.includes('www.artic.edu/iiif/2/')) {
    // In local dev, we MUST use the proxy as well because direct requests are 403 Forbidden.
    // Vite config has a proxy for /aic-image so this works locally too.
    // if (isLocalDev) return url; // REMOVED
    const base = 'https://www.artic.edu/iiif/2/';
    const rest = url.slice(base.length);
    // Ask IIIF for the desired width directly (smaller thumbnails load much faster)
    const resizedRest = rest.replace(/\/full\/(\d+),\//, `/full/${width},/`);
    // Return direct URL as proxy is blocked locally
    return `https://www.artic.edu/iiif/2/${resizedRest}`;
  }

  // FAMSF (famsf.emuseum.com) blocks requests without correct Referer (403 Forbidden).
  // wsrv.nl is also blocked or flaky.
  // Solution: route through our local proxy /famsf-image/ which adds the Referer header.
  if (url.includes('famsf.emuseum.com')) {
    const base = 'https://famsf.emuseum.com';
    // Handle both cases: url might start with base or not (if it does, strip it)
    // Usually url is passed as full string.
    const path = url.startsWith(base) ? url.slice(base.length) : url;
    // Ensure path starts with /
    const cleanPath = path.startsWith('/') ? path : '/' + path;
    return `/famsf-image${cleanPath}`;
  }


  // 4. Ignore relative paths (local/internal images)
  if (url.startsWith('/')) return url;

  // 5. Clean URL
  let targetUrl = url;

  // Some providers fail on wsrv.nl when the `url=` parameter includes the protocol.
  // Manual verification (2026-01):
  // - Works:  https://wsrv.nl/?url=ssam.seogwipo.go.kr/rest/file/loadThumbnail/331
  // - Fails:  https://wsrv.nl/?url=https://ssam.seogwipo.go.kr/rest/file/loadThumbnail/331  (404)
  // Keep the protocol for most providers, but strip it for known-problematic ones.
  if (
    targetUrl.includes('ssam.seogwipo.go.kr') ||
    targetUrl.includes('seogwipo.go.kr/rest/file/loadThumbnail') ||
    targetUrl.includes('collection.nationalmuseum.se')
  ) {
    targetUrl = targetUrl.replace(/^https?:\/\//, '');
  }

  // Special handling for mnk: Downgrade to HTTP for proxy to avoid potential SSL/header issues
  if (targetUrl.includes('cdn-zbiory.mnk.pl')) {
    targetUrl = targetUrl.replace('https://', 'http://');
  }

  try {
    // 6. Construct wsrv.nl URL which handles resizing and format conversion
    const encodedUrl = encodeURIComponent(targetUrl);
    const outputParam = format ? `&output=${format}` : '';
    return `https://wsrv.nl/?url=${encodedUrl}&w=${width}&q=${quality}${outputParam}&l=9`;
  } catch (e) {
    console.warn('Failed to construct optimized URL:', e);
    return url;
  }
}

export function tuneWeservUrl(url: string, width: number, quality: number = 80, format?: 'avif' | 'webp'): string {
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

export function getOptimizedImageUrl(url: string, width: number = 400, quality: number = 80, format: 'avif' | 'webp' = 'webp'): string {
  return getWeservUrl(url, width, quality, format);
}

// Helper specifically for small search thumbnails (200px width, webp, 75 qual)
export function getSearchThumbnail(url: string): string {
  return getOptimizedImageUrl(url, 200, 75, 'webp');
}

// Helper for Lightbox/Larger views (1200px width, webp, 85 qual)
export function getLightboxImage(url: string): string {
  return getOptimizedImageUrl(url, 1200, 85, 'webp');
}

// Compatibility exports for ExhibitionModal
export const useProxy = false;

export function proxyUrl(url: string, width: number, format: 'avif' | 'webp' = 'webp', quality = 75): string {
  return getOptimizedImageUrl(url, width, quality, format);
}

export function buildSourceSet(url: string, widths: number[], format: 'avif' | 'webp' = 'webp', quality = 75): string {
  const parts: string[] = [];
  for (const w of widths) {
    const p = getOptimizedImageUrl(url, w, quality, format);
    parts.push(`${p} ${w}w`);
  }
  return parts.join(', ');
}
