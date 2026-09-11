/**
 * images.mjs — 전시 포스터를 R2 에 보관하고 공개 URL 을 돌려준다.
 *
 * 왜 R2 를 거치는가:
 *   미술관 CDN 이미지는 Referer 차단·CORS·링크 소멸 때문에 브라우저에서 자주 깨진다.
 *   (EXHIBITION_UPDATE_GUIDE.md 의 필수 규칙)
 *
 * 기본 경로는 Cloudflare Worker 의 /proxy-image 엔드포인트다.
 * 워커가 서버사이드에서 Referer 를 붙여 내려받아 R2 에 넣어주므로
 * CI 에 R2 자격증명을 둘 필요가 없다.
 */

import { createHash } from 'node:crypto';
import { postJson, request } from './http.mjs';

export const R2_PUBLIC_BASE = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
export const WORKER_BASE =
  process.env.ARMIN_R2_WORKER || 'https://armin-r2-upload.armin-art.workers.dev';

const COVER_PREFIX = 'exhibitions/covers';

/** 확장자를 소스 URL 에서 추론한다 (쿼리스트링 제거). */
function extFromUrl(url) {
  const clean = String(url).split('?')[0].split('#')[0];
  const m = /\.(jpe?g|png|webp|gif|avif)$/i.exec(clean);
  if (!m) return 'jpg';
  const e = m[1].toLowerCase();
  return e === 'jpeg' ? 'jpg' : e;
}

/**
 * R2 키를 만든다.
 * 소스 URL 해시를 붙여, 미술관이 포스터를 교체하면 새 키가 되도록 한다
 * (워커는 같은 키가 있으면 캐시본을 돌려주므로 해시가 없으면 갱신이 안 된다).
 */
export function coverKey(exhibitionId, srcUrl) {
  const hash = createHash('sha1').update(String(srcUrl)).digest('hex').slice(0, 8);
  const safeId = String(exhibitionId)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return `${COVER_PREFIX}/${safeId}-${hash}.${extFromUrl(srcUrl)}`;
}

/** 이미 R2 에 올라가 있는지 HEAD 로 확인한다. */
export async function existsOnR2(r2Key) {
  try {
    const res = await request(`${R2_PUBLIC_BASE}/${r2Key}`, {
      method: 'HEAD',
      retries: 1,
      timeout: 10000,
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * 포스터 한 장을 R2 에 확보한다.
 * @returns {Promise<{url:string, cached:boolean}>}
 * @throws 업로드에 실패하면 throw (호출측에서 기존 이미지를 유지하도록)
 */
export async function ensurePoster(srcUrl, { exhibitionId, referer, dryRun = false } = {}) {
  if (!srcUrl) throw new Error('포스터 원본 URL 없음');
  const r2Key = coverKey(exhibitionId, srcUrl);
  const publicUrl = `${R2_PUBLIC_BASE}/${r2Key}`;

  if (dryRun) return { url: publicUrl, cached: false, dryRun: true };

  if (await existsOnR2(r2Key)) return { url: publicUrl, cached: true };

  const { ok, status, data } = await postJson(
    `${WORKER_BASE}/proxy-image`,
    { url: srcUrl, referer, r2Key },
    { timeout: 45000, retries: 2 }
  );

  if (!ok || !data?.success) {
    throw new Error(`R2 업로드 실패 (HTTP ${status}): ${data?.error || '알 수 없는 오류'}`);
  }
  return { url: data.url || publicUrl, cached: Boolean(data.cached) };
}

/**
 * 이미 R2/유효한 이미지를 가리키는 URL 인지 판별한다.
 * exhibitions.js 의 기존 coverImage 를 유지할지 판단할 때 쓴다.
 */
export function isR2Url(url) {
  return typeof url === 'string' && url.startsWith(R2_PUBLIC_BASE);
}
