#!/usr/bin/env node
// Museum of Islamic Art, Doha (MIA) — collection scraper.
// Source: Qatar Museums' own digital-collection platform (Nuxt 3 SSR).
//   https://collections.qm.org.qa/en/objects?museum=museum-of-islamic-art
// The Azure backend API (dgcollectionprod-*.azurewebsites.net) is IP-restricted, but every
// SSR page embeds the full API response in <script id="__NUXT_DATA__"> (devalue format).
//   - LIST:   /en/objects?museum=museum-of-islamic-art&pageSize=600  → ALL records in ONE page
//             (578 total as of 2026-06; `page` URL param does NOT pass through, pageSize does)
//   - DETAIL: /en/objects/{slug} → displayDimensions, mediumEN, highresImage(width-4000),
//             productionFullnameEN, period, descriptionEN  (detail-page completeness rule)
// Images: dgcollectionprod.blob.core.windows.net (public, long edge up to 4000px).
//
// SCOPE: flat art only. MIA's digitised set is mostly 3D (tiles/ceramics/metalwork/carpets);
// in-scope = manuscript folios, Qur'an bifolios, album/miniature paintings, scrolls, maps
// (~88 of 578). Persian/Mughal album miniatures count as painting (NOT portrait-locket
// miniatures — ivory guard below). B&W colorfulness gate applies to `print` only
// (none expected); drawings/photographs/calligraphy/manuscripts are never gated.
// Artist for anonymous works = museum's own period+place attribution ("Safavid Iran") —
// same convention as salar-jung ("Rajasthani school"); never "Unknown"/"Anonymous".
//
// Usage:
//   node scripts/scrape-mia-doha.mjs --probe   # ~20 works end-to-end → mia-doha-collection-probe.json
//   node scripts/scrape-mia-doha.mjs --full    # all in-scope (resumable) → mia-doha-collection.json

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

const SLUG = 'mia-doha';
const COLLECTION_STEM = `${SLUG}-collection`;
const BASE = 'https://collections.qm.org.qa';
const LIST_URL = `${BASE}/en/objects?museum=museum-of-islamic-art&pageSize=600`;
const UA = 'armin-museum-research/1.0';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const PROGRESS = path.join(STATE_DIR, `${SLUG}-progress.json`);
const FAILED = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : 'probe';
const PROBE_TARGET = 20;

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

// ---------- fetch with long timeout (Qatar server: first byte can take 40s+) ----------
async function fetchText(url, { timeoutMs = 180000, tries = 3 } = {}) {
  for (let att = 1; att <= tries; att++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: ctrl.signal });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) {
      if (att === tries) throw e;
      await sleep(2000 * att);
    } finally { clearTimeout(t); }
  }
}

// ---------- __NUXT_DATA__ (devalue) ----------
// Nodes array; container children are indices into the array; scalars are stored as nodes.
function nuxtNodes(html) {
  const m = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>(.*?)<\/script>/s);
  if (!m) throw new Error('no __NUXT_DATA__');
  return JSON.parse(m[1]);
}
const WRAPPERS = new Set(['Reactive', 'ShallowReactive', 'Ref', 'ShallowRef', 'EmptyRef', 'EmptyShallowRef']);
function resolveNode(nodes, i, depth = 0) {
  if (depth > 24) return null;
  if (typeof i !== 'number') return i;
  if (i < 0) return null; // devalue specials (undefined/NaN/…)
  const n = nodes[i];
  if (n === null || typeof n !== 'object') return n;
  if (Array.isArray(n)) {
    if (n.length === 2 && WRAPPERS.has(n[0])) return resolveNode(nodes, n[1], depth + 1);
    return n.map((x) => resolveNode(nodes, x, depth + 1));
  }
  const o = {};
  for (const [k, v] of Object.entries(n)) o[k] = resolveNode(nodes, v, depth + 1);
  return o;
}
function findResolve(nodes, predicate) {
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n && typeof n === 'object' && !Array.isArray(n) && predicate(n)) {
      const r = resolveNode(nodes, i);
      if (r) return r;
    }
  }
  return null;
}

// ---------- list: one SSR page = entire MIA result set ----------
async function fetchList() {
  let html = await fetchText(LIST_URL);
  let nodes = nuxtNodes(html);
  let res = findResolve(nodes, (n) => 'results' in n && 'count' in n && 'facets' in n);
  if (!res) throw new Error('search response not found in payload');
  if (res.count > res.results.length) {
    console.log(`[list] count ${res.count} > page ${res.results.length} — refetching with bigger pageSize`);
    html = await fetchText(`${BASE}/en/objects?museum=museum-of-islamic-art&pageSize=${res.count + 50}`);
    nodes = nuxtNodes(html);
    res = findResolve(nodes, (n) => 'results' in n && 'count' in n && 'facets' in n);
    if (!res || res.count > res.results.length) throw new Error(`incomplete list: ${res && res.results.length}/${res && res.count}`);
  }
  console.log(`[list] ${res.results.length}/${res.count} MIA records in payload`);
  return res.results;
}

// ---------- scope + category ----------
function classify(rec) {
  const name = (rec.objectNameEN || '').toLowerCase();
  const toks = name.split(',').map((s) => s.trim());
  const T = new Set((rec.techniques || []).map((t) => t.slug));
  const M = new Set((rec.materials || []).map((m) => m.slug));
  const has = (w) => toks.includes(w);
  if (M.has('ivory')) return null; // portrait-miniature guard (locket-type) — out of scope
  if (has('painting') || has('miniature')) return 'painting';
  if (has('photograph')) return 'photograph';
  if (has('drawing')) return 'drawing';
  if (has('map')) return T.has('printing') || T.has('printmaking') ? 'print' : 'manuscript';
  if (has('folio') || has('bifolio')) return T.has('illustration') || T.has('painting') ? 'painting' : 'manuscript';
  if (has('manuscript') || has('scroll') || has('album') || has('document') || has('firman') || has('certificate') || has('marbled paper')) return 'manuscript';
  if (has('calligraphy') || has('levha') || has('maqta')) return 'calligraphy';
  // paper-based painted/calligraphic works under other object names
  const paper = M.has('paper') || M.has('parchment') || M.has('vellum') || M.has('papyrus');
  if (paper && (T.has('illustration') || T.has('painting'))) return 'painting';
  if (paper && (T.has('calligraphy') || T.has('illumination'))) return 'manuscript';
  return null; // 3D / out of scope
}

// ---------- detail page ----------
async function fetchDetail(slug, objectNumber) {
  const html = await fetchText(`${BASE}/en/objects/${slug}`, { timeoutMs: 120000 });
  const nodes = nuxtNodes(html);
  const obj = findResolve(nodes, (n) => 'objectNumber' in n && 'displayDimensions' in n && 'mediumEN' in n);
  if (!obj || obj.objectNumber !== objectNumber) throw new Error(`detail mismatch (${obj && obj.objectNumber} ≠ ${objectNumber})`);
  return obj;
}

// ---------- field assembly ----------
function pickYear(rec, detail) {
  const m = clean(rec.displayDate || (detail && detail.displayDate) || '').match(/\d{3,4}/);
  if (m) return parseInt(m[0], 10);
  const de = detail && Number(detail.dateEarliest);
  if (de && de > 0 && de < 2100) return Math.round(de);
  return null;
}
function pickArtist(rec, detail) {
  const named = clean(rec.artistEN) || clean(detail && detail.productionFullnameEN);
  if (named) return named;
  // museum's own attribution: period + production place (e.g. "Safavid Iran")
  const period = detail && detail.period && clean(detail.period.labelEN);
  const place = (rec.locationCountry && clean(rec.locationCountry.labelEN)) || (rec.site && clean(rec.site.labelEN));
  if (period && place) return /century/i.test(period) ? `${place}, ${period}` : `${period} ${place}`;
  return period || place || '';
}
function pickImage(rec, detail) {
  if (detail && detail.highresImage && detail.highresImage.url) return detail.highresImage.url;
  const orig = (rec.objectImages && rec.objectImages.original) || [];
  return orig.length ? orig[orig.length - 1].url : null;
}
function buildArtwork(rec, detail, category, imageUrl, originalUrl) {
  const title = clean(rec.titleEN || rec.title);
  const artist = pickArtist(rec, detail);
  const year = pickYear(rec, detail);
  if (!title || !artist || year == null) return null; // min-4 guard — drop, never placeholder
  const card = (rec.objectImages && rec.objectImages.card) || [];
  const dims = ((detail && detail.displayDimensions) || []).map((d) => clean(d.labelEN || d.label)).filter(Boolean).join('; ');
  const medium = clean(detail && detail.mediumEN) || (rec.materials || []).map((m) => clean(m.labelEN)).filter(Boolean).join(', ');
  return {
    id: `mia-doha-${clean(rec.objectNumber).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
    objectNumber: clean(rec.objectNumber),
    title,
    artist,
    date: clean(rec.displayDate || (detail && detail.displayDate) || '').replace(/\s*-\s*/g, ' - '),
    year,
    medium,
    dimensions: dims,
    category,
    description: clean((detail && detail.descriptionEN) || rec.summaryEN || ''),
    imageUrl,
    thumbnailUrl: card.length ? card[card.length - 1].url : originalUrl,
    onDisplay: false,
    displayLocation: '',
    sourceUrl: `${BASE}/en/objects/${rec.slug}`,
    metadata: {
      qmId: rec.id,
      objectName: rec.objectNameEN || '',
      period: (detail && detail.period && detail.period.labelEN) || '',
      productionPlace: (rec.locationCountry && rec.locationCountry.labelEN) || (rec.site && rec.site.labelEN) || '',
      techniques: (rec.techniques || []).map((t) => clean(t.labelEN)),
      titleAR: rec.titleAR || '',
    },
    original_imageUrl: originalUrl,
  };
}

// ---------- image: B&W gate (prints only) + autocrop + R2 ----------
// Hasler-Süsstrunk colorfulness (from scripts/audit/curate-grayscale-prints.mjs)
async function colorfulness(buf) {
  const { data } = await sharp(buf, { limitInputPixels: false }).resize(80, 80, { fit: 'inside' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const rg = [], yb = [];
  for (let i = 0; i < data.length; i += 3) { const R = data[i], G = data[i + 1], B = data[i + 2]; rg.push(R - G); yb.push(0.5 * (R + G) - B); }
  const m = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const sd = (a) => { const mu = m(a); return Math.sqrt(m(a.map((v) => (v - mu) ** 2))); };
  return Math.sqrt(sd(rg) ** 2 + sd(yb) ** 2) + 0.3 * Math.sqrt(m(rg) ** 2 + m(yb) ** 2);
}
async function dl(url) {
  for (let att = 1; att <= 3; att++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 120000);
      const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: ctrl.signal }).finally(() => clearTimeout(t));
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 5000) throw new Error(`tiny ${buf.length}b`);
      return buf;
    } catch (e) { if (att === 3) throw e; await sleep(800 * att); }
  }
}
async function uploadR2(key, buffer) {
  for (let att = 1; att <= 4; att++) {
    try {
      await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buffer, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000' }));
      return;
    } catch (e) { if (att === 4) throw e; await sleep(500 * att); }
  }
}
async function processImage(id, srcUrl, category) {
  const src = await dl(srcUrl);
  const meta = await sharp(src).metadata().catch(() => ({}));
  if (meta.width && Math.max(meta.width, meta.height) < 600) throw new Error(`thumb ${meta.width}x${meta.height}`);
  if (category === 'print') {
    const cf = await colorfulness(src);
    if (cf >= 0 && cf < 20) throw new Error(`bw-print colorfulness=${cf.toFixed(1)}`);
  }
  const { buffer } = await autocropToWebp(src); // default: webp convert only, no trim
  const key = `artworks/${COLLECTION_STEM}/${id}-${sha(srcUrl).slice(0, 8)}-imageUrl.webp`;
  await uploadR2(key, buffer);
  return `${R2_PUBLIC}/${key}`;
}

// ---------- progress ----------
function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS, 'utf8')); } catch { return { done: {} }; }
}
function saveProgress(p) { fs.writeFileSync(PROGRESS, JSON.stringify(p)); }

function writeCollection(artworks, stem) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'Museum of Islamic Art',
    collection: 'Collection',
    website: 'https://collections.qm.org.qa/en/objects?museum=museum-of-islamic-art',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'ssr-payload',
    category_breakdown: cats,
    artworks,
  };
  const out = path.join(REPO, 'public/data', `${stem}.json`);
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
  console.log(`[write] ${out} (${artworks.length} works) breakdown=`, cats);
}

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const records = await fetchList();

  const inScope = [];
  const tally = {};
  for (const r of records) {
    const cat = classify(r);
    if (!cat) continue;
    if (!(r.objectImages && (r.objectImages.original || []).length)) continue;
    inScope.push({ rec: r, cat });
    tally[cat] = (tally[cat] || 0) + 1;
  }
  inScope.sort((a, b) => a.rec.objectNumber.localeCompare(b.rec.objectNumber));
  console.log(`[scope] in-scope ${inScope.length}/${records.length} —`, tally);

  const targets = MODE === 'probe' ? inScope.slice(0, PROBE_TARGET) : inScope;
  const progress = loadProgress();
  const artworks = [];
  let nFail = 0, nDrop = 0, nDetailFallback = 0;

  for (let i = 0; i < targets.length; i++) {
    const { rec, cat } = targets[i];
    const doneKey = String(rec.id);
    if (progress.done[doneKey]) { artworks.push(progress.done[doneKey]); continue; }

    let detail = null;
    try {
      detail = await fetchDetail(rec.slug, rec.objectNumber);
    } catch (e) {
      nDetailFallback++;
      fs.appendFileSync(FAILED, JSON.stringify({ stage: 'detail', id: rec.id, slug: rec.slug, err: String(e.message || e) }) + '\n');
      console.log(`  [detail-fallback] ${rec.objectNumber}: ${e.message} (using list metadata)`);
    }
    await sleep(350);

    const srcUrl = pickImage(rec, detail);
    try {
      const draft = buildArtwork(rec, detail, cat, null, srcUrl);
      if (!draft) { nDrop++; console.log(`  [min4-drop] ${rec.objectNumber} "${clean(rec.titleEN).slice(0, 40)}"`); continue; }
      draft.imageUrl = await processImage(draft.id, srcUrl, cat);
      artworks.push(draft);
      progress.done[doneKey] = draft;
      saveProgress(progress);
    } catch (e) {
      nFail++;
      fs.appendFileSync(FAILED, JSON.stringify({ stage: 'image', id: rec.id, objectNumber: rec.objectNumber, url: srcUrl, err: String(e.message || e) }) + '\n');
      console.log(`  [img-fail] ${rec.objectNumber}: ${e.message}`);
    }
    if ((i + 1) % 10 === 0) console.log(`  …${i + 1}/${targets.length} (ok ${artworks.length}, fail ${nFail}, drop ${nDrop})`);
  }

  writeCollection(artworks, MODE === 'probe' ? `${COLLECTION_STEM}-probe` : COLLECTION_STEM);
  console.log(`[${MODE}] DONE — ok ${artworks.length} | img/bw fails ${nFail} | min4 drops ${nDrop} | detail fallbacks ${nDetailFallback}`);
  console.log(`[${MODE}] full in-scope universe = ${inScope.length} (of ${records.length} digitised MIA objects)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
