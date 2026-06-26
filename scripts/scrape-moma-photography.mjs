#!/usr/bin/env node
// MoMA (Museum of Modern Art, New York) — PHOTOGRAPHY collection scraper.
//
// SOURCE = MoMA's official open bulk metadata on GitHub (CC0 metadata):
//   github.com/MuseumofModernArt/collection → Artworks.csv (Git-LFS, ~73 MB).
//   Resolver URL (no auth, follows LFS): media.githubusercontent.com/media/MuseumofModernArt/collection/main/Artworks.csv
//   Columns used: Department, Classification, Date, BeginDate, Medium, Dimensions,
//                 Title, Artist, AccessionNumber, ObjectID, URL, ImageURL.
//   NOTE: the CSV has NO ThumbnailURL column — image availability is purely ImageURL non-blank.
//
// SCOPE — Photography department only, flat photographs:
//   * Department === "Photography"                          (33,826 works total)
//   * year >= 1920  (undated kept)                          — §1 photograph policy (pre-1920 out)
//   * ImageURL non-blank AND actually downloads             — ~19% of photos are rights-restricted
//                                                             (blank ImageURL) → skipped, no record.
//   In-scope (>=1920|undated, with non-blank ImageURL) ≈ 21.3k works (measured on the CSV).
//   category is the canonical lowercase "photograph" for every record.
//   min-4 (title/artist/year/category) enforced; records missing any are dropped (no Unknown filler).
//   The existing public/data/moma-collection.json ("moma-highlights": drawings/paintings/sculpture +
//   a 2024 photo subset, integer ids) is untouched; this is a NEW dedicated photography file with
//   slug-prefixed ids ("moma-photo-{ObjectID}") so it never collides in the recommendation index.
//
// Image: download MoMA media JPEG → webp (2048 / q85) via autocropToWebp (trim OFF by default) → R2.
//
// Usage:
//   node scripts/scrape-moma-photography.mjs --pilot   # <=30 works end-to-end (R2 uploads) → moma-photography-collection-pilot.json
//   node scripts/scrape-moma-photography.mjs --full    # all in-scope, resumable → moma-photography-collection.json
//   AUTOCROP_TRIM=1 node scripts/scrape-moma-photography.mjs --full   # opt-in white-margin trim (off by default)
// Resume state (--full): scripts/.state/moma-photography-progress.json ({done:{id:status}})
//   + scripts/.state/moma-photography-works.ndjson (append-only collected records)
//   failures → scripts/.state/moma-photography-failed.ndjson

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

const SLUG = 'moma-photography';
const COLLECTION_STEM = `${SLUG}-collection`;
const ID_PREFIX = 'moma-photo';
const CSV_URL = 'https://media.githubusercontent.com/media/MuseumofModernArt/collection/main/Artworks.csv';
const CSV_CACHE = '/tmp/moma/Artworks.csv';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const PROGRESS = path.join(STATE_DIR, `${SLUG}-progress.json`);
const WORKS_NDJSON = path.join(STATE_DIR, `${SLUG}-works.ndjson`);
const FAILED = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);
const MIN_YEAR = 1920;

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : 'pilot';
const PILOT_TARGET = 30;

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ---------- CSV ----------
async function ensureCsv() {
  if (fs.existsSync(CSV_CACHE) && fs.statSync(CSV_CACHE).size > 50_000_000) {
    console.log(`[csv] using cache ${CSV_CACHE} (${(fs.statSync(CSV_CACHE).size / 1e6).toFixed(1)} MB)`);
    return;
  }
  fs.mkdirSync(path.dirname(CSV_CACHE), { recursive: true });
  console.log(`[csv] downloading ${CSV_URL} …`);
  const r = await fetch(CSV_URL, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`CSV download HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(CSV_CACHE, buf);
  console.log(`[csv] saved ${(buf.length / 1e6).toFixed(1)} MB`);
}

// RFC-4180-ish parser: handles quoted fields, escaped "" and embedded newlines.
function parseCSV(text) {
  const rows = []; let row = []; let field = ''; let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const yearFrom = (date, begin) => {
  const m = String(date || '').match(/\b(1[5-9]\d\d|20[0-2]\d)\b/);
  if (m) return parseInt(m[1], 10);
  const b = parseInt(begin, 10);
  return (b && b > 1000 && b < 2030) ? b : null;
};

// CSV row → lite candidate (Photography, in scope, has image, min-4). Returns null otherwise.
function parseRow(r, I) {
  if ((r[I.dep] || '').trim() !== 'Photography') return null;
  const img = (r[I.img] || '').trim();
  if (!img) return null;                                  // rights-restricted / no image → out

  const date = (r[I.date] || '').trim();
  const year = yearFrom(date, r[I.begin]);
  if (year != null && year < MIN_YEAR) return null;       // pre-1920 out (undated kept)

  const title = (r[I.title] || '').trim();
  const artist = (r[I.artist] || '').trim();
  const objectId = (r[I.id] || '').trim();
  if (!title || !artist || year == null || !objectId) return null;  // min-4 + stable id

  return {
    id: `${ID_PREFIX}-${objectId}`,
    objectNumber: (r[I.acc] || '').trim(),
    title, artist, year, dateStr: date,
    medium: (r[I.med] || '').trim(),
    dimensions: (r[I.dim] || '').trim(),
    imageUrl: img,
    sourceUrl: (r[I.url] || '').trim() || `https://www.moma.org/collection/works/${objectId}`,
  };
}

function readCandidates() {
  const raw = fs.readFileSync(CSV_CACHE, 'utf8');
  const rows = parseCSV(raw);
  const H = rows[0].slice();
  if (H[0] && H[0].charCodeAt(0) === 0xFEFF) H[0] = H[0].slice(1);
  const col = {}; H.forEach((h, i) => { col[h] = i; });
  const I = {
    dep: col.Department, date: col.Date, begin: col.BeginDate, img: col.ImageURL,
    id: col.ObjectID, med: col.Medium, dim: col.Dimensions, title: col.Title,
    artist: col.Artist, url: col.URL, acc: col.AccessionNumber,
  };
  const out = [];
  let photoTotal = 0, photoBlank = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if ((r[I.dep] || '').trim() === 'Photography') {
      photoTotal++;
      if (!(r[I.img] || '').trim()) photoBlank++;
    }
    const c = parseRow(r, I);
    if (c) out.push(c);
  }
  // de-dupe by id (CSV is unique on ObjectID, but be safe)
  const seen = new Set(); const dedup = [];
  for (const c of out) { if (!seen.has(c.id)) { seen.add(c.id); dedup.push(c); } }
  console.log(`[csv] Photography total=${photoTotal} blankImage=${photoBlank} (${(100 * photoBlank / photoTotal).toFixed(1)}% rights-restricted)`);
  console.log(`[csv] in-scope candidates (>=${MIN_YEAR}|undated, has-image, min-4): ${dedup.length}`);
  return dedup;
}

// ---------- image: download → webp → R2 ----------
async function dl(url) {
  for (let att = 1; att <= 5; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const ct = r.headers.get('content-type') || '';
      const buf = Buffer.from(await r.arrayBuffer());
      if (ct.includes('text/html')) throw new Error('html (not an image)');
      if (buf.length < 5000) throw new Error(`tiny ${buf.length}b`);
      return buf;
    } catch (e) { if (att === 5) throw e; await sleep(600 * att); }
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
  const sharp = (await import('sharp')).default;
  const src = await dl(a.imageUrl);
  const meta = await sharp(src).metadata().catch(() => ({}));
  if (meta.width && Math.max(meta.width, meta.height) < 300) throw new Error(`too small ${meta.width}x${meta.height}`);
  const { buffer } = await autocropToWebp(src);          // trim OFF by default → pure webp(2048/q85)
  const key = `artworks/${COLLECTION_STEM}/${a.id}-${sha(a.imageUrl).slice(0, 8)}-imageUrl.webp`;
  await uploadR2(key, buffer);
  return `${R2_PUBLIC}/${key}`;
}

function toArtwork(a, imageUrl) {
  return {
    id: a.id,
    objectNumber: a.objectNumber || '',
    title: a.title,
    artist: a.artist,
    date: a.dateStr || String(a.year),
    year: a.year,
    medium: a.medium || '',
    dimensions: a.dimensions || '',
    category: 'photograph',
    description: '',
    imageUrl,
    thumbnailUrl: '',
    onDisplay: false,
    displayLocation: '',
    sourceUrl: a.sourceUrl,
    metadata: { department: 'Photography', license: 'CC0 (metadata)', source: 'MoMA GitHub Artworks.csv' },
    original_imageUrl: a.imageUrl,
  };
}

function writeCollection(artworks, file) {
  const payload = {
    museum: 'The Museum of Modern Art',
    collection: 'Photography',
    website: 'https://www.moma.org/collection/',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'github-bulk-csv',
    license: 'CC0 (metadata)',
    artworks,
  };
  const out = path.join(REPO, 'public/data', file);
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
  console.log(`[write] ${out} (${artworks.length} works)`);
}

// ---------- progress (full mode) ----------
function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS, 'utf8')); } catch { return { done: {} }; }
}
function loadWorks() {
  const works = [];
  try { for (const l of fs.readFileSync(WORKS_NDJSON, 'utf8').split('\n')) { const s = l.trim(); if (s) works.push(JSON.parse(s)); } } catch { /* none */ }
  return works;
}

async function runQueue(candidates, { onWork, progress, saveEvery = 200 }) {
  const CONC = 4, STAGGER = 250;                          // ≈ a few rps against moma.org media
  let idx = 0, done = 0, ok = 0, err = 0, dirty = 0;
  const saveProgress = () => { if (progress) fs.writeFileSync(PROGRESS, JSON.stringify(progress)); };
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (idx < candidates.length) {
      const a = candidates[idx++];
      await sleep(STAGGER);
      try {
        const imageUrl = await processImage(a);
        ok++;
        onWork(toArtwork(a, imageUrl));
        if (progress) progress.done[a.id] = 'ok';
      } catch (e) {
        err++;
        if (progress) progress.done[a.id] = 'fail';
        fs.appendFileSync(FAILED, JSON.stringify({ id: a.id, url: a.imageUrl, err: String(e.message || e) }) + '\n');
        if (err <= 8) console.log(`  img err id=${a.id}: ${e.message}`);
      }
      if (progress && ++dirty >= saveEvery) { dirty = 0; saveProgress(); }
      if (++done % 100 === 0) console.log(`  …${done}/${candidates.length} (ok ${ok}, err ${err})`);
    }
  }));
  if (progress) saveProgress();
  return { ok, err };
}

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  await ensureCsv();
  const candidates = readCandidates();

  if (MODE === 'pilot') {
    console.log(`[pilot] processing first ${PILOT_TARGET * 2} candidates until ${PILOT_TARGET} works collected …`);
    const works = [];
    const need = candidates.slice(0, PILOT_TARGET * 2);   // headroom for occasional image failures
    await runQueue(need, { onWork: (w) => { if (works.length < PILOT_TARGET) works.push(w); } });
    writeCollection(works.slice(0, PILOT_TARGET), `${COLLECTION_STEM}-pilot.json`);
    console.log(`[pilot] DONE. collected ${works.length} works.`);
    return;
  }

  // ---- full ----
  const progress = loadProgress();
  const works = loadWorks();
  const have = new Set(works.map((w) => w.id));
  const todo = candidates.filter((c) => !progress.done[c.id] && !have.has(c.id));
  console.log(`[full] resume: ${works.length} already collected, ${Object.keys(progress.done).length} marked done → ${todo.length} to process`);

  const r = await runQueue(todo, {
    onWork: (w) => { works.push(w); fs.appendFileSync(WORKS_NDJSON, JSON.stringify(w) + '\n'); },
    progress,
  });

  works.sort((x, y) => String(x.id).localeCompare(String(y.id)));
  writeCollection(works, `${COLLECTION_STEM}.json`);
  console.log(`[full] DONE. collected ${works.length} | errors ${r.err}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
