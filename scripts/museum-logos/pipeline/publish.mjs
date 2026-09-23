// Publish reviewed picks into the app:
//   public/images/museum-logos/<id>.png   monochrome ink mask (black + alpha, palette PNG)
//   src/data/museumLogos.json             { id: { src, w, h } }  — museums absent here get the text logo
//   scripts/museum-logos/sources.json     provenance (where each mask came from)
//   scripts/museum-logos/originals/<id>.* untouched source file, so colour can be restored later
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { normalize } from './normalize.mjs';

const REPO = '/Users/kietzsche/armin-web-main';
const { exhibitions } = await import(`${REPO}/src/data/exhibitions.js`);
const cands = JSON.parse(fs.readFileSync('cands.json', 'utf8'));
const picks = JSON.parse(fs.readFileSync('picks.json', 'utf8'));
const OUT_IMG = `${REPO}/public/images/museum-logos`;
const OUT_ORIG = `${REPO}/scripts/museum-logos/originals`;
fs.mkdirSync(OUT_IMG, { recursive: true });
fs.mkdirSync(OUT_ORIG, { recursive: true });

// Publish-time clean-up (cand/ masks stay untouched):
//  - faint masks (thin light type captured from screenshots) get their ink stretched to full strength
//  - small, bold raster logos are upscaled smoothly and re-edged, so they can be drawn larger and still read crisp
// Dark ink on a light badge inside a transparent file (e.g. Brücke-Museum): the alpha rule fills the badge
// solid, so take ink from luminance instead. Chosen per museum in decisions.json (mode: "lum").
async function lumMask(srcPath) {
  const { data, info } = await sharp(srcPath, { density: 300 }).flatten({ background: '#ffffff' }).raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(info.width * info.height * 4);
  for (let p = 0; p < info.width * info.height; p++) {
    const i = p * info.channels, l = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    out[p * 4 + 3] = Math.round(255 * Math.min(1, Math.max(0, (0.85 - l) / 0.6)));
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).trim({ threshold: 1 }).png().toBuffer();
}

async function refineMask(c) {
  const { data, info } = await sharp(c.mask).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: ch } = info;
  let buf = new Uint8Array(W * H);
  const hist = new Uint32Array(256);
  let lit = 0;
  for (let p = 0; p < W * H; p++) { const a = data[p * ch + ch - 1]; buf[p] = a; if (a > 24) { hist[a]++; lit++; } }
  let p95 = 255;
  for (let v = 0, acc = 0; v < 256; v++) { acc += hist[v]; if (acc >= lit * 0.95) { p95 = v; break; } }
  if (lit && p95 > 40 && p95 < 230) { const k = 255 / p95; buf = buf.map((a) => Math.min(255, Math.round(a * k))); }
  let w = W, h = H;
  if (!c.vector && Math.max(W, H) < 900 && (c.mid ?? 1) < 0.2) {
    const f = Math.min(4, Math.ceil(1400 / Math.max(W, H)));
    // extractChannel keeps the output single-channel: sharp otherwise hands back 3-channel sRGB after resize,
    // and reading that as one channel scrambles the mask into offset strips.
    const up = await sharp(Buffer.from(buf), { raw: { width: W, height: H, channels: 1 } }).resize(W * f, H * f, { kernel: 'lanczos3' }).extractChannel(0).raw().toBuffer();
    if (up.length !== W * f * H * f) throw new Error(`upscale produced ${up.length} bytes for ${W * f}x${H * f}`);
    buf = new Uint8Array(up.length);
    for (let i = 0; i < up.length; i++) buf[i] = Math.round(255 * Math.min(1, Math.max(0, (up[i] / 255 - 0.38) / 0.24)));
    w = W * f; h = H * f;
  }
  const rgba = Buffer.alloc(w * h * 4);
  for (let p = 0; p < w * h; p++) rgba[p * 4 + 3] = buf[p];
  return sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

const manifest = {};
const sources = {};
for (const m of exhibitions) {
  const p = picks[m.id];
  if (!p || p.n == null) continue;
  const c = (cands[m.id] || []).find((x) => x.n === p.n);
  if (!c?.mask) { console.log('SKIP no mask', m.id); continue; }
  const out = path.join(OUT_IMG, `${m.id}.png`);
  let mask = c.mask;
  if (p.mode === 'lum') mask = await lumMask(c.srcPath);
  if (p.mode === 'bg-white') { // multicolour art whose alpha rule collapses into a blob: judge ink against white
    const tmp = path.join('cand', m.id, 'bg-white.png');
    await normalize(c.srcPath, tmp, { bg: '#ffffff' });
    mask = tmp;
  }
  const info = await sharp(await refineMask({ ...c, mask })).png({ compressionLevel: 9, palette: true, colours: 64 }).toFile(out);
  manifest[m.id] = { src: `/images/museum-logos/${m.id}.png`, w: info.width, h: info.height };
  const ext = path.extname(c.srcPath) || '.bin';
  fs.copyFileSync(c.srcPath, path.join(OUT_ORIG, `${m.id}${ext}`));
  sources[m.id] = { source: c.source, kind: c.kind, url: c.url || '', license: c.license || '', vector: !!c.vector, original: `originals/${m.id}${ext}`, reviewed: !p.auto };
}
// drop files for museums that no longer have a pick
for (const f of fs.readdirSync(OUT_IMG)) if (!manifest[f.replace(/\.png$/, '')]) fs.rmSync(path.join(OUT_IMG, f));
for (const f of fs.readdirSync(OUT_ORIG)) if (!sources[f.replace(/\.[^.]+$/, '')]) fs.rmSync(path.join(OUT_ORIG, f));

const sorted = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
fs.writeFileSync(`${REPO}/src/data/museumLogos.json`, JSON.stringify(sorted(manifest), null, 1) + '\n');
fs.writeFileSync(`${REPO}/scripts/museum-logos/sources.json`, JSON.stringify(sorted(sources), null, 1) + '\n');
const bytes = fs.readdirSync(OUT_IMG).reduce((s, f) => s + fs.statSync(path.join(OUT_IMG, f)).size, 0);
console.log('published', Object.keys(manifest).length, 'logos,', (bytes / 1e6).toFixed(1), 'MB; text-logo museums:', exhibitions.length - Object.keys(manifest).length);
