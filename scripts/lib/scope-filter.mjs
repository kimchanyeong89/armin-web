// 수집 스코프 판정 — COLLECTION_SCRAPING_GUIDE.md §1 스코프 구현.
// 이미지 버퍼 기반이라 R2 업로드 직전에 호출한다(업로드 자체를 막기 위해).

import sharp from 'sharp';

/** 흑백(단색) 판정 임계값. Hasler-Süsstrunk colorfulness < 20 이면 단색으로 본다. */
export const GRAYSCALE_THRESHOLD = 20;

/** 긴 변이 이보다 작으면 저품질로 보고 버린다. */
export const MIN_LONG_EDGE = 400;

/**
 * Hasler-Süsstrunk colorfulness.
 * scripts/audit/curate-grayscale-prints.mjs 와 같은 식이되 R2 키가 아닌 버퍼를 받는다.
 */
export async function colorfulness(buf) {
  const { data } = await sharp(buf, { limitInputPixels: false })
    .resize(80, 80, { fit: 'inside' }).removeAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  const rg = [], yb = [];
  for (let i = 0; i < data.length; i += 3) {
    const R = data[i], G = data[i + 1], B = data[i + 2];
    rg.push(R - G); yb.push(0.5 * (R + G) - B);
  }
  const m = a => a.reduce((s, v) => s + v, 0) / a.length;
  const sd = a => { const mu = m(a); return Math.sqrt(m(a.map(v => (v - mu) ** 2))); };
  return Math.sqrt(sd(rg) ** 2 + sd(yb) ** 2) + 0.3 * Math.sqrt(m(rg) ** 2 + m(yb) ** 2);
}

/**
 * 다운로드한 이미지가 수집 가치가 있는지 판정한다.
 * category 는 canonical enum (painting/drawing/print/photograph/...).
 * 드로잉은 흑백이어도 유지하고, 판화만 단색을 걸러낸다(가이드 §1).
 * @returns {{ ok: boolean, reason?: string, meta: object }}
 */
export async function judgeImage(buf, category) {
  const { width, height } = await sharp(buf, { limitInputPixels: false }).metadata();
  const longEdge = Math.max(width || 0, height || 0);
  if (longEdge < MIN_LONG_EDGE) {
    return { ok: false, reason: `small-image(${longEdge}px)`, meta: { longEdge } };
  }
  if (category === 'print') {
    const c = await colorfulness(buf);
    if (c < GRAYSCALE_THRESHOLD) {
      return { ok: false, reason: `grayscale-print(${c.toFixed(1)})`, meta: { longEdge, colorfulness: c } };
    }
    return { ok: true, meta: { longEdge, colorfulness: c } };
  }
  return { ok: true, meta: { longEdge } };
}

/** 수집 대상 카테고리 (가이드 §1 ✅ 포함). miniature 는 감지용이라 여기 없다. */
export const IN_SCOPE = new Set([
  'painting', 'drawing', 'print', 'photograph', 'video',
  'mixed_media_2d', 'calligraphy', 'manuscript',
]);

/** 1920년 이전 사진은 시각 그리드 가치가 낮아 제외(가이드 §1). 초기사진 전문관은 호출부에서 예외 처리. */
export function isPreModernPhoto(category, year) {
  return category === 'photograph' && Number.isFinite(year) && year < 1920;
}

/**
 * R2 에 올릴 WebP 로 변환한다.
 *
 * ⚠️ 품질을 **축소 여부에 맞춘다.** 4000px 원본을 1600px 로 줄이면 다운샘플링
 *    자체가 노이즈를 걸러내서 q80 으로 충분하다. 그런데 원본이 이미 1600px
 *    이하면 줄일 게 없어서 q80 이 그대로 화질을 깎는다.
 *    후쿠오카(긴변 1200px 고정 파생본)가 이 경우였다 — 140KB JPEG(0.17 B/px)이
 *    41KB WebP(0.05 B/px)가 되어 눈에 띄게 뭉갰다. q92 면 0.12 B/px 로 회복된다.
 */
export async function toWebp(buf) {
  const img = sharp(buf, { limitInputPixels: false });
  const { width = 0, height = 0 } = await img.metadata();
  const downscaling = Math.max(width, height) > 1600;
  return img
    .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: downscaling ? 80 : 92 })
    .toBuffer();
}
