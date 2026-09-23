// Turn any logo file (svg/png/jpg/webp/gif) into a monochrome ink mask: black ink + alpha, trimmed.
//   node normalize.mjs <in> <out.png> [--bg=#rrggbb]   (bg forces background colour for opaque art)
// Rules
//   transparent art  → ink = alpha, but when the art mixes white "paper" with darker ink (white text
//                      knocked out of a coloured box, black text on a white plate) white counts as paper.
//   opaque / plated  → background = median border colour, ink = colour distance from that background.
import fs from 'fs';
import sharp from 'sharp';

export async function normalize(inPath, outPath, opts = {}) {
  const TARGET = opts.target || 1600;
  let input = fs.readFileSync(inPath);
  const isSvg = /\.svg$/i.test(inPath) || /^\s*(<\?xml|<svg|<!DOCTYPE svg)/i.test(input.slice(0, 200).toString());
  let img;
  if (isSvg) {
    const meta = await sharp(input, { density: 72 }).metadata();
    const w0 = Math.max(meta.width || 100, 1), h0 = Math.max(meta.height || 100, 1);
    const scale = Math.min(TARGET / w0, TARGET / h0);
    const density = Math.max(18, Math.min(72 * scale, 4000));
    img = sharp(input, { density, limitInputPixels: false });
  } else {
    img = sharp(input, { limitInputPixels: false, animated: false });
  }
  let { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  // cap working size
  if (Math.max(info.width, info.height) > 2400) {
    ({ data, info } = await sharp(data, { raw: info }).resize(2400, 2400, { fit: 'inside' }).raw().toBuffer({ resolveWithObject: true }));
  }
  const { width: W, height: H } = info;
  const N = W * H;
  const lumOf = (i) => (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
  const satOf = (i) => { const mx = Math.max(data[i], data[i + 1], data[i + 2]), mn = Math.min(data[i], data[i + 1], data[i + 2]); return mx === 0 ? 0 : (mx - mn) / mx; };

  let transparent = 0, x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let p = 0; p < N; p++) {
    if (data[p * 4 + 3] < 26) transparent++;
    else { const x = p % W, y = (p / W) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) throw new Error('empty image');
  const bboxArea = (x1 - x0 + 1) * (y1 - y0 + 1);
  let opaqueInBox = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (data[(y * W + x) * 4 + 3] >= 200) opaqueInBox++;
  const plated = opaqueInBox / bboxArea > 0.92;
  const hasAlpha = transparent / N > 0.03;

  const alpha = new Uint8Array(N);
  let mode;
  if (hasAlpha && !plated && !opts.bg) {
    let opaque = 0, paper = 0;
    for (let p = 0; p < N; p++) { const i = p * 4; if (data[i + 3] > 128) { opaque++; if (lumOf(i) > 0.86 && satOf(i) < 0.12) paper++; } }
    const paperFrac = paper / Math.max(opaque, 1);
    if (paperFrac > 0.08 && paperFrac < 0.6) {
      mode = `alpha-knockout(${paperFrac.toFixed(2)})`;
      for (let p = 0; p < N; p++) {
        const i = p * 4, a = data[i + 3] / 255, l = lumOf(i), s = satOf(i);
        const paperness = s < 0.12 ? Math.min(1, Math.max(0, (l - 0.62) / (0.9 - 0.62))) : 0;
        alpha[p] = Math.round(255 * a * (1 - paperness));
      }
    } else {
      mode = `alpha(${paperFrac.toFixed(2)})`;
      for (let p = 0; p < N; p++) alpha[p] = data[p * 4 + 3];
    }
  } else {
    // background colour from the border (or the plate's border when plated)
    let bg;
    if (opts.bg) { const h = opts.bg.replace('#', ''); bg = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
    else {
      const rs = [], gs = [], bs = [];
      const bx0 = plated ? x0 : 0, by0 = plated ? y0 : 0, bx1 = plated ? x1 : W - 1, by1 = plated ? y1 : H - 1;
      const push = (x, y) => { const i = (y * W + x) * 4; if (data[i + 3] > 128) { rs.push(data[i]); gs.push(data[i + 1]); bs.push(data[i + 2]); } };
      for (let x = bx0; x <= bx1; x++) { push(x, by0); push(x, by1); }
      for (let y = by0; y <= by1; y++) { push(bx0, y); push(bx1, y); }
      const med = (a) => a.sort((m, n) => m - n)[a.length >> 1] ?? 255;
      bg = [med(rs), med(gs), med(bs)];
    }
    mode = `bg(${bg.join(',')})${plated ? '-plate' : ''}`;
    for (let p = 0; p < N; p++) {
      const i = p * 4, a = data[i + 3] / 255;
      const d = Math.sqrt((data[i] - bg[0]) ** 2 + (data[i + 1] - bg[1]) ** 2 + (data[i + 2] - bg[2]) ** 2) / 441.7;
      const ink = Math.min(1, Math.max(0, (d - 0.07) / (0.4 - 0.07)));
      alpha[p] = Math.round(255 * a * ink);
    }
  }
  // assemble black ink + alpha, trim, pad
  const rgba = Buffer.alloc(N * 4);
  let inkPixels = 0;
  for (let p = 0; p < N; p++) { rgba[p * 4 + 3] = alpha[p]; if (alpha[p] > 128) inkPixels++; }
  if (inkPixels < 50) throw new Error(`no ink (${mode})`);
  let out = sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).trim({ threshold: 1 });
  const trimmed = await out.png().toBuffer({ resolveWithObject: true });
  let buf = trimmed.data;
  const tw = trimmed.info.width, th = trimmed.info.height;
  if (Math.max(tw, th) > TARGET) buf = await sharp(buf).resize(TARGET, TARGET, { fit: 'inside' }).png().toBuffer();
  const fin = await sharp(buf).png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true });
  fs.writeFileSync(outPath, fin.data);
  return { mode, width: fin.info.width, height: fin.info.height, bytes: fin.data.length, source: { w: W, h: H, svg: isSvg }, inkRatio: +(inkPixels / N).toFixed(3) };
}

if (process.argv[1] && process.argv[1].endsWith('normalize.mjs') && process.argv[2]) {
  const bg = (process.argv.find((a) => a.startsWith('--bg=')) || '').slice(5) || undefined;
  normalize(process.argv[2], process.argv[3], { bg }).then((r) => console.log(JSON.stringify(r))).catch((e) => { console.error('ERR', e.message); process.exit(1); });
}
