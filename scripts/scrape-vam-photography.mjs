#!/usr/bin/env node
// V&A (Victoria & Albert Museum) — Photography collection scraper
// Source: clean public V2 API https://api.vam.ac.uk/v2
//   - Listing/pagination: /objects/search?id_category=THES48910 (=Photographs)
//                         &images_exist=true&year_made_from=1920
//   - Full metadata per object (detail-page completeness): /object/{systemNumber}
//   - IIIF images: {_iiif_image_base_url}full/!2048,2048/0/default.jpg
//
// Usage:
//   node scripts/scrape-vam-photography.mjs --pilot [--limit=30]   # small validation sample
//   node scripts/scrape-vam-photography.mjs --full                 # everything (resumable)
//   node scripts/scrape-vam-photography.mjs --count                # just print in-scope total & exit
//
// Resumable: page cursor + collected ids checkpointed to scripts/.state/vam-photography-progress.json.
// Re-running --full resumes from the last completed page and skips R2 objects already present.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config({ path: path.resolve(fileURLToPath(import.meta.url), '../../.env.local') });

// ---- config ----
const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const PILOT = process.argv.includes('--pilot');
const FULL = process.argv.includes('--full');
const COUNT_ONLY = process.argv.includes('--count');
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='));
const PILOT_LIMIT = LIMIT_ARG ? Number(LIMIT_ARG.split('=')[1]) : 30;

const STEM = PILOT ? 'vam-photography-collection-pilot' : 'vam-photography-collection';
const OUT_JSON = `public/data/${STEM}.json`;
const STATE_DIR = path.join(REPO_ROOT, 'scripts/.state');
const PROGRESS_FILE = path.join(STATE_DIR, 'vam-photography-progress.json');
const FAILED_FILE = path.join(STATE_DIR, 'vam-photography-failed.ndjson');

const UA = 'Mozilla/5.0 (compatible; armin-museum-research/1.0; +collection-research)';
const API = 'https://api.vam.ac.uk/v2';
const CATEGORY_ID = 'THES48910';   // "Photographs" — 108,736 records (≥1920 + images → ~33.5k)
const YEAR_FROM = 1920;
const PAGE_SIZE = 100;             // API max page_size
const ITEM_BASE = 'https://collections.vam.ac.uk/item';

const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const hash8 = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 8);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- HTTP with retry ----
async function fetchJson(url, tries = 4) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw new Error(`HTTP ${res.status} (no-retry)`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (String(e.message).includes('no-retry')) break;
      await sleep(800 * (i + 1));
    }
  }
  throw lastErr;
}

// ---- metadata helpers ----
// Extract earliest 4-digit year from a free-text date string ("1919 to 1921", "ca. 1929", "1919-1926").
function parseYear(dateStr, productionDates) {
  // Prefer structured productionDates.earliest if present (full record only).
  if (Array.isArray(productionDates)) {
    for (const pd of productionDates) {
      const e = pd?.date?.earliest;
      if (e) { const m = String(e).match(/(\d{4})/); if (m) return Number(m[1]); }
    }
  }
  if (!dateStr) return null;
  const m = String(dateStr).match(/(\d{4})/);
  return m ? Number(m[1]) : null;
}

// Build a human-readable dimensions string from the structured dimensions[] array.
// Prefer the object's own measurements over "frame"/"mount" parts.
function formatDimensions(dims) {
  if (!Array.isArray(dims) || dims.length === 0) return '';
  const parts = dims.filter(d => !d.part || /^(object|image|sheet|print|photograph)/i.test(d.part));
  const use = parts.length ? parts : dims;
  const seen = new Set();
  const out = [];
  for (const d of use) {
    if (!d.dimension || d.value == null) continue;
    const key = d.dimension + (d.part || '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(`${d.dimension} ${d.value} ${d.unit || ''}`.trim() + (d.part ? ` (${d.part})` : ''));
  }
  return out.join(' × ');
}

function primaryMakerName(rec) {
  // summary record: _primaryMaker.name ; full record: artistMakerPerson[0].name.text
  if (rec._primaryMaker?.name) return rec._primaryMaker.name;
  const ppl = rec.artistMakerPerson || rec.artistMakerPeople;
  if (Array.isArray(ppl) && ppl.length) {
    return ppl.map(p => p?.name?.text || p?.name).filter(Boolean).join('; ');
  }
  return '';
}

// ---- R2 ----
async function r2Exists(key) {
  try { await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key })); return true; }
  catch { return false; }
}
async function r2Upload(key, buf) {
  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET, Key: key, Body: buf,
    ContentType: 'image/webp', CacheControl: 'public, max-age=31536000',
  }));
}
async function downloadImage(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
  if (!res.ok) throw new Error(`img HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 2048) throw new Error(`tiny image: ${buf.length}B`);
  return buf;
}

// ---- state ----
function loadProgress() {
  if (FULL && fs.existsSync(PROGRESS_FILE)) {
    try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')); } catch {}
  }
  return { nextPage: 1, ids: [] };
}
function saveProgress(p) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p));
}
function appendFailed(rec) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.appendFileSync(FAILED_FILE, JSON.stringify(rec) + '\n');
}

// ---- search listing ----
function searchUrl(page) {
  const qs = new URLSearchParams({
    id_category: CATEGORY_ID,
    images_exist: '1',
    year_made_from: String(YEAR_FROM),
    page_size: String(PAGE_SIZE),
    page: String(page),
  });
  return `${API}/objects/search?${qs}`;
}

async function getTotalCount() {
  const j = await fetchJson(`${API}/objects/search?` + new URLSearchParams({
    id_category: CATEGORY_ID, images_exist: '1', year_made_from: String(YEAR_FROM), page_size: '1',
  }));
  return { records: j.info.record_count, exact: j.info.record_count_exact, images: j.info.image_count };
}

// Process a single summary record → full record fetch → R2 → artwork object. Returns null on skip.
async function processRecord(summary, existingById) {
  const sysNo = summary.systemNumber;
  if (existingById.has(sysNo)) return existingById.get(sysNo);

  const imgBase = summary._images?._iiif_image_base_url;
  if (!imgBase) { appendFailed({ id: sysNo, reason: 'no-iiif-base' }); return null; }

  // Detail-page completeness: pull the full object record for medium/dimensions/description.
  let full = {};
  try { full = (await fetchJson(`${API}/object/${sysNo}`)).record || {}; }
  catch (e) { appendFailed({ id: sysNo, reason: `detail-fetch:${e.message}` }); /* fall back to summary */ }

  const title = (full.titles?.[0]?.title) || summary._primaryTitle || 'Untitled';
  const artist = primaryMakerName(full.systemNumber ? full : summary) || '';
  const dateStr = summary._primaryDate || full.productionDates?.[0]?.date?.text || '';
  const year = parseYear(dateStr, full.productionDates);
  const medium = full.materialsAndTechniques || '';
  const dimensions = formatDimensions(full.dimensions);
  const description = full.briefDescription || full.summaryDescription || '';

  // 4-required gate: title, artist, year, category. Skip if missing artist or year (no dummies).
  if (!artist || !title) { appendFailed({ id: sysNo, reason: `missing-required artist=${!!artist} title=${!!title}` }); return null; }
  // year ≥1920 already enforced by query; keep undated (year null) per guide ("undated OK to keep")
  // — but the API year filter excludes truly undated records, so year is virtually always present here.

  const srcImg = `${imgBase}full/!2048,2048/0/default.jpg`;
  const key = `artworks/${STEM}/${sysNo}-${hash8(srcImg)}-imageUrl.webp`;
  try {
    if (!await r2Exists(key)) {
      const buf = await downloadImage(srcImg);
      const webp = await sharp(buf, { limitInputPixels: false })
        .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 }).toBuffer();
      await r2Upload(key, webp);
    }
  } catch (e) {
    appendFailed({ id: sysNo, reason: `image:${e.message}`, src: srcImg });
    return null;
  }

  return {
    id: sysNo,                       // V&A system number — globally stable; prefixed to vam-photography-* in Phase F-0
    objectNumber: summary.accessionNumber || full.accessionNumber || sysNo,
    title,
    artist,
    date: dateStr || (year ? String(year) : null),
    year,
    medium,
    dimensions,
    category: 'photograph',
    description,
    imageUrl: `${R2_PUBLIC}/${key}`,
    thumbnailUrl: summary._images?._primary_thumbnail || `${imgBase}full/!300,300/0/default.jpg`,
    onDisplay: !!summary._currentLocation?.onDisplay,
    displayLocation: summary._currentLocation?.onDisplay ? (summary._currentLocation.displayName || '') : '',
    sourceUrl: `${ITEM_BASE}/${sysNo}/`,
    metadata: {
      iiif_manifest: summary._images?._iiif_presentation_url || '',
      objectType: summary.objectType || full.objectType || '',
    },
    original_imageUrl: srcImg,
  };
}

async function main() {
  const total = await getTotalCount();
  console.log(`[vam] in-scope (Photographs, images, year≥${YEAR_FROM}): records=${total.records} (exact=${total.exact}), image_assets=${total.images}`);
  if (COUNT_ONLY) return;

  if (!PILOT && !FULL) {
    console.error('Specify --pilot or --full (or --count). Refusing to run ambiguously.');
    process.exit(2);
  }

  const progress = loadProgress();
  // resume existing artworks (full mode) so we don't re-process
  const existingById = new Map();
  const artworks = [];
  if (FULL && fs.existsSync(path.join(REPO_ROOT, OUT_JSON))) {
    try {
      const prev = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, OUT_JSON), 'utf8'));
      for (const a of (prev.artworks || [])) { existingById.set(a.id, a); artworks.push(a); }
      console.log(`[vam] resumed ${artworks.length} existing artworks; next page=${progress.nextPage}`);
    } catch {}
  }

  const targetCount = PILOT ? PILOT_LIMIT : Infinity;
  let page = PILOT ? 1 : progress.nextPage;
  let done = false;

  while (!done) {
    let listing;
    try { listing = await fetchJson(searchUrl(page)); }
    catch (e) { console.error(`[vam] page ${page} listing failed: ${e.message}`); break; }

    const recs = listing.records || [];
    if (recs.length === 0) { console.log('[vam] no more records.'); break; }

    for (const summary of recs) {
      if (artworks.length >= targetCount) { done = true; break; }
      const art = await processRecord(summary, existingById);
      if (art && !existingById.has(art.id)) { artworks.push(art); existingById.set(art.id, art); }
      await sleep(120); // ~8 req/s incl. detail fetch — polite
    }

    console.log(`[vam] page ${page} done · collected=${artworks.length}${PILOT ? `/${targetCount}` : ''}`);

    if (FULL) { progress.nextPage = page + 1; saveProgress(progress); writeOut(artworks); }
    const pages = listing.info?.pages || 0;
    if (page >= pages) { console.log('[vam] reached last page.'); break; }
    page++;
  }

  writeOut(artworks);
  reportCoverage(artworks);
}

function writeOut(artworks) {
  const out = {
    museum: 'Victoria and Albert Museum',
    collection: 'Photography',
    website: 'https://collections.vam.ac.uk/search/?id_category=THES48910',
    source: 'V&A V2 API (api.vam.ac.uk/v2) — search + per-object detail; IIIF images',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'api',
    artworks,
  };
  fs.writeFileSync(path.join(REPO_ROOT, OUT_JSON), JSON.stringify(out, null, 2));
}

function reportCoverage(artworks) {
  const n = artworks.length || 1;
  const cov = k => artworks.filter(a => a[k] && (typeof a[k] === 'string' ? a[k].trim().length : true)).length;
  console.log(`\n[vam] wrote ${OUT_JSON} (${artworks.length} artworks)`);
  console.log(`[vam] coverage: title ${cov('title')}/${n}  artist ${cov('artist')}/${n}  year ${artworks.filter(a => a.year).length}/${n}  medium ${cov('medium')}/${n}  dimensions ${cov('dimensions')}/${n}`);
  console.log(`[vam] sample:`);
  for (const a of artworks.slice(0, 5)) {
    console.log(`   • "${a.title}" — ${a.artist} (${a.year}) [${a.medium || 'no-medium'}]`);
    console.log(`     ${a.imageUrl}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
