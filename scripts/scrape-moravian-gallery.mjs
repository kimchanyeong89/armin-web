#!/usr/bin/env node
// Moravská galerie v Brně (Brno) — collection scraper.
// Source: museum's OWN open JSON API (webumenia-platform Laravel backend behind the
//   Nuxt frontend at https://sbirky.moravska-galerie.cz):
//   GET https://admin.sbirky-umeni.cz/api/v1/items?filter[gallery]=Moravská galerie, MG
//       &filter[has_image]=true&filter[date_earliest][gte]=..&filter[date_earliest][lt]=..
//       &sort[date_earliest]=asc&size=500&page=N
// Images: https://admin.sbirky-umeni.cz/dielo/nahlad/{sourceId}/800  (800px long side; max size)
// Item page: https://sbirky.moravska-galerie.cz/items/{sourceId}
//
// CONSTRAINT (verified): Elasticsearch window — from+size must stay ≤ 10,000 per filtered
//   result set (HTTP 500 beyond). Workaround: bisect date_earliest into slices ≤ SLICE_MAX,
//   which covers ALL dated items (34,316 of 46,493 imaged MG items). Null-dated items sort
//   LAST on every sort, so they are reachable only inside filtered subsets whose TOTAL ≤
//   window — we additionally harvest small work_type/technique/medium subsets to recover
//   most null-dated in-scope works (--full only).
//
// SCOPE: flat works only, classified by MG inventory-series prefix in the source id
//   (CZE:MG.<PREFIX>_n) + work_type/technique overrides:
//   A,Z = paintings | B,SDK = drawings | C,MM = prints | GD,ARN = graphic design dept
//   (Brno Graphic Design Biennale posters & applied graphics) | GDR = ex libris etc. |
//   JV = Jiří Valoch collection (works on paper / visual poetry).
//   OUT: U (applied arts 3D), E (sculpture), ST/BF (library books), everything unknown.
// CATEGORY NOTE: graphic-design dept (GD/ARN, incl. all posters) → category "poster";
//   GDR → "print"; JV → technique-led (print/drawing, else mixed_media_2d).
// Colorfulness gate (<20 skip) applies ONLY to category "print" — posters/drawings/
//   paintings are never colour-gated (per COLLECTION_SCRAPING_GUIDE).
// CAP: in-scope ≈ 30k+ > 25k JSON budget → keep ALL paintings/drawings/prints/JV, then
//   fill remaining budget with posters ranked by the museum's own view_count (popularity).
//
// Usage:
//   node scripts/scrape-moravian-gallery.mjs --probe   # ~15 works end-to-end (R2 uploads)
//   node scripts/scrape-moravian-gallery.mjs --full    # full harvest, resumable

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { autocropToWebp } from './lib/autocrop.mjs';

const require = createRequire(import.meta.url);
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const sharp = require('sharp');
const REPO = path.resolve(fileURLToPath(import.meta.url), '../..');
require('dotenv').config({ path: path.join(REPO, '.env.local') });

const SLUG = 'moravian-gallery';
const STEM = `${SLUG}-collection`;
const API = 'https://admin.sbirky-umeni.cz/api/v1/items';
const FRONTEND = 'https://sbirky.moravska-galerie.cz';
const IMG = (srcId, w = 800) => `https://admin.sbirky-umeni.cz/dielo/nahlad/${srcId}/${w}`;
const UA = 'armin-museum-research/1.0';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const PROGRESS = path.join(STATE_DIR, `${SLUG}-progress.json`);
const ITEMS_CACHE = path.join(STATE_DIR, `${SLUG}-items.ndjson`);
const UPLOADED = path.join(STATE_DIR, `${SLUG}-uploaded.ndjson`);
const FAILED = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);

const GALLERY = 'Moravská galerie, MG';
const SLICE_MAX = 9000;       // keep from+size well under the 10k ES window
const PAGE_SIZE = 500;        // verified working
const CAP = 25000;            // JSON < 24MB budget
const API_GAP_MS = 280;       // ~3.5 rps
const IMG_CONC = 3;           // ~3 rps with per-task gap

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : args.includes('--probe') ? 'probe' : null;
if (!MODE) { console.log('usage: node scripts/scrape-moravian-gallery.mjs --probe | --full'); process.exit(1); }

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ---------- API layer ----------
async function apiGet(params, retries = 4) {
  const qs = new URLSearchParams(params).toString();
  const url = `${API}?${qs}`;
  for (let att = 1; ; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (att > retries) throw new Error(`${e.message} @ ${url}`);
      await sleep(900 * att);
    }
  }
}
const baseFilters = { 'filter[gallery]': GALLERY, 'filter[has_image]': 'true' };
async function countFor(extra) {
  const d = await apiGet({ ...baseFilters, ...extra, size: 1 });
  await sleep(API_GAP_MS);
  return d.total ?? 0;
}

// ---------- harvest: date-bisected slices + small null-recovery subsets ----------
async function buildDatedSlices(lo = -600, hi = 2035) {
  const out = [];
  const stack = [[lo, hi]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const n = await countFor({ 'filter[date_earliest][gte]': String(a), 'filter[date_earliest][lt]': String(b) });
    if (n === 0) continue;
    if (n <= SLICE_MAX || b - a <= 1) { out.push({ a, b, n }); continue; }
    const mid = Math.floor((a + b) / 2);
    stack.push([a, mid], [mid, b]);
  }
  out.sort((x, y) => x.a - y.a);
  return out;
}

async function fetchSubset(extra, label, sink, maxItems = Infinity) {
  let page = 1, got = 0;
  for (;;) {
    const d = await apiGet({ ...baseFilters, ...extra, size: PAGE_SIZE, page, 'sort[date_earliest]': 'asc' });
    await sleep(API_GAP_MS);
    const rows = d.data || [];
    for (const it of rows) sink(it.content);
    got += rows.length;
    if (rows.length < PAGE_SIZE || got >= maxItems || page * PAGE_SIZE >= SLICE_MAX + PAGE_SIZE) break;
    page++;
  }
  console.log(`  [harvest] ${label}: ${got}`);
  return got;
}

// null-date recovery axes (--full): every subset whose TOTAL ≤ SLICE_MAX is fully
// reachable (nulls sort last but stay inside the window). Values observed on MG data.
const RECOVERY = [
  ...['kresba', 'grafika', 'grafický dizajn'].map((v) => ({ 'filter[work_type]': v })),
  ...['olej', 'tempera', 'akvarel', 'gvaš', 'pastel', 'tuš', 'ceruzka', 'uhoľ', 'kombinovaná technika',
    'litografia', 'lept', 'rytina', 'medirytina', 'oceľoryt', 'drevorez', 'drevoryt', 'linoryt',
    'suchá ihla', 'akvatinta', 'mezzotinta', 'serigrafia', 'sieťotlač', 'ofset', 'knihtlač', 'kameňotlač']
    .map((v) => ({ 'filter[technique]': v })),
  ...['plátno', 'kartón', 'papier ručný', 'pergamen'].map((v) => ({ 'filter[medium]': v })),
];

// ---------- classification (prefix + overrides) ----------
const DEPT_CAT = {
  A: 'painting', Z: 'painting',
  B: 'drawing', SDK: 'drawing',
  C: 'print', MM: 'print', GDR: 'print',
  GD: 'poster', ARN: 'poster',
  JV: 'jv', // technique-led below
};
const WT_CAT = [
  [/maliarstvo|maľba|malba/i, 'painting'],
  [/kresba/i, 'drawing'],
  [/grafický dizajn/i, 'poster'],
  [/grafika/i, 'print'],
  [/fotografi/i, 'photograph'],
];
const TECH_3D = /porcelán|keramik|sklo\b|bronz|sadra|mramor|kameň|kamen\b|kov\b|železo|cín|mosadz|striebro|zlato\b|textíli|drevo (sústružené|vyrezávané)|nábytok/i;
const PRINT_TECH = /litografi|lept|rytin|drevorez|drevoryt|linoryt|suchá ihla|akvatint|mezzotint|serigrafi|sieťotlač|ofset|knihtlač|kameňotlač|oceľoryt|medirytin/i;
const DRAW_TECH = /tuš|ceruzk|uhoľ|akvarel|pastel|gvaš|kried|pero\b/i;

function classify(ct) {
  const m = /^CZE:MG\.([A-Za-z]+)[_]/.exec(ct.id || '');
  const dept = m ? m[1].toUpperCase() : null;
  const wt = (ct.work_type || []).join(' ');
  const tech = (ct.technique || []).join(' ');
  const medium = (ct.medium || []).join(' ');
  if (TECH_3D.test(tech) || TECH_3D.test(medium)) return null;
  if (/miniatur/i.test(wt) && /slonov|email|smalt/i.test(medium)) return null; // portrait-locket miniatures
  let cat = dept ? DEPT_CAT[dept] : undefined;
  if (!cat) { // unknown dept → only work_type can rescue
    for (const [re, c] of WT_CAT) if (re.test(wt)) return { category: c, dept: dept || '?' };
    return null;
  }
  if (cat === 'jv') {
    cat = PRINT_TECH.test(tech) ? 'print' : DRAW_TECH.test(tech) ? 'drawing' : 'mixed_media_2d';
  }
  for (const [re, c] of WT_CAT) if (re.test(wt)) { cat = c; break; } // explicit work_type wins
  return { category: cat, dept };
}

// ---------- field extraction ----------
const BAD_ARTIST = /^(neznám|anonym|nezji|neurč)/i;
function artistOf(ct) {
  const names = (ct.authors || [])
    .map((a) => (a.name_formatted || a.name || '').replace(/\s+/g, ' ').trim())
    .filter((n) => n && !BAD_ARTIST.test(n));
  return names.join('; ');
}
function yearOf(ct) {
  if (Number.isInteger(ct.date_earliest)) return ct.date_earliest;
  const s = String(ct.dating || '');
  const y4 = /(\d{4})/.exec(s);
  if (y4) return parseInt(y4[1], 10);
  const cent = /(\d{1,2})\.\s*stol/.exec(s);
  if (cent) {
    const base = (parseInt(cent[1], 10) - 1) * 100;
    const dec = /(\d)0\.\s*l[eé]t/.exec(s);
    return base + (dec ? parseInt(dec[1], 10) * 10 : 50);
  }
  return null;
}
function toArtwork(ct, cls) {
  const title = String(ct.title || '').replace(/\s+/g, ' ').trim();
  const artist = artistOf(ct);
  const year = yearOf(ct);
  if (!title || !artist || year == null) return null; // min-4 guard (category guaranteed)
  const srcId = ct.id;
  const localId = `${SLUG}-${srcId.replace(/^CZE:MG\./, '').replace(/[^A-Za-z0-9_-]/g, '-')}`;
  return {
    id: localId,
    objectNumber: ct.identifier || '',
    title,
    artist,
    date: String(ct.dating || '').trim() || String(year),
    year,
    medium: (ct.medium || []).join(', '),
    dimensions: (ct.measurement || []).join('; '),
    category: cls.category,
    description: String(ct.description || '').trim(),
    imageUrl: null, // filled after R2 upload
    thumbnailUrl: IMG(srcId, 400),
    onDisplay: false,
    displayLocation: '',
    sourceUrl: `${FRONTEND}/items/${srcId}`,
    metadata: {
      source_id: srcId,
      department_prefix: cls.dept,
      work_type: (ct.work_type || []).join('; '),
      technique: (ct.technique || []).join('; '),
      view_count: ct.view_count ?? 0,
    },
    original_imageUrl: IMG(srcId, 800),
  };
}

// ---------- image pipeline ----------
async function dl(url) {
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 5000) throw new Error(`tiny ${buf.length}b`);
      return buf;
    } catch (e) { if (att === 3) throw e; await sleep(700 * att); }
  }
}
async function colorfulness(buf) {
  const { data } = await sharp(buf, { limitInputPixels: false }).resize(80, 80, { fit: 'inside' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const rg = [], yb = [];
  for (let i = 0; i < data.length; i += 3) { const R = data[i], G = data[i + 1], B = data[i + 2]; rg.push(R - G); yb.push(0.5 * (R + G) - B); }
  const m = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const sd = (a) => { const mu = m(a); return Math.sqrt(m(a.map((v) => (v - mu) ** 2))); };
  return Math.sqrt(sd(rg) ** 2 + sd(yb) ** 2) + 0.3 * Math.sqrt(m(rg) ** 2 + m(yb) ** 2);
}
async function uploadR2(key, buffer) {
  for (let att = 1; att <= 4; att++) {
    try {
      await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buffer, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000' }));
      return;
    } catch (e) { if (att === 4) throw e; await sleep(500 * att); }
  }
}
async function processImage(a) {
  const src = await dl(a.original_imageUrl);
  const meta = await sharp(src).metadata().catch(() => ({}));
  if (meta.width && Math.max(meta.width, meta.height || 0) < 600) throw new Error(`small ${meta.width}x${meta.height}`);
  if (a.category === 'print') { // monochrome reproductive-print gate — prints ONLY
    const cf = await colorfulness(src);
    if (cf < 20) throw new Error(`grayscale-print cf=${cf.toFixed(1)}`);
  }
  const { buffer } = await autocropToWebp(src); // default: webp convert only (no trim)
  const hash8 = sha(a.original_imageUrl).slice(0, 8);
  const key = `artworks/${STEM}/${a.id}-${hash8}-imageUrl.webp`;
  await uploadR2(key, buffer);
  return `${R2_PUBLIC}/${key}`;
}

// ---------- output ----------
function writeCollection(artworks, stem, inScopeTotal) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'Moravská galerie v Brně',
    collection: 'Collection',
    website: `${FRONTEND}/`,
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'api',
    in_scope_total: inScopeTotal,
    category_note: 'graphic-design dept (GD/ARN incl. Brno Biennale posters) = "poster"; GDR ex libris = "print"',
    category_breakdown: cats,
    artworks,
  };
  const out = path.join(REPO, 'public/data', `${stem}.json`);
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
  console.log(`[write] ${out} (${artworks.length} works) breakdown=`, cats);
}

// ---------- progress ----------
function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS, 'utf8')); } catch { return { doneSlices: {} }; }
}
function saveProgress(p) { fs.writeFileSync(PROGRESS, JSON.stringify(p)); }
function loadNdjsonMap(file, keyFn) {
  const map = new Map();
  if (fs.existsSync(file)) for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { const o = JSON.parse(line); map.set(keyFn(o), o); } catch { /* skip */ }
  }
  return map;
}

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const items = new Map(); // sourceId → content
  const sink = (ct) => { if (ct && ct.id && !items.has(ct.id)) items.set(ct.id, ct); };

  if (MODE === 'probe') {
    console.log('[probe] harvesting 3 sample slices…');
    await fetchSubset({ 'filter[date_earliest][gte]': '1750', 'filter[date_earliest][lt]': '1860' }, 'dated 1750-1860', sink, 600);
    await fetchSubset({ 'filter[date_earliest][gte]': '1895', 'filter[date_earliest][lt]': '1905' }, 'dated 1895-1905', sink, 600);
    await fetchSubset({ 'filter[date_earliest][gte]': '1963', 'filter[date_earliest][lt]': '1967' }, 'dated 1963-1967 (Biennale era)', sink, 600);
  } else {
    // resumable harvest: cached items + slice checklist
    const prog = loadProgress();
    for (const ct of loadNdjsonMap(ITEMS_CACHE, (o) => o.id).values()) sink(ct);
    console.log(`[full] resume: ${items.size} cached items, ${Object.keys(prog.doneSlices).length} slices done`);
    const cacheSink = (ct) => {
      if (!ct || !ct.id || items.has(ct.id)) return;
      items.set(ct.id, ct);
      fs.appendFileSync(ITEMS_CACHE, JSON.stringify(ct) + '\n');
    };
    console.log('[full] bisecting dated slices…');
    const slices = await buildDatedSlices();
    console.log(`[full] ${slices.length} dated slices, sum=${slices.reduce((s, x) => s + x.n, 0)}`);
    for (const sl of slices) {
      const key = `d:${sl.a}:${sl.b}`;
      if (prog.doneSlices[key]) continue;
      await fetchSubset({ 'filter[date_earliest][gte]': String(sl.a), 'filter[date_earliest][lt]': String(sl.b) }, key + ` (${sl.n})`, cacheSink);
      prog.doneSlices[key] = true; saveProgress(prog);
    }
    console.log('[full] null-date recovery subsets…');
    for (const extra of RECOVERY) {
      const key = `r:${JSON.stringify(extra)}`;
      if (prog.doneSlices[key]) continue;
      const n = await countFor(extra);
      if (n === 0 || n > SLICE_MAX) { // over-window subsets are already mostly covered by date slices
        console.log(`  [recovery] skip ${key} (n=${n})`);
      } else {
        await fetchSubset(extra, key + ` (${n})`, cacheSink);
      }
      prog.doneSlices[key] = true; saveProgress(prog);
    }
  }
  console.log(`[harvest] unique items: ${items.size}`);

  // classify + assemble candidates
  const byCat = {};
  let outScope = 0, min4 = 0;
  const candidates = [];
  for (const ct of items.values()) {
    const cls = classify(ct);
    if (!cls) { outScope++; continue; }
    const a = toArtwork(ct, cls);
    if (!a) { min4++; continue; }
    byCat[a.category] = (byCat[a.category] || 0) + 1;
    candidates.push(a);
  }
  const inScopeTotal = candidates.length;
  console.log(`[classify] in-scope+min4: ${inScopeTotal} | out-of-scope: ${outScope} | min4-drop: ${min4}`);
  console.log('[classify] breakdown:', byCat);

  // selection
  let selected;
  if (MODE === 'probe') {
    const pick = (cat, n) => candidates.filter((a) => a.category === cat)
      .sort((x, y) => (y.metadata.view_count - x.metadata.view_count)).slice(0, n);
    selected = [...pick('painting', 4), ...pick('poster', 5), ...pick('print', 4), ...pick('drawing', 3), ...pick('mixed_media_2d', 2)].slice(0, 18);
  } else {
    const keep = candidates.filter((a) => a.category !== 'poster');
    const posters = candidates.filter((a) => a.category === 'poster')
      .sort((x, y) => (y.metadata.view_count - x.metadata.view_count) || (y.year - x.year));
    const budget = Math.max(0, CAP - keep.length);
    if (posters.length > budget) console.log(`[cap] posters ${posters.length} → ${budget} (by museum view_count; CAP=${CAP})`);
    selected = [...keep, ...posters.slice(0, budget)];
  }
  console.log(`[select] ${selected.length} to image-process`);

  // image pipeline (resumable via uploaded ndjson)
  const done = loadNdjsonMap(UPLOADED, (o) => o.id);
  const artworks = [];
  let idx = 0, ok = 0, skip = 0, err = 0;
  await Promise.all(Array.from({ length: IMG_CONC }, async () => {
    while (idx < selected.length) {
      const a = selected[idx++];
      const prev = done.get(a.id);
      if (prev) { a.imageUrl = prev.imageUrl; artworks.push(a); ok++; continue; }
      try {
        a.imageUrl = await processImage(a);
        fs.appendFileSync(UPLOADED, JSON.stringify({ id: a.id, imageUrl: a.imageUrl }) + '\n');
        artworks.push(a); ok++;
      } catch (e) {
        const msg = String(e.message || e);
        if (msg.startsWith('grayscale-print')) skip++;
        else { err++; fs.appendFileSync(FAILED, JSON.stringify({ id: a.id, url: a.original_imageUrl, err: msg }) + '\n'); }
        if (err <= 5 && !msg.startsWith('grayscale-print')) console.log(`  img err ${a.id}: ${msg}`);
      }
      await sleep(250);
      const n = ok + skip + err;
      if (n % 100 === 0) console.log(`  …${n}/${selected.length} (ok ${ok}, grayscale-skip ${skip}, err ${err})`);
    }
  }));

  artworks.sort((x, y) => x.id.localeCompare(y.id));
  writeCollection(artworks, MODE === 'probe' ? `${STEM}-probe` : STEM, inScopeTotal);
  console.log(`[${MODE}] DONE. uploaded ${ok} | grayscale-print skipped ${skip} | img errors ${err}`);
  console.log(`[${MODE}] in-scope offered ${inScopeTotal} / collected ${artworks.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
