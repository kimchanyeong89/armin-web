/**
 * Cloudflare Workers Image Cache Proxy
 * 
 * 외부 이미지를 캐싱하여 원본 사이트 변경에 영향받지 않게 함
 * 캐시 기간: 1년 (원본이 사라져도 캐시에서 제공)
 */

export interface Env {
  // Cloudflare Cache API는 자동으로 사용 가능
}

const CACHE_TTL = 60 * 60 * 24 * 365; // 1년
const ALLOWED_ORIGINS = [
  'https://armin.gallery',
  'https://www.armin.gallery',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:4173',
];

// 허용된 외부 도메인 (미술관 사이트들)
const ALLOWED_DOMAINS = [
  'nationalgallery.org.uk',
  'galleriaaccademiafirenze.it',
  'uffizi.it',
  'musee-jacquemart-andre.com',
  'parismuseescollections.paris.fr',
  'api.collection.cooperhewitt.org',
  'images.collection.cooperhewitt.org',
  'api.si.edu',
  'ids.si.edu',
  'collectionapi.metmuseum.org',
  'images.metmuseum.org',
  'lh3.googleusercontent.com',
  'upload.wikimedia.org',
  'www.britishmuseum.org',
  'media.britishmuseum.org',
  'www.rijksmuseum.nl',
  'louvre.fr',
  'rmngp.fr',
  'musee-orsay.fr',
  'centrepompidou.fr',
  'tate.org.uk',
  'collections.vam.ac.uk',
  'museum.wales',
  'dulwichpicturegallery.org.uk',
  'courtauld.ac.uk',
  'hayward.gallery',
  'guggenheim-venice.it',
  'galleriaborghese.beniculturali.it',
  'museivaticani.va',
  'chateauversailles.fr',
];

function isAllowedDomain(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_DOMAINS.some(d => parsed.hostname.includes(d));
  } catch {
    return false;
  }
}

function getCorsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get('Origin') || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: getCorsHeaders(request) });
    }

    // Health check
    if (url.pathname === '/health') {
      return new Response('OK', { status: 200 });
    }

    // 이미지 URL 파라미터 가져오기
    const imageUrl = url.searchParams.get('url');
    
    if (!imageUrl) {
      return new Response('Missing ?url= parameter', { 
        status: 400,
        headers: getCorsHeaders(request)
      });
    }

    // 도메인 검증
    if (!isAllowedDomain(imageUrl)) {
      return new Response('Domain not allowed', { 
        status: 403,
        headers: getCorsHeaders(request)
      });
    }

    // Cache API 사용
    const cache = caches.default;
    const cacheKey = new Request(url.toString(), request);

    // 캐시에서 먼저 찾기
    let response = await cache.match(cacheKey);
    
    if (response) {
      // 캐시 히트 - CORS 헤더 추가해서 반환
      const newHeaders = new Headers(response.headers);
      Object.entries(getCorsHeaders(request)).forEach(([k, v]) => newHeaders.set(k, v));
      newHeaders.set('X-Cache', 'HIT');
      
      return new Response(response.body, {
        status: response.status,
        headers: newHeaders,
      });
    }

    // 캐시 미스 - 원본에서 가져오기
    try {
      const fetchResponse = await fetch(imageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'image/*,*/*;q=0.8',
          'Referer': new URL(imageUrl).origin + '/',
        },
      });

      if (!fetchResponse.ok) {
        return new Response(`Failed to fetch image: ${fetchResponse.status}`, {
          status: fetchResponse.status,
          headers: getCorsHeaders(request),
        });
      }

      // 응답 헤더 구성
      const contentType = fetchResponse.headers.get('Content-Type') || 'image/jpeg';
      const responseHeaders = new Headers({
        'Content-Type': contentType,
        'Cache-Control': `public, max-age=${CACHE_TTL}, immutable`,
        'X-Cache': 'MISS',
        ...getCorsHeaders(request),
      });

      // 새 응답 생성
      response = new Response(fetchResponse.body, {
        status: 200,
        headers: responseHeaders,
      });

      // 캐시에 저장 (비동기로)
      ctx.waitUntil(cache.put(cacheKey, response.clone()));

      return response;
    } catch (error) {
      return new Response(`Error fetching image: ${error}`, {
        status: 500,
        headers: getCorsHeaders(request),
      });
    }
  },
};
