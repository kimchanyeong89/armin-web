
// Robust Image Optimization using wsrv.nl (global CDN for resizing/caching)
// This ensures fast loading for search results and galleries.

export function getOptimizedImageUrl(url: string, width: number = 400, quality: number = 80, format: 'avif' | 'webp' = 'webp'): string {
  if (!url) return '';

  // 1. If it's a data URL or blob, return as is
  if (url.startsWith('data:') || url.startsWith('blob:')) return url;

  // 2. Prevent double-proxying
  if (url.includes('wsrv.nl') || url.includes('images.weserv.nl')) return url;

  // 3. Bypass sensitive providers that might block the proxy or fail
  // Also bypass Google images (already CDN, no CORS issues)
  if (url.includes('grandpalaisrmn.fr') || url.includes('navigart.fr') || url.includes('archive.louisiana.dk') || url.includes('lh3.googleusercontent.com') || url.includes('googleusercontent.com')) return url;

  // 4. Ignore relative paths (local/internal images)
  if (url.startsWith('/')) return url;

  // 5. Clean URL
  let targetUrl = url;

  // Special handling for mnk: Downgrade to HTTP for proxy to avoid potential SSL/header issues
  if (targetUrl.includes('cdn-zbiory.mnk.pl')) {
    targetUrl = targetUrl.replace('https://', 'http://');
  }

  try {
    // 6. Construct wsrv.nl URL which handles resizing and format conversion
    const encodedUrl = encodeURIComponent(targetUrl);
    return `https://wsrv.nl/?url=${encodedUrl}&w=${width}&q=${quality}&output=${format}&l=9`;
  } catch (e) {
    console.warn('Failed to construct optimized URL:', e);
    return url;
  }
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
