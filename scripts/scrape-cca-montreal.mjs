#!/usr/bin/env node
// Canadian Centre for Architecture (CCA), Montréal — collection scraper.
// Source: museum-OWN Elasticsearch-backed search XHR (no auth). The /en/search page is
//   JS-driven; adding header `X-Requested-With: XMLHttpRequest` makes it return JSON:
//     GET https://www.cca.qc.ca/en/search?query=&filters=<json>&img_filter=1&page=<N>
//   → { search_obj: { results: { hits: { hits: [ { _id, _source } ], total } }, paging } }
//   Page size = 40 when img_filter=1. `img_filter=1` (top-level GET param, NOT in filters JSON)
//   restricts to records that HAVE a digitized image (images[] populated). The `filters` param
//   is URL-encoded JSON: {"forms_collection_library_bookstore":["drawings"]} scopes by form.
//
// SCOPE: flat works only — architectural DRAWINGS, plans, renderings, sketches, architectural
//   PHOTOGRAPHS, graphic materials (prints), maps, and flat works of art. 3D OUT.
//   Form → category (lowercase enum): drawings→drawing, photographs→photograph,
//   graphic materials→print, maps→drawing, works of art→painting. We deliberately SKIP the
//   forms archives/artefacts/models/books/audio/video/textual/born-digital (3D / AV / library).
//
// Image: _source.images[0].formats — pre-signed thumbor URLs on cca.qc.ca/img-collection.
//   We pick the largest available (xlarge 1920 → large 1400 → normal 1200), all >= 600px.
//   original.{width,height} gives the true master dimensions.
//
// Metadata (detail-record fields, TMS-derived):
//   title  = Titles.ValueEN || Titles.ValueFR
//   artist = constituents[] (architect/draughtsman/photographer/archive-creator), de-duped, "; " joined
//   date   = Dated  (e.g. "1977?", "circa 1947", "1974")
//   year   = first 4-digit run in Dated
//   medium = Medium ; dimensions = Dimensions ; objectNumber = ObjectNumber
//   sourceUrl = https://www.cca.qc.ca/en/search/details/collection/object/{ObjectID}
//
// >25k in-scope → PRIORITIZE named+dated (records that pass min-4) and CAP the JSON < 23MB,
//   COMPACT (JSON.stringify with no indent). Resumable per (form,page) checkpoint.
//
// Usage:
//   node scripts/scrape-cca-montreal.mjs --probe   # ~15 in-scope works end-to-end + R2, write probe JSON
//   node scripts/scrape-cca-montreal.mjs --full     # all in-scope, resumable, capped <23MB

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const REPO = path.resolve(fileURLToPath(import.meta.url), '../..');
require('dotenv').config({ path: path.join(REPO, '.env.local') });
const sharp = require('sharp');

const SLUG = 'cca-montreal';
const COLLECTION_STEM = `${SLUG}-collection`;
const ORIGIN = 'https://www.cca.qc.ca';
const SEARCH = `${ORIGIN}/en/search`;
const UA = 'armin-museum-research/1.0';
const UA_BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const PROGRESS = path.join(STATE_DIR, `${SLUG}-progress.json`);
const FAILED = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : 'probe';
const PROBE_TARGET = 15;
const PAGE_SIZE = 40;                       // server returns 40/page with img_filter=1
const SIZE_CAP_BYTES = 23 * 1024 * 1024;    // < 23MB compact JSON

// Form → category. Order = collection priority (drawings & photographs are the heart of CCA).
const FORMS = [
  { form: 'drawings', category: 'drawing' },
  { form: 'photographs', category: 'photograph' },
  { form: 'works of art', category: 'painting' },
  { form: 'graphic materials', category: 'print' },
  { form: 'maps', category: 'drawing' },
];

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const clean = (s) => (s == null ? '' : String(s)).replace(/\s+/g, ' ').trim();

// ---------- fetch layer ----------
async function fetchJson(form, page, attempt = 1) {
  const filters = encodeURIComponent(JSON.stringify({ forms_collection_library_bookstore: [form] }));
  const url = `${SEARCH}?query=&filters=${filters}&img_filter=1&page=${page}`;
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': attempt === 1 ? UA : UA_BROWSER, 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    // NOTE: the XHR endpoint serves JSON but mislabels it as text/html — trust the body, not the header.
    const txt = await r.text();
    let j;
    try { j = JSON.parse(txt); } catch { throw new Error(`non-json body (${txt.slice(0, 60)})`); }
    if (!j || !j.search_obj) throw new Error('missing search_obj');
    return j;
  } catch (e) {
    if (attempt >= 3) throw e;
    await sleep(800 * attempt);
    return fetchJson(form, page, attempt + 1);
  }
}

function hitsOf(j) {
  const h = j && j.search_obj && j.search_obj.results && j.search_obj.results.hits;
  return { list: (h && h.hits) || [], total: (h && h.total && h.total.value) || 0 };
}

// ---------- record → ARMIN artwork (parse detail _source) ----------
// Prefer creative roles; fall back to any constituent. De-dupe by name preserving order.
const ROLE_RANK = { architect: 0, draughtsman: 0, designer: 0, photographer: 0, artist: 0, 'archive creator': 2 };
function pickArtists(constituents) {
  if (!Array.isArray(constituents) || !constituents.length) return '';
  const sorted = [...constituents].sort((a, b) => {
    const ra = ROLE_RANK[(a.Role || '').toLowerCase()] ?? 1;
    const rb = ROLE_RANK[(b.Role || '').toLowerCase()] ?? 1;
    if (ra !== rb) return ra - rb;
    return (a.DisplayOrder ?? 99) - (b.DisplayOrder ?? 99);
  });
  const seen = new Set();
  const names = [];
  for (const c of sorted) {
    const n = clean(c.Name);
    if (!n || n.toLowerCase() === 'unknown') continue;
    const k = n.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    names.push(n);
  }
  return names.join('; ');
}

function bestImage(images) {
  if (!Array.isArray(images) || !images.length) return null;
  const f = images[0].formats || {};
  const pick = f.xlarge || f.large || f.normal || f.medium || f.small;
  if (!pick || !pick.url) return null;
  const orig = f.original || {};
  return { url: ORIGIN + pick.url, w: pick.width || orig.width || null, h: pick.height || orig.height || null };
}

function parseRecord(hit, category) {
  const s = hit._source || {};
  const objId = s.ObjectID != null ? String(s.ObjectID) : String(hit._id || '');
  const T = s.Titles || {};
  const title = clean(T.ValueEN || T.ValueFR);
  const artist = pickArtists(s.constituents);
  const dateStr = clean(s.Dated);
  const ym = dateStr.match(/\d{4}/);
  const year = ym ? parseInt(ym[0], 10) : null;
  const img = bestImage(s.images);
  return {
    id: objId,
    objectNumber: clean(s.ObjectNumber),
    title,
    artist,
    dateStr,
    year,
    medium: clean(s.Medium),
    dimensions: clean(s.Dimensions),
    category,
    description: clean(s.Description),
    img,
    sourceUrl: `${ORIGIN}/en/search/details/collection/object/${objId}`,
  };
}

// min-4 guard (title, artist, year, category). Image required.
function eligible(a) {
  return !!(a.title && a.artist && a.year != null && a.category && a.img && a.img.url);
}

// ---------- image: download largest, verify >=600px, webp, upload to R2 ----------
async function dl(url) {
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': att === 1 ? UA : UA_BROWSER } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 5000) throw new Error(`tiny ${buf.length}b`);
      return buf;
    } catch (e) { if (att === 3) throw e; await sleep(500 * att); }
  }
}

async function uploadR2(key, body) {
  for (let att = 1; att <= 4; att++) {
    try {
      await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: body, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000' }));
      return true;
    } catch (e) { if (att === 4) throw e; await sleep(400 * att); }
  }
}

async function processImage(a) {
  const src = await dl(a.img.url);
  const meta = await sharp(src).metadata().catch(() => ({}));
  if (meta.width && Math.max(meta.width, meta.height) < 600) throw new Error(`small ${meta.width}x${meta.height}`);
  // drawings/photographs are NEVER colour-gated (guide §1): no grayscale skip. Plain webp, max long side 2048.
  const webp = await sharp(src)
    .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();
  const hash8 = sha(a.img.url).slice(0, 8);
  const key = `artworks/${COLLECTION_STEM}/${a.id}-${hash8}-imageUrl.webp`;
  await uploadR2(key, webp);
  return { imageUrl: `${R2_PUBLIC}/${key}`, srcW: meta.width || a.img.w, srcH: meta.height || a.img.h };
}

function toArtwork(a, imageUrl) {
  return {
    id: a.id,
    objectNumber: a.objectNumber,
    title: a.title,
    artist: a.artist,
    date: a.dateStr || (a.year != null ? String(a.year) : ''),
    year: a.year,
    medium: a.medium,
    dimensions: a.dimensions,
    category: a.category,
    description: a.description,
    imageUrl,
    thumbnailUrl: a.img.url,
    onDisplay: false,
    displayLocation: '',
    sourceUrl: a.sourceUrl,
    metadata: { objectId: a.id },
    original_imageUrl: a.img.url,
  };
}

function writeCollection(artworks, stem) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'Canadian Centre for Architecture',
    collection: 'Collection',
    website: 'https://www.cca.qc.ca/en/collection',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'api',
    category_breakdown: cats,
    artworks,
  };
  const out = path.join(REPO, 'public/data', `${stem}.json`);
  // COMPACT for full (size cap); pretty for probe (human inspection).
  fs.writeFileSync(out, stem.endsWith('-probe') ? JSON.stringify(payload, null, 2) : JSON.stringify(payload));
  const mb = (fs.statSync(out).size / 1024 / 1024).toFixed(2);
  console.log(`[write] ${out} (${artworks.length} works, ${mb}MB) breakdown=`, cats);
  return out;
}

// ---------- progress ----------
function loadProgress() { try { return JSON.parse(fs.readFileSync(PROGRESS, 'utf8')); } catch { return { done: {} }; } }
function saveProgress(p) { fs.writeFileSync(PROGRESS, JSON.stringify(p)); }

// ---------- probe: ~15 works end-to-end across the two main forms ----------
async function runProbe() {
  console.log('[probe] fetching candidates …');
  const cands = [];
  for (const { form, category } of FORMS) {
    if (cands.length >= PROBE_TARGET) break;
    const j = await fetchJson(form, 0);
    const { list, total } = hitsOf(j);
    console.log(`  form=${form} digitized_total=${total} page0=${list.length}`);
    for (const hit of list) {
      const a = parseRecord(hit, category);
      if (eligible(a)) cands.push(a);
      if (cands.length >= PROBE_TARGET) break;
    }
    await sleep(400);
  }
  console.log(`[probe] ${cands.length} eligible candidates → R2 …`);
  const artworks = [];
  for (const a of cands) {
    try {
      const { imageUrl, srcW, srcH } = await processImage(a);
      artworks.push(toArtwork(a, imageUrl));
      console.log(`  ok ${a.id} ${srcW}x${srcH} "${a.title.slice(0, 48)}" — ${a.artist.slice(0, 32)} (${a.year})`);
    } catch (e) {
      console.log(`  IMG ERR ${a.id}: ${e.message}`);
      fs.appendFileSync(FAILED, JSON.stringify({ id: a.id, url: a.img && a.img.url, err: String(e.message || e) }) + '\n');
    }
    await sleep(250);
  }
  writeCollection(artworks, `${COLLECTION_STEM}-probe`);
  const ok = artworks.length;
  console.log(`\n[probe] DONE ${ok}/${PROBE_TARGET} works with live R2 images.`);
  if (ok < 10) { console.error('[probe] FAIL: <10 works produced.'); process.exit(1); }
  console.log('[probe] PASS');
}

// ---------- full: all in-scope, resumable, capped <23MB ----------
async function runFull() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const progress = loadProgress();
  progress.done = progress.done || {};
  // resume already-collected artworks if present
  const outPath = path.join(REPO, 'public/data', `${COLLECTION_STEM}.json`);
  let artworks = [];
  const seen = new Set();
  if (fs.existsSync(outPath)) {
    try { artworks = JSON.parse(fs.readFileSync(outPath, 'utf8')).artworks || []; } catch {}
    for (const w of artworks) seen.add(w.id);
    console.log(`[full] resume: ${artworks.length} artworks already on disk`);
  }

  const CONC = 4;
  let capped = false;

  for (const { form, category } of FORMS) {
    if (capped) break;
    const j0 = await fetchJson(form, 0);
    const { total } = hitsOf(j0);
    const pages = Math.ceil(total / PAGE_SIZE);
    console.log(`[full] form=${form} digitized_total=${total} pages=${pages}`);
    const startPage = progress.done[form] || 0;

    for (let page = startPage; page < pages; page++) {
      if (capped) break;
      let list;
      try { ({ list } = hitsOf(page === 0 ? j0 : await fetchJson(form, page))); }
      catch (e) { console.log(`  page ${page} fetch err: ${e.message}`); fs.appendFileSync(FAILED, JSON.stringify({ form, page, err: String(e.message) }) + '\n'); continue; }

      const cands = list.map((h) => parseRecord(h, category)).filter((a) => eligible(a) && !seen.has(a.id));
      for (const a of cands) seen.add(a.id);

      let idx = 0;
      await Promise.all(Array.from({ length: CONC }, async () => {
        while (idx < cands.length) {
          const a = cands[idx++];
          try { const { imageUrl } = await processImage(a); artworks.push(toArtwork(a, imageUrl)); }
          catch (e) { fs.appendFileSync(FAILED, JSON.stringify({ id: a.id, url: a.img && a.img.url, err: String(e.message) }) + '\n'); }
        }
      }));

      progress.done[form] = page + 1;
      if (page % 10 === 0 || page === pages - 1) {
        const mb = Buffer.byteLength(JSON.stringify({ artworks })) / 1024 / 1024;
        console.log(`  …${form} page ${page + 1}/${pages} | total artworks ${artworks.length} | ~${mb.toFixed(1)}MB`);
        writeCollection(artworks, COLLECTION_STEM);
        saveProgress(progress);
        if (Buffer.byteLength(JSON.stringify({ artworks })) > SIZE_CAP_BYTES) {
          console.log(`[full] reached <23MB cap at ${artworks.length} works — stopping (named+dated prioritized).`);
          capped = true;
        }
      }
    }
  }

  // final write + sort by id for stable diffs
  artworks.sort((a, b) => Number(a.id) - Number(b.id));
  writeCollection(artworks, COLLECTION_STEM);
  saveProgress(progress);
  console.log(`\n[full] DONE — ${artworks.length} works.`);
}

(MODE === 'full' ? runFull() : runProbe()).catch((e) => { console.error(e); process.exit(1); });
