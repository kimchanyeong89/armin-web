// Optional external image proxy (e.g., images.weserv.nl) to resize/convert
// Enable by setting VITE_IMAGE_PROXY=weserv
export const useProxy = (import.meta as any).env?.VITE_IMAGE_PROXY === 'weserv';

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
