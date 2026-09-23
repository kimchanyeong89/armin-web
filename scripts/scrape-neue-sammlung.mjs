#!/usr/bin/env node
// Die Neue Sammlung — The Design Museum (Munich, Germany) — flat-design collection scraper.
// GENRE: 제품·산업디자인 (design) — but ONLY the FLAT graphic works: posters / graphic prints / photographs.
//
// Source: museum-OWN Algolia search index (their WordPress "Sammlung Online" / collection-online SPA),
//   no auth beyond the public search-only key embedded on www.die-neue-sammlung.de/en/collection-online/.
//   POST https://LNZJKLMYJI-dsn.algolia.net/1/indexes/live_searchable_posts/query
//        headers: X-Algolia-Application-Id, X-Algolia-API-Key (search-only)
//        body: { params: "hitsPerPage=…&page=…&filters=…" }
//   Base filter (the SPA's own): (post_type:"objekt") AND (noindex:false)
//                                AND ((wpml.locale:"de_DE") OR (wpml.locale:false))
//   → 1,247 published objects total.
//
// SCOPE (flat visual works only). This is a DESIGN museum: ~1,150 of 1,247 objects are 3D
//   industrial-design objects (Möbel/furniture 184, Keramik 150, Beleuchtung 75, cameras, appliances,
//   toys, vehicles, glass, metal, textiles…) — ALL out of scope per COLLECTION_SCRAPING_GUIDE §1.
//   We keep ONLY flat works on paper, classified by Algolia `classification`:
//     - "Plakate"     → poster   → category 'print'   (50)
//     - "Print"       → graphic print/poster set       → category 'print'   (50)
//     - "Fotografie"  → photograph                      → category 'photograph' (1)
//   → ~101 in-scope flat works. (Books/Bücher are bound 3D objects → excluded.)
//   Per §1 graphics are colour-gated to drop grayscale reproduction prints; photographs never.
//
// Metadata comes straight from each Algolia hit (the museum's own object record):
//   post_title, creator/designer (array of {role,name}), dating (array of {label,year}),
//   material_technik/material, size, inventarnr, classification/subclassification, permalink,
//   on_display, is_highlight. Full image = images[0].full (museum wp-content; ~600–2000px JPEG).
//
// Usage:
//   node scripts/scrape-neue-sammlung.mjs --classify   # dry-run: scope tally (no images)
//   node scripts/scrape-neue-sammlung.mjs --probe       # build ~15 in-scope end-to-end + R2 upload
//   node scripts/scrape-neue-sammlung.mjs --full         # full in-scope scrape + R2, resumable

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { autocropToWebp } from './lib/autocrop.mjs';

const require = createRequire(import.meta.url);
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const REPO = path.resolve(fileURLToPath(import.meta.url), '../..');
require('dotenv').config({ path: path.join(REPO, '.env.local') });

const SLUG = 'neue-sammlung';
const COLLECTION_STEM = `${SLUG}-collection`;
const ALGOLIA_APP = 'LNZJKLMYJI';
const ALGOLIA_KEY = '7137aefd1ca47371990e38a452d68cb8'; // public search-only key (from collection-online page)
const ALGOLIA_INDEX = 'live_searchable_posts';
const ALGOLIA_URL = `https://${ALGOLIA_APP}-dsn.algolia.net/1/indexes/${ALGOLIA_INDEX}/query`;
const BASE_FILTER = '(post_type:"objekt") AND (noindex:false) AND ((wpml.locale:"de_DE") OR (wpml.locale:false))';
// in-scope flat classifications → ARMIN category
const SCOPE = { 'Plakate': 'print', 'Print': 'print', 'Fotografie': 'photograph' };
const UA = 'armin-museum-research/1.0';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const PROGRESS = path.join(STATE_DIR, `${SLUG}-progress.json`);
const FAILED = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : args.includes('--probe') ? 'probe' : 'classify';
const PROBE_TARGET = 15;
const PAGE = 100;     // Algolia page size
const CONC = 4;       // image download/upload concurrency
const COLORFULNESS_MIN = 20; // §1: drop grayscale reproduction prints (graphics only)

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ---------- Algolia fetch (one in-scope classification, paged) ----------
async function algoliaPage(classification, page, hitsPerPage) {
  const filters = `${BASE_FILTER} AND classification:"${classification}"`;
  const body = JSON.stringify({ params: `hitsPerPage=${hitsPerPage}&page=${page}&filters=${encodeURIComponent(filters)}` });
  for (let att = 1; att <= 4; att++) {
    try {
      const r = await fetch(ALGOLIA_URL, {
        method: 'POST',
        headers: {
          'X-Algolia-Application-Id': ALGOLIA_APP,
          'X-Algolia-API-Key': ALGOLIA_KEY,
          'Content-Type': 'application/json',
          'User-Agent': UA,
        },
        body,
      });
      if (r.status === 429) { await sleep(1500 * att); continue; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) { if (att === 4) throw new Error(`${classification} p${page}: ${e.message}`); await sleep(700 * att); }
  }
}

// gather every in-scope hit across all scope classifications
async function gatherAll() {
  const hits = [];
  for (const cls of Object.keys(SCOPE)) {
    const first = await algoliaPage(cls, 0, PAGE);
    const nbPages = first.nbPages || 1;
    console.log(`  [${cls}] nbHits=${first.nbHits} nbPages=${nbPages}`);
    for (const h of first.hits || []) hits.push({ h, cls });
    for (let p = 1; p < nbPages; p++) {
      const d = await algoliaPage(cls, p, PAGE);
      for (const h of d.hits || []) hits.push({ h, cls });
      await sleep(150);
    }
    await sleep(150);
  }
  // de-dupe by objectID (a record could in theory carry two scope classifications)
  const seen = new Set();
  return hits.filter(({ h }) => { const id = String(h.objectID || h.post_id); if (seen.has(id)) return false; seen.add(id); return true; });
}

// ---------- helpers to read the museum record ----------
function firstImage(h) {
  const imgs = Array.isArray(h.images) ? h.images : [];
  const full = (imgs[0] && imgs[0].full) || h.image_full || '';
  const thumb = (imgs[0] && imgs[0].thumbnail) || h.image_thumbail || '';
  const copyrights = (imgs[0] && imgs[0].copyrights) || '';
  return { full, thumb, copyrights };
}

// creator/designer arrays → "Name; Name" readable string (keep source order/form)
function peopleString(h) {
  const out = [];
  const push = (arr) => { for (const p of (Array.isArray(arr) ? arr : [])) { const n = (p && p.name || '').trim(); if (n) out.push(cleanName(n)); } };
  // prefer designer, then creator, then producer — these are the authors of a poster/print
  push(h.designer); push(h.creator); push(h.producer);
  // de-dupe preserving order
  const seen = new Set(); const uniq = out.filter((n) => { const k = n.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  return uniq.join('; ');
}
function cleanName(n) {
  // strip trailing life-dates parens and stray CR/whitespace; keep "Surname, Given" form (source format)
  return n.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+/g, ' ').trim();
}

function earliestYear(h) {
  const ds = Array.isArray(h.dating) ? h.dating : [];
  let best = null;
  for (const d of ds) {
    const m = String(d && d.year || '').match(/\d{3,4}/);
    if (m) { const y = parseInt(m[0], 10); if (best == null || y < best) best = y; }
  }
  if (best == null && Array.isArray(h.years) && h.years.length) {
    const ys = h.years.map((y) => parseInt(String(y).match(/\d{3,4}/)?.[0] || '', 10)).filter((y) => !isNaN(y));
    if (ys.length) best = Math.min(...ys);
  }
  return best;
}
function datingString(h) {
  const ds = Array.isArray(h.dating) ? h.dating : [];
  const parts = ds.map((d) => (d && d.year ? String(d.year) : '')).filter(Boolean);
  return [...new Set(parts)].join(', ');
}

// ---------- hit → pre-image ARMIN record ----------
function parseHit(h, cls) {
  const category = SCOPE[cls];
  if (!category) return null;
  const { full, thumb, copyrights } = firstImage(h);
  if (!full) return null; // no downloadable image
  const id = String(h.objectID || h.post_id || '');
  if (!id) return null;
  const title = (h.post_title || h.title || '').trim();
  const artist = peopleString(h);
  const year = earliestYear(h);
  return {
    id,
    title,
    artist,
    year,
    dateStr: datingString(h),
    medium: (h.material_technik || (Array.isArray(h.material) ? h.material.join(', ') : h.material) || '').trim(),
    dimensions: (h.size || '').trim(),
    category,
    classification: cls,
    subclassification: (Array.isArray(h.subclassification) ? h.subclassification.join(', ') : h.subclassification || ''),
    objectNumber: (h.inventarnr || '').trim(),
    onDisplay: !!h.on_display,
    isHighlight: !!h.is_highlight,
    copyright: copyrights,
    imgUrl: full,
    thumbUrl: thumb,
    sourceUrl: h.permalink || `https://www.die-neue-sammlung.de/objekt/`,
  };
}

// ---------- colorfulness (Hasler–Süsstrunk) — drop grayscale repro prints (graphics only) ----------
async function colorfulness(buf) {
  try {
    const sharp = (await import('sharp')).default;
    const { data, info } = await sharp(buf).resize(80, 80, { fit: 'inside' }).raw().toBuffer({ resolveWithObject: true });
    const ch = info.channels; let rg = [], yb = [];
    for (let i = 0; i + ch - 1 < data.length; i += ch) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      rg.push(r - g); yb.push(0.5 * (r + g) - b);
    }
    const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
    const std = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
    return Math.sqrt(std(rg) ** 2 + std(yb) ** 2) + 0.3 * Math.sqrt(mean(rg) ** 2 + mean(yb) ** 2);
  } catch { return 999; } // on failure, don't drop
}

// ---------- image: download, verify, autocrop, R2 upload ----------
async function dl(url) {
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 4000) throw new Error(`tiny ${buf.length}b`);
      return buf;
    } catch (e) { if (att === 3) throw e; await sleep(500 * att); }
  }
}
async function uploadR2(key, buffer) {
  for (let att = 1; att <= 4; att++) {
    try {
      await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buffer, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000' }));
      return true;
    } catch (e) { if (att === 4) throw e; await sleep(400 * att); }
  }
}
async function processImage(a) {
  const src = await dl(a.imgUrl);
  const sharp = (await import('sharp')).default;
  const meta = await sharp(src).metadata().catch(() => ({}));
  if (meta.width && meta.height && Math.max(meta.width, meta.height) < 400)
    throw new Error(`thumb ${meta.width}x${meta.height}`);
  // §1 colour gate: graphics (print) only; never gate photographs
  if (a.category === 'print') {
    const cf = await colorfulness(src);
    if (cf < COLORFULNESS_MIN) throw new Error(`grayscale-print cf=${cf.toFixed(1)}`);
  }
  const { buffer } = await autocropToWebp(src); // webp(2048/q85), no trim by default
  const hash8 = sha(a.imgUrl).slice(0, 8);
  const key = `artworks/${COLLECTION_STEM}/${a.id}-${hash8}-imageUrl.webp`;
  await uploadR2(key, buffer);
  return { imageUrl: `${R2_PUBLIC}/${key}`, srcW: meta.width || null, srcH: meta.height || null };
}

// ---------- record assembly (min-4 guard) ----------
function toArtwork(a, imageUrl) {
  if (!a.title || !a.artist || a.year == null || !a.category) return null;
  return {
    id: a.id,
    objectNumber: a.objectNumber,
    title: a.title,
    artist: a.artist,
    date: a.dateStr || String(a.year),
    year: a.year,
    medium: a.medium,
    dimensions: a.dimensions,
    category: a.category,
    description: '',
    imageUrl,
    thumbnailUrl: a.thumbUrl,
    onDisplay: a.onDisplay,
    displayLocation: '',
    sourceUrl: a.sourceUrl,
    metadata: {
      classification: a.classification,
      subclassification: a.subclassification,
      copyright: a.copyright,
      is_highlight: a.isHighlight,
    },
    original_imageUrl: a.imgUrl,
  };
}

function writeCollection(artworks, stem) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'Die Neue Sammlung — The Design Museum',
    collection: 'Posters, Graphic Prints & Photography',
    website: 'https://www.die-neue-sammlung.de/en/collection-online/',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'algolia',
    category_breakdown: cats,
    artworks,
  };
  const out = path.join(REPO, 'public/data', `${stem}.json`);
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
  const mb = (fs.statSync(out).size / 1024 / 1024).toFixed(2);
  console.log(`[write] ${out} (${artworks.length} works, ${mb} MB) breakdown=`, cats);
  return out;
}

function priorityScore(a) {
  let s = 0;
  if (a.artist) s += 2;
  if (a.year != null) s += 1;
  if (a.dimensions) s += 1;
  if (a.medium) s += 1;
  if (a.isHighlight) s += 2;
  return s;
}

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  console.log(`[fetch] Die Neue Sammlung — Algolia ${ALGOLIA_INDEX} (in-scope flat classes: ${Object.keys(SCOPE).join(', ')})`);
  const raw = await gatherAll();
  const candidates = [];
  for (const { h, cls } of raw) { const a = parseHit(h, cls); if (a) candidates.push(a); }
  console.log(`[scope] in-scope hits with image: ${candidates.length} of ${raw.length} fetched`);

  if (MODE === 'classify') {
    const tally = {}; let drop4 = 0;
    for (const a of candidates) {
      tally[a.classification] = (tally[a.classification] || 0) + 1;
      if (!a.title || !a.artist || a.year == null) drop4++;
    }
    console.log('[classify] by classification:', tally);
    console.log('[classify] would drop on min-4:', drop4);
    return;
  }

  let work = candidates.slice().sort((x, y) => priorityScore(y) - priorityScore(x));
  if (MODE === 'probe') work = work.slice(0, PROBE_TARGET);

  let doneIds = new Set();
  if (MODE === 'full' && fs.existsSync(PROGRESS)) {
    try { doneIds = new Set(JSON.parse(fs.readFileSync(PROGRESS, 'utf8')).doneIds || []); } catch {}
    console.log(`[full] resuming: ${doneIds.size} ids already processed`);
  }

  const artworks = [];
  let done = 0, imgErr = 0, drop4 = 0, idx = 0;
  const persist = () => { if (MODE === 'full') fs.writeFileSync(PROGRESS, JSON.stringify({ doneIds: [...doneIds] })); };

  await Promise.all(Array.from({ length: CONC }, async () => {
    while (idx < work.length) {
      const a = work[idx++];
      if (doneIds.has(a.id)) continue;
      try {
        const { imageUrl } = await processImage(a);
        const w = toArtwork(a, imageUrl);
        if (w) artworks.push(w); else drop4++;
        doneIds.add(a.id);
      } catch (e) {
        imgErr++;
        fs.appendFileSync(FAILED, JSON.stringify({ id: a.id, url: a.imgUrl, err: String(e.message || e) }) + '\n');
        if (imgErr <= 12) console.log(`  img err id=${a.id}: ${e.message}`);
      }
      if (++done % 25 === 0) { console.log(`  …${done}/${work.length} (ok ${artworks.length}, imgErr ${imgErr})`); persist(); }
    }
  }));
  persist();

  artworks.sort((x, y) => String(x.id).localeCompare(String(y.id)));
  const stem = MODE === 'probe' ? `${COLLECTION_STEM}-probe` : COLLECTION_STEM;
  writeCollection(artworks, stem);
  console.log(`\n[${MODE}] DONE. collected ${artworks.length} | img errors ${imgErr} | min4-drops ${drop4}`);
  if (MODE === 'probe') {
    const sample = artworks.slice(0, 6).map((w) => ({ id: w.id, cat: w.category, title: w.title.slice(0, 40), artist: w.artist.slice(0, 34), year: w.year, img: w.imageUrl }));
    console.log('[probe] sample:', JSON.stringify(sample, null, 2));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
