#!/usr/bin/env node
// Filmmuseum Potsdam (Potsdam, DE) — film-poster scraper.
// Source: museum-digital JSON API on the museum's OWN self-published infra (institution 226).
//   museum-digital is the official German distributed museum-digitisation platform; objects under
//   institution 226 are catalogued/published BY Filmmuseum Potsdam (not an aggregator).
//   List : GET https://nat.museum-digital.de/json/objects?s=collection:5865&startwert=N
//   Detail: GET https://nat.museum-digital.de/json/object/{id}
//
// SCOPE (영화 / film genre — FLAT film art only):
//   IN  → collection 5865 "Filmplakate aus der DDR" (object_type "Filmplakat") = DEFA/Progress-era
//         DDR film posters, 1945–1990. Posters are NEVER colour-gated (guide §1).
//   OUT → collection 5837 "DDR-Amateurfilme" (16mm films = moving image),
//         collection 1159 "Schriften zur Filmtechnik" (Schriftgut = printed documents/patents).
//   Verified Phase-0: institution 226 publishes 221 objects total; only the 100 posters are in-scope
//   flat art. Master images are ~1029×1446px (≥600px), not watermarked.
//
// Metadata (from detail record):
//   title  = object_name        inventory = object_inventory_number
//   medium = object_material_technique (often "")   dimensions = object_dimensions (cm)
//   date   = event "Hergestellt" → time.time_name   (all posters dated)
//   artist = event "Geistige Schöpfung" → people.people_name (poster designer, e.g. Werner Klemke);
//            fallback to "Veröffentlicht" publisher (Progress Film-Verleih) when no designer recorded.
//   image  = object_images[main].folder + "/" + filename_loc on the md_subset CDN (full-res master).
//
// Usage:
//   node scripts/scrape-filmmuseum-potsdam.mjs --probe   # ~15 works end-to-end + live R2 upload
//   node scripts/scrape-filmmuseum-potsdam.mjs --full    # all in-scope posters, resumable
//
// DO NOT run --full as part of the probe task.

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

const SLUG = 'filmmuseum-potsdam';
const COLLECTION_STEM = `${SLUG}-collection`;
const BASE = 'https://nat.museum-digital.de';
const COLLECTION_ID = 5865;            // "Filmplakate aus der DDR"
const INSTITUTION_ID = 226;
const UA = 'armin-museum-research/1.0';
const BUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
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

// ---------- fetch layer (UA + browser-UA fallback) ----------
async function fetchText(url, { json = false } = {}) {
  let lastErr;
  for (const ua of [UA, BUA]) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': ua, Accept: json ? 'application/json,*/*' : '*/*' }, redirect: 'follow' });
      if (!r.ok) { lastErr = new Error(`HTTP ${r.status} @ ${url}`); continue; }
      return await r.text();
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}
async function getJson(url) { return JSON.parse(await fetchText(url, { json: true })); }

// ---------- list: all object ids in the poster collection ----------
// museum-digital paginates this search with ?startwert=N at a fixed page size (24). We advance by
// the actual page length and stop only when a page is empty OR adds no new ids (offset clamp guard).
async function fetchCollectionIds() {
  const seen = new Set();
  let start = 0;
  for (let guard = 0; guard < 200; guard++) {
    let arr;
    try {
      arr = await getJson(`${BASE}/json/objects?s=collection:${COLLECTION_ID}&startwert=${start}`);
    } catch (e) {
      if (String(e.message).includes('HTTP 404')) break;   // offset past last record = end of pages
      throw e;
    }
    if (!Array.isArray(arr) || arr.length === 0) break;
    const before = seen.size;
    for (const it of arr) if (it.objekt_id) seen.add(it.objekt_id);
    if (seen.size === before) break;   // no progress → done (or offset clamped)
    start += arr.length;
    await sleep(400);
  }
  return [...seen];
}

// ---------- detail → ARMIN artwork ----------
function pickArtist(events) {
  // poster designer first ("Geistige Schöpfung" / "Entworfen"), else distributor/publisher.
  let designer = '', publisher = '';
  for (const e of events || []) {
    const role = e.event_type_name || '';
    const name = e.people && e.people.people_name ? String(e.people.people_name).trim() : '';
    if (!name) continue;
    if ((role === 'Geistige Schöpfung' || role === 'Entworfen' || role === 'Künstler') && !designer) designer = name;
    if ((role === 'Veröffentlicht' || role === 'Herausgegeben' || role === 'Verlag') && !publisher) publisher = name;
  }
  return designer || publisher || '';
}
function pickYear(events) {
  for (const e of events || []) {
    if ((e.event_type_name === 'Hergestellt' || e.event_type_name === 'Entstanden') && e.time && e.time.time_start) {
      const m = String(e.time.time_start).match(/\d{4}/); if (m) return { year: parseInt(m[0], 10), dateStr: e.time.time_name || m[0] };
    }
  }
  // fallback: any event with a year
  for (const e of events || []) {
    if (e.time && e.time.time_name) { const m = String(e.time.time_name).match(/\d{4}/); if (m) return { year: parseInt(m[0], 10), dateStr: e.time.time_name }; }
  }
  return { year: null, dateStr: '' };
}

function parseDetail(o) {
  const imgs = o.object_images || [];
  const main = imgs.find((x) => x.is_main === 'j') || imgs[0];
  if (!main || !main.folder || !main.filename_loc) return null;
  const subset = o.md_subset || 'brandenburg';
  const imgUrl = `${BASE}/data/${subset}/${main.folder}/${main.filename_loc}`;
  const previewUrl = main.preview ? `${BASE}/data/${subset}/${main.folder}/${main.preview}` : imgUrl;

  const { year, dateStr } = pickYear(o.object_events);
  const artist = pickArtist(o.object_events);
  const title = (o.object_name || '').trim();

  return {
    id: String(o.object_id),
    objectNumber: (o.object_inventory_number || '').trim(),
    title,
    artist,
    year,
    dateStr,
    medium: (o.object_material_technique || '').trim(),
    dimensions: (o.object_dimensions || '').trim(),
    description: (o.object_description || '').trim(),
    imgUrl,
    previewUrl,
    sourceUrl: `${BASE}/object/${o.object_id}`,
    imageRights: main.rights || '',
    imageOwner: main.owner || '',
  };
}

// ---------- image: download master, autocrop→webp, upload to R2 ----------
async function dl(url) {
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': att === 1 ? UA : BUA } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
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
  const meta = await sharp(src).metadata().catch(() => ({}));
  if (meta.width && Math.max(meta.width, meta.height) < 600) throw new Error(`thumb ${meta.width}x${meta.height}`);
  const { buffer } = await autocropToWebp(src);     // webp(2048/q85), no white-trim (posters are full-bleed)
  const hash8 = sha(a.imgUrl).slice(0, 8);
  const key = `artworks/${COLLECTION_STEM}/${a.id}-${hash8}-imageUrl.webp`;
  await uploadR2(key, buffer);
  return { imageUrl: `${R2_PUBLIC}/${key}`, srcW: meta.width || null, srcH: meta.height || null };
}

// ---------- record assembly (min-4 guard) ----------
function toArtwork(a, imageUrl) {
  if (!a.title || !a.artist || a.year == null) return null;   // category is always 'poster' here
  return {
    id: a.id,
    objectNumber: a.objectNumber,
    title: a.title,
    artist: a.artist,
    date: a.dateStr || String(a.year),
    year: a.year,
    medium: a.medium,
    dimensions: a.dimensions,
    category: 'poster',
    description: a.description,
    imageUrl,
    thumbnailUrl: a.previewUrl,
    onDisplay: false,
    displayLocation: '',
    sourceUrl: a.sourceUrl,
    metadata: { md_object_id: a.id, md_collection: COLLECTION_ID, md_institution: INSTITUTION_ID, image_rights: a.imageRights, image_owner: a.imageOwner },
    original_imageUrl: a.imgUrl,
  };
}

function writeCollection(artworks) {
  const payload = {
    museum: 'Filmmuseum Potsdam',
    collection: 'Film Posters (DEFA / DDR)',
    website: 'https://www.filmmuseum-potsdam.de/Sammlung.html',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'api',
    source: `museum-digital (institution ${INSTITUTION_ID}, collection ${COLLECTION_ID})`,
    artworks,
  };
  const stem = MODE === 'probe' ? `${COLLECTION_STEM}-probe` : COLLECTION_STEM;
  const out = path.join(REPO, 'public/data', `${stem}.json`);
  // COMPACT (no indent) per guide — keeps JSON small.
  fs.writeFileSync(out, JSON.stringify(payload));
  console.log(`[write] ${out} (${artworks.length} works, ${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
  return out;
}

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });

  console.log(`[list] fetching object ids for collection ${COLLECTION_ID} …`);
  let ids = await fetchCollectionIds();
  console.log(`[list] ${ids.length} poster ids`);

  // resume (full only)
  let progress = { done: {} };
  if (MODE === 'full' && fs.existsSync(PROGRESS)) {
    try { progress = JSON.parse(fs.readFileSync(PROGRESS, 'utf8')); } catch {}
  }
  const collected = MODE === 'full' && Array.isArray(progress.artworks) ? progress.artworks : [];
  const doneIds = new Set(collected.map((w) => w.id));

  if (MODE === 'probe') ids = ids.slice(0, PROBE_TARGET);

  const todo = ids.filter((id) => !doneIds.has(String(id)));
  console.log(`[${MODE}] processing ${todo.length} (already done ${doneIds.size})`);

  let ok = 0, imgErr = 0, metaDrop = 0, noImg = 0;
  let n = 0;
  for (const id of todo) {
    n++;
    try {
      const o = await getJson(`${BASE}/json/object/${id}`);
      const a = parseDetail(o);
      if (!a) { noImg++; continue; }
      const { imageUrl } = await processImage(a);
      const w = toArtwork(a, imageUrl);
      if (!w) { metaDrop++; continue; }
      collected.push(w);
      ok++;
      if (MODE === 'full' && ok % 25 === 0) {
        progress.artworks = collected;
        fs.writeFileSync(PROGRESS, JSON.stringify(progress));
      }
    } catch (e) {
      imgErr++;
      fs.appendFileSync(FAILED, JSON.stringify({ id, err: String(e.message || e) }) + '\n');
      if (imgErr <= 6) console.log(`  err id=${id}: ${e.message}`);
    }
    await sleep(450);
    if (n % 25 === 0) console.log(`  …${n}/${todo.length} (ok ${ok}, imgErr ${imgErr}, metaDrop ${metaDrop}, noImg ${noImg})`);
  }

  collected.sort((x, y) => Number(x.id) - Number(y.id));
  if (MODE === 'full') { progress.artworks = collected; fs.writeFileSync(PROGRESS, JSON.stringify(progress)); }
  const out = writeCollection(collected);

  console.log(`\n[${MODE}] DONE. collected ${collected.length} | newOk ${ok} | imgErr ${imgErr} | metaDrop ${metaDrop} | noImg ${noImg}`);
  // probe sanity
  if (MODE === 'probe') {
    const withMed = collected.filter((w) => w.medium).length;
    const withDim = collected.filter((w) => w.dimensions).length;
    const withArtistDesigner = collected.filter((w) => w.artist && w.artist !== 'Progress Film-Verleih').length;
    console.log(`[probe] fill: title/artist/year=${collected.length}/${collected.length}  dimensions=${withDim}/${collected.length}  medium=${withMed}/${collected.length}  named-designer=${withArtistDesigner}/${collected.length}`);
    console.log(`[probe] sample:`, collected.slice(0, 3).map((w) => `${w.id} "${w.title.slice(0, 38)}" — ${w.artist} (${w.year})`));
    console.log(`[probe] first R2 url:`, collected[0]?.imageUrl);
  }
  return out;
}

main().catch((e) => { console.error(e); process.exit(1); });
