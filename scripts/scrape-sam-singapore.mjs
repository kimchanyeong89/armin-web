#!/usr/bin/env node
// Singapore Art Museum (SAM) — full collection scraper.
// Source: roots.gov.sg (National Heritage Board, .gov.sg) — the Singapore government portal
//   hosting the National Collection. Records are explicitly collection_of='Singapore Art Museum'.
//   Treated as government hosting = museum's own infra (gov.my/gov.vn precedent). SAM's own
//   Sitecore domain only has ~58 curated highlight pages — below directory threshold.
//
// Enumeration: POST /api/kendra-get-search-results (Kendra-style search JSON API),
//   filter source=roots_collections + collection='Singapore Art Museum', size=100,
//   sortBy title.sort asc for stable paging (~23 pages, total≈2286, ~2258 unique docs).
//   Auth: double-submit CSRF (random hex as both cookie roots_csrf_token and header
//   x-csrf-token) + Referer header (missing Referer → WAF 403). No login.
// Each doc carries full metadata (title, creator, content, accession_no, dimension,
//   technique, material, nlb_type, date_period, path, image_url) — detail-page-complete.
// Images: metadata.image_url → https://www.roots.gov.sg/api/media/{uuid}/{objectId}.jpg
//   (1200px long side, plain GET works).
//
// SCOPE (per COLLECTION_SCRAPING_GUIDE §1): nlb_type Painting → painting (ALL, no cap),
//   Photograph → photograph (never colour-gated), Print → print (skip monochrome B&W
//   reproductive prints at download via Hasler-Süsstrunk colorfulness < 20).
//   Excluded: Sculpture (~698) and misc 3D (Furnishing/Ceramic/Textile/Document/artefact).
//   Min-4 guard: drop records lacking title/creator/parseable year (~82 of 1549).
//
// Usage:
//   node scripts/scrape-sam-singapore.mjs --probe   # first ~20 in-scope end-to-end → public/data/sam-singapore-collection-probe.json
//   node scripts/scrape-sam-singapore.mjs --full    # everything in-scope, resumable → public/data/sam-singapore-collection.json

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

const SLUG = 'sam-singapore';
const COLLECTION_STEM = `${SLUG}-collection`;
const API = 'https://www.roots.gov.sg/api/kendra-get-search-results';
const REFERER = 'https://www.roots.gov.sg/filter/collectionresearch';
const UA = 'armin-museum-research/1.0';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const PROGRESS_FILE = path.join(STATE_DIR, `${SLUG}-progress.json`);
const FAILED_FILE = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);
const CSRF = crypto.randomBytes(16).toString('hex'); // double-submit: any hex works

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

// ---------- enumeration (search API, all pages, dedupe by objectId) ----------
async function fetchPage(pageNumber) {
  const body = {
    id: null,
    topicsQuery: {
      should: [],
      must: [
        { field: 'source', value: 'roots_collections' },
        { field: 'collection', value: 'Singapore Art Museum' },
      ],
      not: [{ field: 'source', value: 'CSV' }],
    },
    query: '*',
    searchMode: 'NEW',
    pageNumber,
    size: 100,
    sortBy: { field: 'title.sort', order: 'asc' }, // stable paging
  };
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Referer': REFERER, // missing Referer → WAF 403
          'x-csrf-token': CSRF,
          'Cookie': `roots_csrf_token=${CSRF}`,
          'User-Agent': UA,
        },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (att === 3) throw new Error(`search page ${pageNumber}: ${e.message}`);
      await sleep(1000 * att);
    }
  }
}

async function fetchAllDocs() {
  const byObjectId = new Map();
  let total = null;
  for (let page = 1; page <= 40; page++) { // hard stop well past ceil(2286/100)
    const j = await fetchPage(page);
    total = j.total;
    const docs = j.documents || [];
    if (docs.length === 0) break;
    for (const d of docs) {
      const m = (d.path || '').match(/listing\/(\d+)/);
      if (!m) continue;
      if (!byObjectId.has(m[1])) byObjectId.set(m[1], d);
    }
    process.stdout.write(`\r[enum] page ${page}: ${byObjectId.size} unique docs (API total ${total})   `);
    if (page * 100 >= total + 100) break;
    await sleep(350);
  }
  console.log(`\n[enum] done: ${byObjectId.size} unique docs`);
  return [...byObjectId.entries()];
}

// ---------- scope classifier (NHB's own nlb_type) ----------
function classify(doc) {
  const types = (doc.metadata && doc.metadata.nlb_type) || [];
  if (types.includes('Painting')) return 'painting';
  if (types.includes('Photograph')) return 'photograph';
  if (types.includes('Print')) return 'print';
  return null; // Sculpture / Furnishing / Ceramic / Textile / Document / artefact → out of scope
}

// ---------- doc → candidate ----------
function parseDoc(objectId, doc) {
  const md = doc.metadata || {};
  const title = (doc.title || '').trim();
  const artist = (doc.creator || '').trim();
  const dateStr = String(md.date_period || '').trim();
  const years = (dateStr.match(/\d{4}/g) || []).map(Number).filter((y) => y >= 1700 && y <= 2035);
  const year = years.length ? Math.min(...years) : null;
  const medium = [...new Set([...(md.technique || []), ...(md.material || [])])].map((s) => String(s).trim()).filter(Boolean).join('; ');
  const dimensions = (md.dimension || []).map((s) => String(s).trim()).filter(Boolean).join(' | ');
  return {
    id: `${SLUG}-${objectId}`,
    objectId,
    title,
    artist,
    year,
    dateStr,
    medium,
    dimensions,
    description: (doc.content || '').trim(),
    accession: ((md.accession_no || [])[0] || '').trim(),
    category: classify(doc),
    imgUrl: md.image_url || null,
    sourceUrl: doc.path,
    docId: doc.id,
    objecttype: (doc.tags && doc.tags.objecttype) || [],
    nlbType: md.nlb_type || [],
  };
}

// ---------- B&W gate for prints (guide §1: colorfulness < 20 → skip; photographs NEVER gated) ----------
async function colorfulnessOf(buf) {
  const { data, info } = await sharp(buf, { limitInputPixels: false })
    .resize(80, 80, { fit: 'inside' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  if (ch < 3) return 0; // grayscale-encoded source = monochrome by definition
  const rg = [], yb = [];
  for (let i = 0; i < data.length; i += ch) {
    const R = data[i], G = data[i + 1], B = data[i + 2];
    rg.push(R - G); yb.push(0.5 * (R + G) - B);
  }
  const m = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const sd = (a) => { const mu = m(a); return Math.sqrt(m(a.map((v) => (v - mu) ** 2))); };
  return Math.sqrt(sd(rg) ** 2 + sd(yb) ** 2) + 0.3 * Math.sqrt(m(rg) ** 2 + m(yb) ** 2);
}

// ---------- image: download → (print gate) → webp 2048 → R2 ----------
async function dl(url) {
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Referer': REFERER } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const ct = r.headers.get('content-type') || '';
      if (!ct.startsWith('image/')) throw new Error(`not image: ${ct}`);
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

// returns { imageUrl } or { skipped: reason }
async function processImage(a) {
  const src = await dl(a.imgUrl);
  const meta = await sharp(src, { limitInputPixels: false }).metadata().catch(() => ({}));
  if (meta.width && Math.max(meta.width, meta.height) < 400) throw new Error(`lowres ${meta.width}x${meta.height}`);
  if (a.category === 'print') {
    const cf = await colorfulnessOf(src);
    if (cf < 20) return { skipped: `bw-print colorfulness ${cf.toFixed(1)}` };
  }
  const { buffer } = await autocropToWebp(src); // default: pure webp(2048/q85), no trim
  const hash8 = sha(a.imgUrl).slice(0, 8);
  const key = `artworks/${COLLECTION_STEM}/${a.id}-${hash8}-imageUrl.webp`;
  await uploadR2(key, buffer);
  return { imageUrl: `${R2_PUBLIC}/${key}` };
}

// ---------- record assembly ----------
function toArtwork(a, imageUrl) {
  return {
    id: a.id,
    objectNumber: a.accession,
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
    metadata: { roots_doc_id: a.docId, accession_no: a.accession, nlb_type: a.nlbType, objecttype: a.objecttype },
    original_imageUrl: a.imgUrl,
  };
}

function writeCollection(artworks, stem) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'Singapore Art Museum',
    collection: 'Collection',
    website: 'https://www.singaporeartmuseum.sg/',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'gov-portal-json-api (roots.gov.sg / National Heritage Board)',
    category_breakdown: cats,
    artworks,
  };
  const out = path.join(REPO, 'public/data', `${stem}.json`);
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
  console.log(`[write] ${out} (${artworks.length} works) breakdown=`, cats);
}

// ---------- resume state (--full only) ----------
function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')); } catch { return { done: {}, skipped: {} }; }
}
function saveProgress(p) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p));
}

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  console.log(`[${MODE}] Singapore Art Museum via roots.gov.sg`);

  const entries = await fetchAllDocs();
  const parsed = entries.map(([oid, d]) => parseDoc(oid, d));

  const tally = {};
  for (const p of parsed) if (p.category) tally[p.category] = (tally[p.category] || 0) + 1;
  const inScope = parsed.filter((p) => p.category);
  const min4 = inScope.filter((p) => p.title && p.artist && p.year != null && p.imgUrl);
  console.log(`[scope] in-scope ${inScope.length} of ${parsed.length} | breakdown:`, tally);
  console.log(`[scope] min-4 survivors ${min4.length} (dropped ${inScope.length - min4.length}: missing creator/year)`);

  const progress = MODE === 'full' ? loadProgress() : { done: {}, skipped: {} };
  let candidates = min4.filter((p) => !progress.done[p.id] && !progress.skipped[p.id]);
  if (MODE === 'probe') candidates = candidates.slice(0, PROBE_TARGET);
  console.log(`[${MODE}] processing ${candidates.length} candidates (${Object.keys(progress.done).length} already done)…`);

  let done = 0, imgErr = 0, bwSkip = 0;
  const CONC = 3; // ~3-4 rps incl. webp/upload time
  let idx = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (idx < candidates.length) {
      const a = candidates[idx++];
      try {
        const res = await processImage(a);
        if (res.skipped) {
          bwSkip++;
          progress.skipped[a.id] = res.skipped;
          console.log(`  [skip] ${a.id} "${a.title.slice(0, 40)}": ${res.skipped}`);
        } else {
          progress.done[a.id] = toArtwork(a, res.imageUrl);
        }
      } catch (e) {
        imgErr++;
        fs.appendFileSync(FAILED_FILE, JSON.stringify({ id: a.id, url: a.imgUrl, err: String(e.message || e), at: new Date().toISOString() }) + '\n');
        if (imgErr <= 8) console.log(`  [err] ${a.id}: ${e.message}`);
      }
      done++;
      if (MODE === 'full' && done % 25 === 0) saveProgress(progress);
      if (done % 100 === 0 || done === candidates.length) console.log(`  …${done}/${candidates.length} (ok ${Object.keys(progress.done).length}, bwSkip ${bwSkip}, err ${imgErr})`);
      await sleep(120); // politeness stagger
    }
  }));
  if (MODE === 'full') saveProgress(progress);

  const artworks = Object.values(progress.done).sort((x, y) => x.id.localeCompare(y.id));
  writeCollection(artworks, MODE === 'probe' ? `${COLLECTION_STEM}-probe` : COLLECTION_STEM);
  console.log(`[${MODE}] DONE. collected ${artworks.length} | bw-print skips ${bwSkip} | img errors ${imgErr}`);
  console.log(`[${MODE}] full in-scope pool = ${min4.length} (paintings all, no cap; JSON ≪ 24MB so no prioritization needed)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
