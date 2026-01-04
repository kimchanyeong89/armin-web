// Optional external image proxy (e.g., images.weserv.nl) to resize/convert
// Enable by setting VITE_IMAGE_PROXY=weserv
export const useProxy = (import.meta as any).env?.VITE_IMAGE_PROXY === 'weserv';

// Image cache proxy for external museum images
// Enable by setting VITE_IMAGE_CACHE=true (can disable anytime if issues)
// Automatically disabled on localhost (no Pages Functions available locally)
const isLocalhost = typeof window !== 'undefined' && 
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
export const useImageCache = !isLocalhost && (import.meta as any).env?.VITE_IMAGE_CACHE === 'true';

// R2 도메인 (우리 이미지 저장소)
const R2_DOMAINS = ['r2.dev', 'pub-396fad1f96754c2f816f260faf970e63'];

// 외부 이미지인지 확인 (R2가 아닌 경우)
function isExternalImage(url: string): boolean {
  if (!url) return false;
  return !R2_DOMAINS.some(d => url.includes(d));
}

// 외부 이미지를 캐시 프록시로 변환
export function getCachedImageUrl(url: string): string {
  if (!url) return url;
  if (!useImageCache) return url;
  if (!isExternalImage(url)) return url;
  
  // 이미 프록시 URL인 경우 그대로 반환
  if (url.includes('/api/img?')) return url;
  
  return `/api/img?url=${encodeURIComponent(url)}`;
}

function buildTarget(url: string): string | null {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}${u.search || ''}`;
  } catch {
    return null;
  }
}

export function proxyUrl(url: string, width: number, format: 'avif'|'webp'='webp', quality = 75): string | null {
  if (!useProxy) return null;
  const target = buildTarget(url);
  if (!target) return null;
  const params = new URLSearchParams();
  params.set('url', target);
  params.set('w', String(width));
  params.set('output', format);
  params.set('q', String(Math.max(40, Math.min(90, quality))));
  return `https://images.weserv.nl/?${params.toString()}`;
}

export function buildSourceSet(url: string, widths: number[], format: 'avif'|'webp', quality = 75): string | null {
  const parts: string[] = [];
  for (const w of widths) {
    const p = proxyUrl(url, w, format, quality);
    if (!p) return null; // if any fails, bail to no-proxy path
    parts.push(`${p} ${w}w`);
  }
  return parts.join(', ');
}
