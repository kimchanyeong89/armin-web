/**
 * Cloudflare Worker — R2 Image Store
 *
 * Endpoints:
 *   POST /upload          — FormData 파일 업로드
 *   POST /proxy-image     — 외부 URL 서버사이드 fetch → R2 저장 (hotlink bypass)
 *   GET  /image/:key      — R2에서 이미지 서빙
 */

export interface Env {
  R2_BUCKET: R2Bucket;
  R2_PUBLIC_URL: string;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Api-Key',
};

const R2_PUBLIC_BASE = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';

// Content-Type → 확장자
function extFromCT(ct: string): string {
  if (ct.includes('webp')) return 'webp';
  if (ct.includes('png'))  return 'png';
  if (ct.includes('gif'))  return 'gif';
  return 'jpg';
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);

    // ────────────────────────────────────────────────────────────
    // POST /proxy-image
    // Body: { url: string, referer?: string, r2Key: string }
    // → 외부 이미지를 Cloudflare Worker 서버사이드에서 fetch(Referer 포함)
    //   → R2에 저장 → 공개 R2 URL 반환
    // ────────────────────────────────────────────────────────────
    if (request.method === 'POST' && url.pathname === '/proxy-image') {
      try {
        const body = await request.json() as { url: string; referer?: string; r2Key: string };
        if (!body.url || !body.r2Key) {
          return json({ error: 'url and r2Key required' }, 400);
        }

        const srcUrl = new URL(body.url);
        const referer = body.referer || `${srcUrl.protocol}//${srcUrl.hostname}/`;

        // 이미 R2에 있으면 바로 반환
        const existing = await env.R2_BUCKET.head(body.r2Key);
        if (existing) {
          return json({ success: true, url: `${R2_PUBLIC_BASE}/${body.r2Key}`, cached: true });
        }

        // 서버사이드 fetch — Referer 헤더 포함, 미술관 hotlink 차단 우회
        const imgRes = await fetch(body.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; ArminBot/1.0)',
            'Referer': referer,
            'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          },
          redirect: 'follow',
        });

        if (!imgRes.ok) {
          return json({ error: `Source returned ${imgRes.status}`, url: body.url }, 502);
        }

        const ct = imgRes.headers.get('content-type') || 'image/jpeg';
        if (!ct.includes('image') && !ct.includes('octet-stream')) {
          return json({ error: `Non-image content-type: ${ct}`, url: body.url }, 422);
        }

        const buffer = await imgRes.arrayBuffer();
        if (buffer.byteLength < 1024) {
          return json({ error: `Image too small (${buffer.byteLength} bytes)`, url: body.url }, 422);
        }

        await env.R2_BUCKET.put(body.r2Key, buffer, {
          httpMetadata: { contentType: ct.split(';')[0].trim() },
          customMetadata: { sourceUrl: body.url, cachedAt: new Date().toISOString() },
        });

        return json({ success: true, url: `${R2_PUBLIC_BASE}/${body.r2Key}` });

      } catch (err: any) {
        return json({ error: err?.message || 'proxy failed' }, 500);
      }
    }

    // ────────────────────────────────────────────────────────────
    // POST /upload — FormData 파일 직접 업로드
    // ────────────────────────────────────────────────────────────
    if (request.method === 'POST' && url.pathname === '/upload') {
      try {
        const formData = await request.formData();
        const file = formData.get('file') as unknown as File;
        const r2Key = formData.get('r2Key') as string || '';
        const exhibitionId = formData.get('exhibitionId') as string || 'unknown';

        if (!file) return json({ error: 'No file provided' }, 400);

        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (!allowedTypes.includes(file.type)) {
          return json({ error: 'Invalid file type. Use JPEG, PNG, WebP, or GIF' }, 400);
        }

        const arrayBuffer = await file.arrayBuffer();
        const key = r2Key || `exhibitions/covers/${exhibitionId}-${Date.now()}.jpg`;

        await env.R2_BUCKET.put(key, arrayBuffer, {
          httpMetadata: { contentType: file.type },
          customMetadata: { exhibitionId, originalName: file.name, uploadedAt: new Date().toISOString() },
        });

        return json({ success: true, url: `${R2_PUBLIC_BASE}/${key}`, key });

      } catch (err: any) {
        return json({ error: err?.message || 'Upload failed' }, 500);
      }
    }

    // ────────────────────────────────────────────────────────────
    // GET /image/:key — R2에서 이미지 서빙
    // ────────────────────────────────────────────────────────────
    if (request.method === 'GET' && url.pathname.startsWith('/image/')) {
      const key = decodeURIComponent(url.pathname.slice('/image/'.length));
      try {
        const object = await env.R2_BUCKET.get(key);
        if (!object) return new Response('Not found', { status: 404, headers: CORS });

        const headers = new Headers(CORS);
        headers.set('Content-Type', object.httpMetadata?.contentType || 'image/jpeg');
        headers.set('Cache-Control', 'public, max-age=31536000, immutable');
        return new Response(object.body, { headers });
      } catch {
        return new Response('Error', { status: 500, headers: CORS });
      }
    }

    return new Response('Not found', { status: 404, headers: CORS });
  },
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
