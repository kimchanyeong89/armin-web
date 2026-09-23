// Gather every logo candidate per museum (official site DOM, Wikimedia Commons, existing repo files),
// normalise each into a monochrome ink mask, score, auto-pick, and write cands.json / picks.json.
//   node assemble.mjs [--only=id,id]
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { normalize } from './normalize.mjs';
import { darkPreview } from './preview.mjs';

const { exhibitions } = await import('/Users/kietzsche/armin-web-main/src/data/exhibitions.js');
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const readJson = (p, d = {}) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : d);
const siteMain = readJson('site/results.json');
const siteExtra = readJson('site-extra/results.json');
const site = { ...siteMain, ...siteExtra };
const siteDir = (id) => (siteExtra[id] ? `site-extra/${id}` : `site/${id}`);
const commons = readJson('commons/results.json');
const existing = readJson('existing/results.json');
const manual = readJson('manual/results.json'); // {id: [{file, note, url}]}
const commonsSearch = readJson('commons-search/results.json'); // extra-search.mjs
const CAND = 'cand';
fs.mkdirSync(CAND, { recursive: true });

const isPlaceholderSvg = (p) => { const t = fs.readFileSync(p, 'utf8'); return /<text[\s>]/.test(t) && /3333|1667|f4f4f5|#F4F4F5/i.test(t); };

// cov = inked share of the trimmed box; mid = share of inked pixels that are half-tone.
// Logos are nearly binary (anti-aliased edges only); photos and gradients are mostly half-tone.
async function maskStats(maskPath) {
  const { data, info } = await sharp(maskPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels, n = info.width * info.height;
  let on = 0, lit = 0, mid = 0;
  for (let p = 0; p < n; p++) {
    const a = data[p * ch + ch - 1];
    if (a > 128) on++;
    if (a > 24) { lit++; if (a < 200) mid++; }
  }
  return { cov: on / n, mid: lit ? mid / lit : 0 };
}

async function evalCandidate(id, n, srcPath, meta) {
  const out = path.join(CAND, id, `${String(n).padStart(2, '0')}.png`);
  const prev = path.join(CAND, id, `${String(n).padStart(2, '0')}-dark.png`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const { base, ...rest } = meta;
  const c = { n, srcPath, ...rest };
  try {
    const r = await normalize(srcPath, out);
    await darkPreview(out, prev);
    const st = await maskStats(out);
    c.mask = out; c.preview = prev; c.mode = r.mode; c.w = r.width; c.h = r.height; c.vector = r.source.svg;
    c.cov = +st.cov.toFixed(3); c.mid = +st.mid.toFixed(3);
    c.aspect = +(r.width / r.height).toFixed(2);
    let s = base;
    if (c.vector) s += 15; else if (Math.max(r.width, r.height) >= 700) s += 8; else if (Math.max(r.width, r.height) < 400) s -= 25;
    if (c.cov > 0.8) s -= 40; else if (c.cov < 0.015) s -= 30;
    if (c.mid > 0.45) s -= 45; else if (c.mid > 0.3) s -= 20;       // photo / gradient
    if (c.aspect < 0.25 || c.aspect > 14) s -= 20;
    const box = meta.box;                                           // on-page [left, top, w, h]
    if (box && box[2] && box[2] < 48 && box[3] < 48) s -= 25;       // menu / social / search icons
    if (meta.source === 'site-shot' && box && box[2] > 700) s -= 40; // section screenshots, not logos
    c.score = s;
  } catch (e) {
    c.error = String(e.message).slice(0, 80); c.score = -999;
  }
  return c;
}

const picks = readJson('picks.json');
const all = readJson('cands.json');
const targets = exhibitions.filter((m) => !only.length || only.includes(m.id));
let done = 0;
async function doMuseum(m) {
  const list = [];
  const s = site[m.id];
  if (s?.saved) {
    for (const e of s.saved) {
      const dir = siteDir(m.id);
      const kindPenalty = e.kind === 'icon' ? -15 : e.kind === 'og' ? -10 : 0;
      const siteScore = Math.max(-10, Math.min(20, e.score));
      if (e.file) list.push([path.join(dir, e.file), { source: 'site', kind: e.kind, base: 30 + siteScore + kindPenalty, url: e.src || s.finalUrl, box: e.box }]);
      if (e.shot) list.push([path.join(dir, e.shot), { source: 'site-shot', kind: e.kind, base: 18 + siteScore, url: s.finalUrl, box: e.box }]);
    }
  }
  for (const c of commons[m.id] || []) if (c.file) list.push([`commons/${m.id}/${c.file}`, { source: 'commons', kind: c.kind, base: 28, url: c.url, license: c.license }]);
  const ex = existing[m.id];
  if (ex?.file) {
    const p = `existing/${m.id}/${ex.file}`;
    if (!(p.endsWith('.svg') && isPlaceholderSvg(p))) list.push([p, { source: 'existing', kind: 'rep', base: 22, url: ex.rep }]);
  }
  for (const c of commonsSearch[m.id] || []) list.push([c.file, { source: 'commons-search', kind: c.note.split(':')[0], base: 34, url: c.url }]);
  for (const c of manual[m.id] || []) list.push([c.file, { source: 'manual', kind: c.note || 'manual', base: 60, url: c.url || '' }]);
  fs.rmSync(path.join(CAND, m.id), { recursive: true, force: true });
  const cands = [];
  for (let i = 0; i < list.length; i++) cands.push(await evalCandidate(m.id, i, list[i][0], list[i][1]));
  all[m.id] = cands;
  const ok = cands.filter((c) => c.score > -999).sort((a, b) => b.score - a.score);
  if (!picks[m.id] || picks[m.id].auto) picks[m.id] = ok[0] ? { n: ok[0].n, auto: true } : null;
  done++;
  if (done % 20 === 0) console.log('assembled', done, '/', targets.length);
}
let idx = 0;
await Promise.all(Array.from({ length: 4 }, async () => { while (idx < targets.length) await doMuseum(targets[idx++]); }));
fs.writeFileSync('cands.json', JSON.stringify(all, null, 1));
fs.writeFileSync('picks.json', JSON.stringify(picks, null, 1));
console.log('museums', Object.keys(all).length, 'with pick', Object.values(picks).filter(Boolean).length);
