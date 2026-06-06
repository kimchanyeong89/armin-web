// Content-aware autocrop for museum images.
// Removes uniform STUDIO BACKGROUND (grey/black photo backdrop) and below-artwork
// colour-calibration charts, while preserving the artwork (incl. its frame/paper).
//
// Safety: only crops when the 4 corners are a uniform backdrop (low stddev) AND the
// resulting shrink is in a sane band. A white-paper drawing whose margin IS the artwork
// has non-uniform corners or out-of-band shrink → left untouched.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sharp = require('sharp');

// Estimate bbox of the artwork by profiling rows/cols that differ from the backdrop.
// Returns null when the image should NOT be cropped (no clear backdrop / unsafe).
export async function detectArtworkBBox(input, {
  downW = 500,
  pxTh = 22,        // grayscale delta from bg to count a pixel as "content"
  lineFrac = 0.04,  // fraction of a row/col that must be content to be "on"
  pad = 0.012,      // padding around bbox (fraction)
  interCornerStdMax = 22, // max stddev BETWEEN the 4 corner means; above = full-bleed art, don't bg-crop
  bgBrightMax = 218,// if backdrop is near-white, it's likely paper margin (= artwork) → don't crop
  minShrink = 0.05, // below this, treat as no-op (already tight)
  maxShrink = 0.62, // above this, refuse (suspected over-crop)
} = {}) {
  const meta = await sharp(input).metadata();
  const { data, info } = await sharp(input)
    .resize(downW, null, { fit: 'inside' }).removeAlpha().grayscale()
    .raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;

  // Per-corner means. bg-crop ONLY when all 4 corners are a similar uniform colour
  // (studio backdrop). If corners differ (e.g. a painting with sky in one corner and a
  // building in another), the artwork reaches the edges → do NOT bg-crop (avoids cutting sky).
  const cs = Math.max(3, Math.floor(w * 0.03));
  const cornerMean = (oy, ox) => { let s = 0, n = 0; for (let y = 0; y < cs; y++) for (let x = 0; x < cs; x++) { s += data[(oy + y) * w + (ox + x)]; n++; } return s / n; };
  const corners = [cornerMean(0, 0), cornerMean(0, w - cs), cornerMean(h - cs, 0), cornerMean(h - cs, w - cs)];
  const cmean = corners.reduce((a, b) => a + b, 0) / 4;
  const interStd = Math.sqrt(corners.reduce((a, b) => a + (b - cmean) ** 2, 0) / 4);
  if (interStd > interCornerStdMax) return null; // corners differ → full-bleed artwork; don't bg-crop
  const bg = Math.round(cmean);
  if (bg > bgBrightMax) return null; // white/paper backdrop → margin is part of the work; don't crop

  const diff = (i) => Math.abs(data[i] - bg) > pxTh;
  const rowC = new Array(h).fill(0), colC = new Array(w).fill(0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (diff(y * w + x)) { rowC[y]++; colC[x]++; }

  // largest contiguous run of "on" lines (drops a colour-chart separated by a bg gap)
  const run = (arr, len) => {
    let best = [0, arr.length - 1], bs = -1, s = -1;
    for (let i = 0; i < arr.length; i++) {
      const on = arr[i] / len > lineFrac;
      if (on && s < 0) s = i;
      if ((!on || i === arr.length - 1) && s >= 0) { const e = on ? i : i - 1; if (e - s > bs) { bs = e - s; best = [s, e]; } s = -1; }
    }
    return best;
  };
  const [y0, y1] = run(rowC, w), [x0, x1] = run(colC, h);
  if (y1 <= y0 || x1 <= x0) return null;

  const sx = meta.width / w, sy = meta.height / h;
  const px = Math.round((x1 - x0) * sx * pad), py = Math.round((y1 - y0) * sy * pad);
  const L = Math.max(0, Math.round(x0 * sx) - px), T = Math.max(0, Math.round(y0 * sy) - py);
  const R = Math.min(meta.width, Math.round((x1 + 1) * sx) + px), B = Math.min(meta.height, Math.round((y1 + 1) * sy) + py);
  const cw = R - L, ch = B - T;

  const shrink = 1 - (cw * ch) / (meta.width * meta.height);
  if (shrink < minShrink) return { crop: null, shrink, bg };      // already tight
  if (shrink > maxShrink) return { crop: null, shrink, bg, refused: true }; // suspicious

  return { crop: { left: L, top: T, width: cw, height: ch }, shrink, bg,
           origW: meta.width, origH: meta.height };
}

// Trim WHITE scan margins (top/bottom/left/right). Uses "row/col is ≥whiteFrac white"
// rather than sharp.trim(), so a stray "© Museum" caption (a few dark pixels in an otherwise
// white band) does NOT block the trim. A wide white margin (>maxFrac) is left alone (paper).
async function trimWhiteBorder(input, { whiteVal = 236, whiteFrac = 0.88, maxFrac = 0.25 } = {}) {
  const meta = await sharp(input).metadata();
  const { data, info } = await sharp(input).resize(600, null, { fit: 'inside' }).removeAlpha().grayscale().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;
  const rowWhite = (y) => { let c = 0; for (let x = 0; x < w; x++) if (data[y * w + x] > whiteVal) c++; return c / w; };
  const colWhite = (x) => { let c = 0; for (let y = 0; y < h; y++) if (data[y * w + x] > whiteVal) c++; return c / h; };
  let top = 0, bot = h - 1, left = 0, right = w - 1;
  while (top < bot && rowWhite(top) > whiteFrac) top++;
  while (bot > top && rowWhite(bot) > whiteFrac) bot--;
  while (left < right && colWhite(left) > whiteFrac) left++;
  while (right > left && colWhite(right) > whiteFrac) right--;
  if (top === 0 && bot === h - 1 && left === 0 && right === w - 1) return { buf: input, frac: 0 };
  const sx = meta.width / w, sy = meta.height / h;
  const L = Math.round(left * sx), T = Math.round(top * sy);
  const R = Math.min(meta.width, Math.round((right + 1) * sx)), B = Math.min(meta.height, Math.round((bot + 1) * sy));
  const cw = R - L, ch = B - T;
  const frac = 1 - (cw * ch) / (meta.width * meta.height);
  if (frac > 0.003 && frac < maxFrac) {
    const buf = await sharp(input, { limitInputPixels: false }).extract({ left: L, top: T, width: cw, height: ch }).toBuffer();
    return { buf, frac };
  }
  return { buf: input, frac: 0 };
}

// Returns { buffer, cropped:bool, shrink, reason }. Always re-encodes to webp (2048/q85).
// Decision is made on the ORIGINAL image (white-trim must not alter the corner test):
//   - studio backdrop / matte (uniform corners) → bg-crop the artwork bbox (includes any border)
//   - otherwise (full-bleed painting, sky, paper) → only trim a thin white scan border
const out2048 = (pipe) => pipe.resize(2048, 2048, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
// White-band trim ONLY. Removes white scan margins / "© Museum" caption bands on every edge
// while NEVER touching the artwork itself (bg-crop is intentionally disabled — it risked
// cropping a painting's sky. Studio backdrops / colour-charts were already removed in an
// earlier pass, and detectArtworkBBox remains exported for opt-in use).
// White-trim is OPT-IN (off by default). Per user policy: few museums actually ship
// white-margin scans, and an automatic trim risks shaving a legitimately light edge of
// the artwork. Default = pure webp re-encode (NO crop). Enable trimming only on demand —
//   opts.trim === true  OR  env AUTOCROP_TRIM=1 — e.g. when the user spots a white band on
// a specific museum and asks for it.
export async function autocropToWebp(input, opts = {}) {
  const doTrim = opts.trim ?? (process.env.AUTOCROP_TRIM === '1');
  if (!doTrim) {
    const buffer = await out2048(sharp(input, { limitInputPixels: false }));
    return { buffer, cropped: false, shrink: 0, reason: 'no-autocrop (opt-in: AUTOCROP_TRIM=1)' };
  }
  const wt = await trimWhiteBorder(input, opts);
  const buffer = await out2048(sharp(wt.buf, { limitInputPixels: false }));
  return { buffer, cropped: wt.frac > 0, shrink: wt.frac, reason: wt.frac > 0 ? `white-trim ${Math.round(wt.frac * 100)}%` : 'no-op' };
}
