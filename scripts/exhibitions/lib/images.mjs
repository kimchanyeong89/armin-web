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
import { getBuffer, postJson, request } from './http.mjs';
import { isUiImageUrl } from './parse.mjs';

export const R2_PUBLIC_BASE = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
export const WORKER_BASE =
  process.env.ARMIN_R2_WORKER || 'https://armin-r2-upload.armin-art.workers.dev';

const COVER_PREFIX = 'exhibitions/covers';

// ── 포스터 품질 검사 ────────────────────────────────────────────
// 올리기 전에 실제 이미지를 내려받아 본다. URL 만 믿으면 버튼 아이콘(49×49)이나
// 기관 로고(203×64)가 포스터 자리에 들어간다.

/**
 * 이미지 헤더에서 형식과 크기를 읽는다 (PNG·JPEG·GIF·WebP).
 * @returns {{format:string, width:number, height:number}|null}
 */
export function imageSize(buf) {
  if (!buf || buf.length < 30) return null;
  if (buf.readUInt32BE(0) === 0x89504e47) {
    return { format: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.toString('ascii', 0, 3) === 'GIF') {
    return { format: 'gif', width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buf.toString('ascii', 12, 16);
    if (chunk === 'VP8X') {
      return { format: 'webp', width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    }
    if (chunk === 'VP8 ') {
      return { format: 'webp', width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    }
    if (chunk === 'VP8L') {
      const bits = buf.readUInt32LE(21);
      return { format: 'webp', width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
    }
    return null;
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    // JPEG: 크기가 담긴 SOF 마커가 나올 때까지 세그먼트를 건너뛴다
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1];
      if (marker === 0xff) {
        i++;
        continue;
      }
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { format: 'jpeg', width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
      }
      // 길이 필드가 없는 마커 (SOI·EOI·RST)
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
        i += 2;
        continue;
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

/**
 * 포스터로 쓸 수 없는 이미지면 이유를, 쓸 만하면 '' 를 돌려준다.
 * 기준: 짧은 변 150px·면적 6만px 이상, 가로세로비 1:3 ~ 2.4:1, 파일 5KB 이상,
 * 픽셀당 0.02바이트 이상 (한 가지 색으로 칠한 자리표시 이미지는 압축하면 이보다 훨씬 작다).
 * 한가람 목록 썸네일(235×300)이나 DDP 사진(283×448) 같은 실제 이미지는 통과한다.
 */
export function posterProblem(meta) {
  if (!meta) return '이미지가 아님';
  const { width, height, bytes = Infinity } = meta;
  if (Math.min(width, height) < 150 || width * height < 60000) return `너무 작음 ${width}×${height}`;
  const ratio = width / height;
  if (ratio > 2.4 || ratio < 1 / 3) return `로고·배너 비율 ${width}×${height}`;
  if (bytes < 5000) return `파일이 너무 작음 ${bytes}B`;
  // MMCA 예정 전시의 1080×1920 단색 이미지는 11KB(0.005B/px), 실제 포스터는 가장 단순한 것도 0.039B/px 였다
  if (bytes / (width * height) < 0.02) return `단색에 가까운 이미지 ${width}×${height} ${Math.round(bytes / 1024)}KB`;
  return '';
}

/**
 * 포스터 후보 URL 을 내려받아 검사한다.
 * 통과하면 내용 해시를 함께 돌려준다 (여러 전시가 같은 이미지를 쓰는지 가려내는 데 쓴다).
 * @returns {Promise<{ok:true, hash:string, width:number, height:number}|{ok:false, reason:string}>}
 */
export async function checkPoster(url, { referer } = {}) {
  if (!url) return { ok: false, reason: 'URL 없음' };
  if (isUiImageUrl(url)) return { ok: false, reason: '버튼·아이콘·로고 이미지' };
  let buf;
  try {
    buf = await getBuffer(url, { referer, retries: 1 });
  } catch (err) {
    return { ok: false, reason: `다운로드 실패 (${err.message})` };
  }
  const size = imageSize(buf);
  const reason = posterProblem(size && { ...size, bytes: buf.length });
  if (reason) return { ok: false, reason };
  return {
    ok: true,
    hash: createHash('sha1').update(buf).digest('hex'),
    width: size.width,
    height: size.height,
    format: size.format,
    bytes: buf, // 워커가 원본을 받지 못할 때 이 바이트를 그대로 올린다
  };
}

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

const IMAGE_MIME = { jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };

/** 검사를 마친 이미지 바이트를 워커의 /upload 로 직접 올린다. */
async function uploadBytes(r2Key, bytes, mime, exhibitionId) {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mime }), r2Key.split('/').pop());
  form.append('r2Key', r2Key);
  form.append('exhibitionId', String(exhibitionId));
  const res = await request(`${WORKER_BASE}/upload`, {
    method: 'POST',
    body: form,
    accept: 'application/json',
    timeout: 60000,
    retries: 1,
  });
  let data = null;
  try {
    data = JSON.parse(res.text);
  } catch {
    /* 아래에서 실패로 처리 */
  }
  if (!res.ok || !data?.success) {
    throw new Error(`R2 직접 업로드 실패 (HTTP ${res.status}): ${data?.error || '알 수 없는 오류'}`);
  }
}

/**
 * 포스터 한 장을 R2 에 확보한다.
 * bytes/format 은 checkPoster 가 내려받아 검사한 이미지다. 워커가 원본을 받지 못할 때 대신 올린다.
 * @returns {Promise<{url:string, cached:boolean}>}
 * @throws 업로드에 실패하면 throw (호출측에서 기존 이미지를 유지하도록)
 */
export async function ensurePoster(srcUrl, { exhibitionId, referer, dryRun = false, bytes, format } = {}) {
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
    // Content-Type 을 비워 보내는 서버(서울시립미술관 imgFileView: ";charset=UTF-8")는
    // 워커가 이미지로 보지 않아 422 를 준다. 이미 검사한 바이트가 있으면 그대로 올린다.
    if (bytes && IMAGE_MIME[format]) {
      await uploadBytes(r2Key, bytes, IMAGE_MIME[format], exhibitionId);
      return { url: publicUrl, cached: false };
    }
    throw new Error(`R2 업로드 실패 (HTTP ${status}): ${data?.error || '알 수 없는 오류'}`);
  }

  // 워커가 배포 시점에 따라 다른 공개 호스트를 돌려줄 수 있다
  // (wrangler.toml 의 R2_PUBLIC_URL 과 코드의 상수가 다르다).
  // 키는 우리가 정하므로 canonical URL 이 접근 가능하면 그것을 쓰고,
  // 아니면 워커가 준 URL 을 그대로 쓴다.
  const returned = typeof data.url === 'string' ? data.url : '';
  if (await existsOnR2(r2Key)) {
    return { url: publicUrl, cached: Boolean(data.cached) };
  }
  if (returned) {
    return { url: returned, cached: Boolean(data.cached), host: new URL(returned).host };
  }
  return { url: publicUrl, cached: Boolean(data.cached) };
}

/**
 * 이미 R2/유효한 이미지를 가리키는 URL 인지 판별한다.
 * exhibitions.js 의 기존 coverImage 를 유지할지 판단할 때 쓴다.
 */
export function isR2Url(url) {
  if (typeof url !== 'string' || !url) return false;
  if (url.startsWith(R2_PUBLIC_BASE)) return true;
  // 같은 버킷을 가리키는 다른 r2.dev 공개 호스트도 허용한다.
  // 여기서 막으면 업로드는 성공했는데 coverImage 가 비어 앱에서 전시가 사라진다.
  try {
    const { protocol, host } = new URL(url);
    return protocol === 'https:' && /(^|\.)r2\.dev$/.test(host);
  } catch {
    return false;
  }
}
