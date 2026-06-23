#!/usr/bin/env node
// Letterform Archive — Online Archive (San Francisco) collection scraper.
// GENRE: 포스터 / graphic design / lettering / type specimens — entirely in-scope (flat 2D).
//
// Source: museum-OWN API on oa.letterformarchive.org (Websy platform). NO login required —
//   the server sets a GUEST session cookie (`X-Online-Archive`) on the first GET /, and that
//   cookie + a same-origin Referer authorize the image + search endpoints. (Without the cookie
//   the image route returns "Not allowed"; with it, full-res JPEGs download fine.)
//
//   • LIST   GET /search/items?where=queryid:results0
//            → { rowCount, rows:[{ workid, itempage, img_thumb, title, decade,
//                                   measurements_h, measurements_w, all_creators,
//                                   img_mid_width/height, searchtext }] }
//            Returns the ENTIRE curated public set (~3,654 "Full Records") in ONE response;
//            offset/limit are ignored server-side, so there is no pagination.
//   • DETAIL GET /search/item/{workid}
//            → rows[0]: { title, measurements ("61 x 40 cm"), date_txt ("2013"|"ca.1955"|
//                         "Unknown"), decade, description, rights, img_front_full (FULL-res,
//                         no _mid), images[], attributes[0]{format,discipline,technique,
//                         material,country,language,typeface}, people[]{name,involvement,role} }
//   • IMAGE  GET /oaapi/image/{workid}/{basename}        → FULL res (up to ~7000px long edge)
//            GET /oaapi/image/mid/{workid}/{basename}     → 800px long edge
//            (basename = img_front_full filename without extension, lowercased)
//
// SCOPE: every record is flat graphic design — classify into category by attributes.format +
//   .discipline + workid prefix. NOT colour-gated (posters/design/lettering are never
//   grayscale-filtered; only reproductive `print`s are, and those are kept here too).
//   Image availability is ~100% across the set (30/30 random sampled OK); a few legacy
//   records 404 on the CDN → logged to failed.ndjson and skipped.
//
// Usage:
//   node scripts/scrape-letterform-archive.mjs --probe   # ~15 in-scope works end-to-end + R2
//   node scripts/scrape-letterform-archive.mjs --full     # all in-scope, resumable

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

const SLUG = 'letterform-archive';
const COLLECTION_STEM = `${SLUG}-collection`;
const BASE = 'https://oa.letterformarchive.org';
const LIST_URL = `${BASE}/search/items?where=queryid:results0`;
// Guest cookie + browser UA + same-origin Referer are all required for the image endpoint.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const PROGRESS = path.join(STATE_DIR, `${SLUG}-progress.json`);
const FAILED = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : 'probe';
const PROBE_TARGET = 15;
const CONC = 4;

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const clean = (s) => (s == null ? '' : String(s)).replace(/\s+/g, ' ').trim();

// ---------- guest session ----------
let COOKIE = '';
async function initSession() {
  const r = await fetch(`${BASE}/`, { headers: { 'User-Agent': UA } });
  const setc = r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')].filter(Boolean);
  COOKIE = setc.map((c) => String(c).split(';')[0]).filter(Boolean).join('; ');
  if (!COOKIE) throw new Error('no guest cookie set by GET /');
  console.log(`[session] guest cookie acquired (${COOKIE.split('=')[0]})`);
}
function authHeaders(extra = {}) {
  return { 'User-Agent': UA, Cookie: COOKIE, Referer: `${BASE}/`, ...extra };
}

async function getJson(url, attempts = 3) {
  for (let att = 1; att <= attempts; att++) {
    try {
      const r = await fetch(url, { headers: authHeaders({ Accept: 'application/json' }) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) { if (att === attempts) throw e; await sleep(400 * att); }
  }
}

// ---------- category classifier ----------
// Maps (format, discipline, workid-prefix) → ARMIN category. Everything is flat 2D graphic
// design; default bucket is mixed_media_2d. Only ~specific signals override it.
function classify({ workid, format, discipline, searchtext }) {
  const f = (format || '').toLowerCase();
  const d = (discipline || '').toLowerCase();
  const st = (searchtext || '').toLowerCase();
  const p = workid.replace(/_\d+$/, '');
  const has = (re, ...ss) => ss.some((s) => re.test(s));

  if (p === 'lfa_posters' || /\bposter\b/.test(f) || /\bposter\b/.test(d)) return 'poster';
  if (/calligraph/.test(d) || /calligraph|writing\s*manual/.test(st) || p === 'lfa_calligraphy' || p === 'lfa_writingmanuals') return 'calligraphy';
  if (/\bphotograph/.test(f) || /\bphotograph/.test(d)) return 'photograph';
  if (has(/\bdrawing|\bsketch/, f, d)) return 'drawing';
  if (/\bpainting\b/.test(f) || /\bpainting\b/.test(d)) return 'painting';
  // reproductive print techniques (kept; LFA prints are design objects, not low-value repros)
  if (/letterpress|lithograph|chromolith|screen\s?print|serigraph|engrav|intaglio|woodcut|linocut|offset\s?print|\bprinting\b/.test(st)) return 'print';
  // everything else (graphic design, lettering, type specimens, ephemera, book jackets, …)
  return 'mixed_media_2d';
}

// ---------- detail record → ARMIN artwork fields ----------
function pickYear(date_txt, decade) {
  const m = clean(date_txt).match(/\b(1[0-9]{3}|20[0-2][0-9])\b/);
  if (m) return parseInt(m[0], 10);
  const dm = clean(decade).match(/\b(1[0-9]{3}|20[0-2][0-9])\b/); // "1950s" → 1950
  if (dm) return parseInt(dm[0], 10);
  return null;
}

function creatorsFrom(detailPeople, listCreators) {
  const names = (detailPeople || [])
    .filter((x) => x && x.name && !/^(unattributed|unknown|-)$/i.test(String(x.name).trim()))
    .map((x) => clean(x.name));
  if (names.length) return [...new Set(names)].join('; ');
  const fb = clean(listCreators);
  if (fb && !/^(unattributed|unknown|-)$/i.test(fb)) return fb;
  return '';
}

// img_front_full = "full/{workid}/{basename}.jpg" → image URL /oaapi/image/{workid}/{basename}
function imageUrlFromPath(workid, imgPath) {
  if (!imgPath) return null;
  const base = imgPath.split('/').pop().replace(/\.[a-z0-9]+$/i, '').toLowerCase();
  return `${BASE}/oaapi/image/${workid}/${base}`;
}

async function buildRecord(listRow) {
  const workid = listRow.workid;
  const detail = await getJson(`${BASE}/search/item/${encodeURIComponent(workid)}`);
  const d = detail && detail.rows && detail.rows[0];
  if (!d) throw new Error('no detail row');
  const attr = (d.attributes && d.attributes[0]) || {};
  const title = clean(d.title) || clean(listRow.title);
  const artist = creatorsFrom(d.people, listRow.all_creators);
  const year = pickYear(d.date_txt, d.decade || listRow.decade);
  const category = classify({ workid, format: attr.format, discipline: attr.discipline, searchtext: listRow.searchtext });
  const dimensions = clean(d.measurements) ||
    ([listRow.measurements_h, listRow.measurements_w].filter(Boolean).length
      ? `${clean(listRow.measurements_h)} x ${clean(listRow.measurements_w)} cm` : '');
  // medium ← technique/material/format (best available descriptor)
  const medium = [clean(attr.technique), clean(attr.material)].filter(Boolean).join('; ') || clean(attr.format);
  const fullPath = d.img_front_full || (d.images && d.images[0] && d.images[0].img_full) || listRow.img_thumb.replace('_mid.jpg', '.jpg');
  const imgUrl = imageUrlFromPath(workid, fullPath);
  return {
    workid,
    title,
    artist,
    year,
    dateStr: clean(d.date_txt) && !/^unknown$/i.test(clean(d.date_txt)) ? clean(d.date_txt) : (year != null ? String(year) : ''),
    medium,
    dimensions,
    category,
    discipline: clean(attr.discipline),
    format: clean(attr.format),
    country: clean(attr.country),
    description: clean(d.description),
    imgUrl,
    sourceUrl: clean(d.itempage || listRow.itempage) || `${BASE}/item?workID=${workid}`,
  };
}

// ---------- image: download full-size, autocrop→webp, upload to R2 ----------
async function dl(url) {
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(url, { headers: authHeaders({ Accept: 'image/webp,image/jpeg,image/*' }) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const ct = r.headers.get('content-type') || '';
      if (!ct.startsWith('image/')) throw new Error(`non-image (${ct})`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 5000) throw new Error(`tiny ${buf.length}b`);
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
  const meta = await sharp(src, { limitInputPixels: false }).metadata().catch(() => ({}));
  if (meta.width && Math.max(meta.width, meta.height) < 600) throw new Error(`thumb ${meta.width}x${meta.height}`);
  const { buffer } = await autocropToWebp(src);            // → webp 2048/q85
  const hash8 = sha(a.imgUrl).slice(0, 8);
  const key = `artworks/${COLLECTION_STEM}/${SLUG}-${a.workid}-${hash8}-imageUrl.webp`;
  await uploadR2(key, buffer);
  return { imageUrl: `${R2_PUBLIC}/${key}` };
}

// ---------- assemble (min-4 guard: title, artist, year, category) ----------
function toArtwork(a, imageUrl) {
  if (!a.title || !a.artist || a.year == null || !a.category) return null;
  return {
    id: `${SLUG}-${a.workid}`,
    objectNumber: a.workid,
    title: a.title,
    artist: a.artist,
    date: a.dateStr || String(a.year),
    year: a.year,
    medium: a.medium,
    dimensions: a.dimensions,
    category: a.category,
    description: a.description,
    imageUrl,
    thumbnailUrl: a.imgUrl,
    onDisplay: false,
    displayLocation: '',
    sourceUrl: a.sourceUrl,
    metadata: { workid: a.workid, discipline: a.discipline, format: a.format, country: a.country },
    original_imageUrl: a.imgUrl,
  };
}

function writeCollection(artworks) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'Letterform Archive',
    collection: 'Online Archive',
    website: BASE,
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'api',
    category_breakdown: cats,
    artworks,
  };
  const stem = MODE === 'probe' ? `${COLLECTION_STEM}-probe` : COLLECTION_STEM;
  const out = path.join(REPO, 'public/data', `${stem}.json`);
  // COMPACT (no indent) to keep JSON < 23MB for the full set.
  fs.writeFileSync(out, JSON.stringify(payload));
  console.log(`[write] ${out} (${artworks.length} works) breakdown=`, cats);
  return out;
}

// ---------- progress (full mode resume) ----------
function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS, 'utf8')); } catch { return { done: {}, artworks: [] }; }
}
function saveProgress(p) { fs.writeFileSync(PROGRESS, JSON.stringify(p)); }

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  await initSession();

  const list = await getJson(LIST_URL);
  const rows = (list && list.rows) || [];
  console.log(`[list] rowCount=${list.rowCount} rows=${rows.length}`);
  if (!rows.length) throw new Error('empty list');

  const progress = MODE === 'full' ? loadProgress() : { done: {}, artworks: [] };
  let queue = rows.filter((r) => !progress.done[r.workid]);
  if (MODE === 'probe') queue = queue.slice(0, PROBE_TARGET);
  console.log(`[${MODE}] processing ${queue.length} works (already done ${Object.keys(progress.done).length}) conc=${CONC}`);

  const artworks = MODE === 'full' ? progress.artworks : [];
  let done = 0, imgErr = 0, dropMin4 = 0, idx = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (idx < queue.length) {
      const row = queue[idx++];
      try {
        const rec = await buildRecord(row);
        if (!rec.imgUrl) throw new Error('no image path');
        const { imageUrl } = await processImage(rec);
        const w = toArtwork(rec, imageUrl);
        if (w) { artworks.push(w); if (MODE === 'full') progress.artworks.push(w); }
        else dropMin4++;
        if (MODE === 'full') progress.done[row.workid] = 1;
      } catch (e) {
        imgErr++;
        fs.appendFileSync(FAILED, JSON.stringify({ workid: row.workid, err: String(e.message || e) }) + '\n');
        if (MODE === 'full') progress.done[row.workid] = 1; // don't retry hard-404s on resume
        if (imgErr <= 8) console.log(`  err ${row.workid}: ${e.message}`);
      }
      if (++done % 50 === 0) {
        console.log(`  …${done}/${queue.length} (ok ${artworks.length}, imgErr ${imgErr}, drop ${dropMin4})`);
        if (MODE === 'full') saveProgress(progress);
      }
    }
  }));
  if (MODE === 'full') saveProgress(progress);

  artworks.sort((x, y) => x.id.localeCompare(y.id));
  writeCollection(artworks);
  console.log(`\n[${MODE}] DONE. collected ${artworks.length} | img errors ${imgErr} | min4-drops ${dropMin4}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
