#!/usr/bin/env node
// Poster Museum at Wilanów (Muzeum Plakatu w Wilanowie) — full collection scraper.
// World's first poster museum; a branch (Oddział) of Muzeum Narodowe w Warszawie (MNW).
// Its own postermuseum.pl has no per-object catalogue, but the parent national platform
// cyfrowe.mnw.art.pl (MuzaCMS API v2.21.1) exposes the museum's holdings cleanly.
//
// Source: parent-institution platform — MNW "Zbiory Cyfrowe" MuzaCMS REST API (no auth).
//   LIST:   GET https://cyfrowe-api.mnw.art.pl/api/search/Object/page/{n}?filter[owner][]=110099
//             owner id 110099 == "Muzeum Plakatu w Wilanowie, Oddział MNW" (15/page).
//   DETAIL: GET https://cyfrowe-api.mnw.art.pl/api/object/{id}
//             full metadata: authors[{name,role}], createDates, techniques, materials,
//             dimensionText, types, inventoryNumber/positionNumber, image{filePath,extension}.
//   IMAGE:  https://cyfrowe-cdn.mnw.art.pl/upload/multimedia/{filePath}.{ext}  (HQ, ~6000px)
//
// SCOPE: the Poster Museum's entire digitized holding is FLAT works — types observed:
//   plakat (poster), projekt (design sketch), wywieszka/ulotka (notice/leaflet),
//   grafika użytkowa (applied graphics), replika. NO 3D. All 652 records have an image,
//   a named author, a parseable year and a title (verified Phase A). category mapping:
//     plakat/wywieszka/ulotka/<none>  -> "poster"   (app recognizes as 2D)
//     projekt/grafika/replika/other   -> "drawing"  (flat work-on-paper / design)
//   Posters are NEVER colour-gated (no grayscale curation here — guide §1).
//
// Metadata is Polish (acceptable per task). Artist names kept in source "Last, First (dates)"
//   form (display/match layers normalize downstream).
//
// Usage:
//   node scripts/scrape-wilanow-poster.mjs --probe   # ~15 works end-to-end + R2, probe JSON
//   node scripts/scrape-wilanow-poster.mjs --full    # all in-scope, resumable, collection JSON

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

const SLUG = 'wilanow-poster';
const COLLECTION_STEM = `${SLUG}-collection`;
const OWNER_ID = 110099; // Muzeum Plakatu w Wilanowie, Oddział MNW
const API = 'https://cyfrowe-api.mnw.art.pl/api';
const CDN_HQ = 'https://cyfrowe-cdn.mnw.art.pl/upload/multimedia';
const CDN_THUMB = 'https://cyfrowe-cdn.mnw.art.pl/upload/cache/multimedia_thumbnail';
const SOURCE_BASE = 'https://cyfrowe.mnw.art.pl/pl/katalog/objects';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const PROGRESS = path.join(STATE_DIR, `${SLUG}-progress.json`);
const FAILED = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : 'probe';
const PROBE_TARGET = 15;

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ---------- fetch layer ----------
async function getJson(url) {
  for (let att = 1; att <= 4; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const ct = r.headers.get('content-type') || '';
      if (!ct.includes('json')) throw new Error(`non-json ct=${ct}`);
      return await r.json();
    } catch (e) { if (att === 4) throw e; await sleep(700 * att); }
  }
}

// Enumerate every object id for owner=110099 by paging the search endpoint.
async function listAllIds() {
  const first = await getJson(`${API}/search/Object/page/1?filter%5Bowner%5D%5B%5D=${OWNER_ID}`);
  const pd = first.data.paginatorDetails;
  const totalPages = pd.totalPagesCount;
  console.log(`[list] owner=${OWNER_ID} total=${pd.totalItemsCount} pages=${totalPages} (${pd.maxPerPage}/page)`);
  const ids = first.data.items.map((i) => i.id);
  for (let p = 2; p <= totalPages; p++) {
    const d = await getJson(`${API}/search/Object/page/${p}?filter%5Bowner%5D%5B%5D=${OWNER_ID}`);
    for (const it of d.data.items) ids.push(it.id);
    await sleep(300);
    if (p % 10 === 0) console.log(`  …listed ${ids.length} ids (page ${p}/${totalPages})`);
  }
  // dedupe defensively (stable pagination, but be safe)
  const uniq = [...new Set(ids)];
  console.log(`[list] collected ${uniq.length} unique ids`);
  return uniq;
}

// ---------- detail record → ARMIN artwork ----------
function pickYear(createDates) {
  for (const c of createDates || []) {
    const m = (c.name || '').match(/\d{4}/);
    if (m) return parseInt(m[0], 10);
  }
  return null;
}

// plakat/notice/leaflet => poster (2D); design/applied-graphics/replica/other => drawing.
function categoryFor(types) {
  const names = (types || []).map((t) => (t.name || '').toLowerCase());
  if (names.some((n) => /plakat|wywieszka|ulotka|afisz/.test(n))) return 'poster';
  if (names.length === 0) return 'poster'; // untyped Poster-Museum records are posters by collection
  return 'drawing'; // projekt / grafika użytkowa / replika → flat work on paper
}

function joinNamed(items, sep = '; ') {
  return (items || []).map((x) => (x.name || '').trim()).filter(Boolean).join(sep);
}

// Build a record from a DETAIL response. Returns null if it cannot satisfy min-4.
function parseDetail(d) {
  const o = d.data || d;
  const title = (o.title || '').trim();
  // authors: keep source form; prefer creative roles but include all named contributors.
  const artist = joinNamed(o.authors);
  const year = pickYear(o.createDates);
  const category = categoryFor(o.types);
  if (!title || !artist || year == null || !category) return null; // min-4 guard

  const dateStr = (o.createDates || []).map((c) => (c.name || '').trim()).filter(Boolean).join('; ');
  const medium = [joinNamed(o.techniques, ', '), joinNamed(o.materials, ', ')].filter(Boolean).join('; ');
  const dimensions = (o.dimensionText || '').trim();
  const objectNumber = (o.inventoryNumber || '').trim() || (o.positionNumber != null ? String(o.positionNumber) : '');
  const img = o.image || ((o.additionalImages || []).find((a) => a.filePath));
  if (!img || !img.filePath) return null;
  const ext = img.extension || 'jpg';
  const imgUrl = `${CDN_HQ}/${img.filePath}.${ext}`;
  const thumbUrl = `${CDN_THUMB}/${img.filePath}.${ext}`;
  const typeNames = joinNamed(o.types, ', ');

  return {
    id: `${SLUG}-${o.id}`,
    rawId: o.id,
    objectNumber,
    title,
    artist,
    year,
    dateStr,
    medium,
    dimensions,
    category,
    description: (o.curatorScientificNote || o.technologicalDescription || '').trim(),
    imgUrl,
    thumbUrl,
    sourceUrl: `${SOURCE_BASE}/${o.id}`,
    typeNames,
    ownerName: (o.owner && o.owner.name) || '',
  };
}

async function fetchDetail(rawId) {
  const d = await getJson(`${API}/object/${rawId}`);
  return parseDetail(d);
}

// ---------- image: download HQ, dimension-check, autocrop→webp, upload R2 ----------
async function dl(url) {
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 5000) throw new Error(`tiny ${buf.length}b`);
      return buf;
    } catch (e) { if (att === 3) throw e; await sleep(600 * att); }
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
  const meta = await sharp(src, { limitInputPixels: false }).metadata().catch(() => ({}));
  if (meta.width && Math.max(meta.width, meta.height) < 600) throw new Error(`thumb ${meta.width}x${meta.height}`);
  const { buffer } = await autocropToWebp(src);
  const hash8 = sha(a.imgUrl).slice(0, 8);
  const key = `artworks/${COLLECTION_STEM}/${a.id}-${hash8}-imageUrl.webp`;
  await uploadR2(key, buffer);
  return { imageUrl: `${R2_PUBLIC}/${key}`, srcW: meta.width || null, srcH: meta.height || null };
}

function toArtwork(a, imageUrl) {
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
    description: a.description,
    imageUrl,
    thumbnailUrl: a.thumbUrl,
    onDisplay: false,
    displayLocation: '',
    sourceUrl: a.sourceUrl,
    metadata: { mnw_object_id: a.rawId, owner: a.ownerName, object_types: a.typeNames },
    original_imageUrl: a.imgUrl,
  };
}

function writeCollection(artworks, stem) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'Muzeum Plakatu w Wilanowie (Poster Museum at Wilanów)',
    collection: 'Poster Collection',
    website: 'https://www.postermuseum.pl/',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'api',
    category_breakdown: cats,
    artworks,
  };
  const out = path.join(REPO, 'public/data', `${stem}.json`);
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
  const mb = (fs.statSync(out).size / 1e6).toFixed(2);
  console.log(`[write] ${out} (${artworks.length} works, ${mb} MB) breakdown=`, cats);
  return out;
}

// ---------- progress (resumable, --full) ----------
function loadProgress() {
  if (fs.existsSync(PROGRESS)) { try { return JSON.parse(fs.readFileSync(PROGRESS, 'utf8')); } catch {} }
  return { done: {}, artworks: [] };
}
function saveProgress(state) { fs.writeFileSync(PROGRESS, JSON.stringify(state)); }

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });

  if (MODE === 'probe') {
    // small end-to-end slice: list first page, take a varied set, run full pipeline.
    const first = await getJson(`${API}/search/Object/page/1?filter%5Bowner%5D%5B%5D=${OWNER_ID}`);
    const ids = first.data.items.map((i) => i.id).slice(0, PROBE_TARGET);
    console.log(`[probe] processing ${ids.length} ids end-to-end…`);
    const artworks = [];
    let ok = 0, dropMin4 = 0, imgErr = 0, minDim = Infinity;
    for (const rawId of ids) {
      try {
        const a = await fetchDetail(rawId);
        if (!a) { dropMin4++; console.log(`  drop(min4) id=${rawId}`); continue; }
        const { imageUrl, srcW, srcH } = await processImage(a);
        minDim = Math.min(minDim, Math.max(srcW || 0, srcH || 0));
        artworks.push(toArtwork(a, imageUrl));
        ok++;
        console.log(`  ok ${a.category.padEnd(7)} ${srcW}x${srcH} | ${a.artist.slice(0, 28)} — ${a.title.slice(0, 36)}`);
      } catch (e) { imgErr++; console.log(`  ERR id=${rawId}: ${e.message}`); }
      await sleep(250);
    }
    writeCollection(artworks, `${COLLECTION_STEM}-probe`);
    console.log(`\n[probe] ok=${ok} drop(min4)=${dropMin4} imgErr=${imgErr} minLongEdge=${minDim === Infinity ? 'n/a' : minDim}px`);
    if (ok === 0) process.exit(1);
    return;
  }

  // ---- full ----
  const ids = await listAllIds();
  const state = loadProgress();
  console.log(`[full] resuming: ${Object.keys(state.done).length} already done of ${ids.length}`);
  const pending = ids.filter((id) => !state.done[id]);

  let done = Object.keys(state.done).length, ok = state.artworks.length, dropMin4 = 0, imgErr = 0;
  const CONC = 5;
  let idx = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (idx < pending.length) {
      const rawId = pending[idx++];
      try {
        const a = await fetchDetail(rawId);
        if (!a) { dropMin4++; state.done[rawId] = 'drop'; }
        else {
          const { imageUrl } = await processImage(a);
          state.artworks.push(toArtwork(a, imageUrl));
          state.done[rawId] = 'ok'; ok++;
        }
      } catch (e) {
        imgErr++;
        fs.appendFileSync(FAILED, JSON.stringify({ id: rawId, err: String(e.message || e) }) + '\n');
        if (imgErr <= 8) console.log(`  img/detail err id=${rawId}: ${e.message}`);
      }
      if (++done % 25 === 0) { saveProgress(state); console.log(`  …${done}/${ids.length} (ok ${ok}, drop ${dropMin4}, err ${imgErr})`); }
      await sleep(120);
    }
  }));
  saveProgress(state);

  state.artworks.sort((x, y) => (x.metadata.mnw_object_id - y.metadata.mnw_object_id));
  writeCollection(state.artworks, COLLECTION_STEM);
  console.log(`\n[full] DONE. collected ${state.artworks.length} | min4-drops ${dropMin4} | errors ${imgErr}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
