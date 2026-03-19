const MFAH_BASE = 'https://emuseum.mfah.org/';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Range',
  // Allow embedding in <img> cross-origin
  'Cross-Origin-Resource-Policy': 'cross-origin',
};

function withCors(resp: Response): Response {
  const headers = new Headers(resp.headers);
  for (const [k, v] of Object.entries(corsHeaders)) headers.set(k, v);
  return new Response(resp.body, {
    status: resp.status,
    statusText: resp.statusText,
    headers,
  });
}

export async function onRequest(context: any): Promise<Response> {
  const { request } = context;

  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
  }

  const url = new URL(request.url);

  // Cloudflare Pages Functions provides params based on filename.
  // For [...path].ts, params.path is a string or array; normalize into a path string.
  const raw = context?.params?.path;
  const path = Array.isArray(raw) ? raw.join('/') : String(raw || '').replace(/^\/+/, '');
  if (!path) return new Response('Bad Request', { status: 400, headers: corsHeaders });

  // MFAH paths usually start with internal/media/...
  // We construct full URL
  const upstreamUrl = MFAH_BASE + path;

  // Cache key: include full request URL so different sizes are cached separately.
  const cache = (globalThis as any).caches?.default;
  const cacheKey = new Request(url.toString(), request);

  if (cache) {
    const cached = await cache.match(cacheKey);
    if (cached) return withCors(cached);
  }

  // Try to fetch upstream. We remove Origin/Referer and send a browser UA + Referer.
  const upstreamResp = await fetch(upstreamUrl, {
    method: request.method,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://emuseum.mfah.org/',
      'Origin': 'https://emuseum.mfah.org',
      'Accept': request.headers.get('Accept') || 'image/avif,image/webp,image/*,*/*',
      // Forward Range if present for progressive loading
      ...(request.headers.get('Range') ? { Range: request.headers.get('Range') as string } : {}),
    },
    // Ask Cloudflare to cache aggressively
    cf: {
      cacheEverything: true,
      cacheTtl: 60 * 60 * 24 * 30, // 30 days
    },
  } as any);

  // Clone + normalize headers
  const headers = new Headers(upstreamResp.headers);
  // Make it cacheable on the client/CDN side.
  if (upstreamResp.ok) {
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  } else {
    // Avoid caching Cloudflare challenge HTML as an image
    headers.set('Cache-Control', 'no-store');
  }

  const out = withCors(
    new Response(upstreamResp.body, {
      status: upstreamResp.status,
      statusText: upstreamResp.statusText,
      headers,
    })
  );

  if (cache && upstreamResp.ok) {
    // Cache the response for subsequent requests
    await cache.put(cacheKey, out.clone());
  }

  return out;
}
