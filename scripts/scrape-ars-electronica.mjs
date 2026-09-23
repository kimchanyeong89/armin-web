#!/usr/bin/env node
// Ars Electronica Archive — Prix Ars Electronica winners/submissions (Linz, Austria) — full scraper.
// GENRE: 비디오·미디어아트 (media art) — but we collect ONLY the FLAT STILL IMAGES that document
//        each project (installation views, screenshots, computer/generative-art stills, photography).
//        We DO NOT collect the video/film/audio assets. Each project's own media carousel tags every
//        asset with type="photos" | "film" | "sound" | "papers_pdf" | … — we keep ONLY type="photos".
//
// Source: museum-OWN legacy archive at archive.aec.at/prix/ (no auth, no key). Pure HTML/JSON, no aggregator.
//   1) Per-year listing (DataTables backend, returns HTML rows):
//        GET /prix/data/year/?year=YYYY   →  rows of <a href="/prix/{id}/"> detail links
//      The index call GET /prix/data/ returns aaYearCounts (years 1987..2026, ~2,972 works total).
//   2) Per-work detail page:
//        GET /prix/{id}/  →  <h1> title, <div class="mb-1"> artist, <h3> "Category + Prize - Label YEAR",
//        and a carousel of <div class="carousel-item item" type="photos" thumbnail="/asset/{aid}/preview/">.
//   3) Image (best available rendition, full-res original when present):
//        GET /asset/{aid}/web/   →  the largest JPEG/PNG for that asset (e.g. 3000px originals).
//
// One record PER WORK (its first/lead still image as the card image) — directory granularity.
// In-scope estimate: ~2,900 works (sampling 1987–2026 found ~100% of works carry ≥1 photo asset).
//
// LICENSE: Ars Electronica Archive ("Alle Rechte vorbehalten"; detail pages ask to cite credits —
//   artwork name, artist, photographer). Handled like the app's other all-rights-reserved museum
//   sources (Tate/MoMA/ZKM): attributed thumbnails that link back to the source detail page. We
//   record the museum, artist and sourceUrl for attribution.
//
// Usage:
//   node scripts/scrape-ars-electronica.mjs --probe        # first year only, ~20 works, end-to-end + R2
//   node scripts/scrape-ars-electronica.mjs --full         # full scrape (all years), resumable

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

const SLUG = 'ars-electronica';
const COLLECTION_STEM = `${SLUG}-collection`;
const BASE = 'https://archive.aec.at';
const YEAR_API = (y) => `${BASE}/prix/data/year/?year=${y}`;
const DETAIL = (id) => `${BASE}/prix/${id}/`;
const ASSET_WEB = (aid) => `${BASE}/asset/${aid}/web/`;        // largest rendition (full-res original when present)
const ASSET_PREVIEW = (aid) => `${BASE}/asset/${aid}/preview/`; // ~720px preview (used as thumbnailUrl)
const UA = 'armin-museum-research/1.0';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const PROGRESS = path.join(STATE_DIR, `${SLUG}-progress.json`);
const FAILED = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : 'probe';
const CONC = 5;                       // image download/upload concurrency
const CAP_BYTES = 23 * 1024 * 1024;   // hard JSON size cap (postbuild drops >25MB files)

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const clean = (s) => (s || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&([a-z]+);/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// ---------- HTTP ----------
async function getText(url) {
  for (let att = 1; att <= 4; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (r.status === 429) { await sleep(2000 * att); continue; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) { if (att === 4) throw new Error(`${url}: ${e.message}`); await sleep(700 * att); }
  }
}

async function getJson(url) {
  const t = await getText(url);
  return JSON.parse(t);
}

// ---------- year index → list of {id, year} ----------
async function listYears() {
  const idx = await getJson(`${BASE}/prix/data/`);
  const years = (idx.aaYearCounts || []).map((p) => parseInt(p[0], 10)).filter(Boolean).sort((a, b) => a - b);
  return years.length ? years : Array.from({ length: 2026 - 1987 + 1 }, (_, i) => 1987 + i);
}

async function idsForYear(year) {
  const html = await getText(YEAR_API(year));
  const ids = [];
  const seen = new Set();
  const re = /href="\/prix\/(\d+)\/"/g;
  let m;
  while ((m = re.exec(html))) {
    if (!seen.has(m[1])) { seen.add(m[1]); ids.push(m[1]); }
  }
  return ids;
}

// ---------- detail page → work record (pre-image) ----------
// Extracts the FIRST type="photos" carousel asset as the lead still image.
function parseDetail(id, html) {
  // title = last <h1> (the work title; the first <h1>s are "Archive - Prix" chrome)
  const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => clean(m[1]));
  const title = h1s.length ? h1s[h1s.length - 1] : '';

  // category + prize + year from the first <h3>, e.g. "Interactive Art + Anerkennung - Honorary Mention 2020"
  const h3m = html.match(/<h3[^>]*>([\s\S]*?)<\/h3>/);
  const catPrize = h3m ? clean(h3m[1]) : '';
  const ym = catPrize.match(/(?:19|20)\d{2}/);
  const year = ym ? parseInt(ym[0], 10) : null;
  // category label = text before the first '+' (separates category from prize), trimmed
  let prixCategory = catPrize.split('+')[0].split(' - ')[0].trim();
  prixCategory = prixCategory.replace(/\s*[-–]\s*$/, '').trim();

  // artist = the <div class="mb-1"> block that sits right after the work title <h1>
  let artist = '';
  const afterTitle = html.split('</h1>').pop() || '';
  const mb = afterTitle.match(/<div class="mb-1">([\s\S]*?)<\/div>/);
  if (mb) artist = clean(mb[1]);
  // guard: artist block sometimes carries the "Original: …" credit dump — cut at "Original:"
  if (/Original:/i.test(artist)) artist = artist.split(/Original:/i)[0].trim();

  // first type="photos" carousel asset (type attr may appear before OR after thumbnail attr)
  const photoAssetId = firstPhotoAsset(html);

  return { id, title, artist, year, prixCategory, photoAssetId };
}

// Find the first carousel item whose type="photos" and return its asset id.
function firstPhotoAsset(html) {
  // each carousel item is a single <div class="carousel-item item" ...>; capture its attribute string
  const re = /<div class="carousel-item item"([^>]*)>/g;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    if (!/type="photos"/.test(attrs)) continue;
    const aid = attrs.match(/\/asset\/(\d+)\//);
    if (aid) return aid[1];
  }
  return null;
}

// ---------- image: download best rendition, verify ≥600px, webp, upload R2 ----------
async function dl(url) {
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const ct = r.headers.get('content-type') || '';
      if (!ct.startsWith('image/')) throw new Error(`non-image ${ct}`);
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

async function processImage(w) {
  const src = await dl(ASSET_WEB(w.photoAssetId));
  const sharp = (await import('sharp')).default;
  const meta = await sharp(src).metadata().catch(() => ({}));
  if (meta.width && meta.height && Math.max(meta.width, meta.height) < 600)
    throw new Error(`thumb ${meta.width}x${meta.height}`);
  const { buffer } = await autocropToWebp(src); // webp(2048/q85), no crop by default
  const hash8 = sha(ASSET_WEB(w.photoAssetId)).slice(0, 8);
  const key = `artworks/${COLLECTION_STEM}/${w.id}-${hash8}-imageUrl.webp`;
  await uploadR2(key, buffer);
  return { imageUrl: `${R2_PUBLIC}/${key}`, srcW: meta.width || null, srcH: meta.height || null };
}

// ---------- record assembly (ARMIN artwork schema) ----------
function toArtwork(w, imageUrl) {
  if (!w.title || !w.photoAssetId) return null; // need a title + a still image
  const artist = w.artist || 'Unknown';
  return {
    id: w.id,
    objectNumber: '',
    title: w.title,
    artist,
    date: w.year != null ? String(w.year) : '',
    year: w.year,
    medium: w.prixCategory || 'Media art',     // Prix category (Computer Animation / Interactive Art / …)
    dimensions: '',
    category: 'media_art',
    description: '',
    imageUrl,
    thumbnailUrl: ASSET_PREVIEW(w.photoAssetId),
    onDisplay: false,
    displayLocation: '',
    sourceUrl: DETAIL(w.id),
    metadata: {
      prix_category: w.prixCategory || '',
      collection: 'Prix Ars Electronica Archive',
    },
    original_imageUrl: ASSET_WEB(w.photoAssetId),
  };
}

function writeCollection(artworks, stem, compact) {
  const byPrix = {};
  for (const w of artworks) { const k = w.medium || '—'; byPrix[k] = (byPrix[k] || 0) + 1; }
  const payload = {
    museum: 'Ars Electronica Archive',
    collection: 'Prix Ars Electronica Archive',
    website: 'https://ars.electronica.art/archive/',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'html',
    category_breakdown: { media_art: artworks.length },
    prix_category_breakdown: byPrix,
    artworks,
  };
  const out = path.join(REPO, 'public/data', `${stem}.json`);
  fs.writeFileSync(out, compact ? JSON.stringify(payload) : JSON.stringify(payload, null, 2));
  const mb = (fs.statSync(out).size / 1024 / 1024).toFixed(2);
  console.log(`[write] ${out} (${artworks.length} works, ${mb} MB) prix=`, byPrix);
  return out;
}

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const years = await listYears();
  console.log(`[index] years ${years[0]}..${years[years.length - 1]} (${years.length} years)`);

  // probe: just the first year; full: all years
  const scanYears = MODE === 'probe' ? [years[0]] : years;

  // 1) gather (id, year) across the chosen years
  const works = [];
  const seen = new Set();
  for (const y of scanYears) {
    let ids = [];
    try { ids = await idsForYear(y); } catch (e) { console.log(`  year ${y} list err: ${e.message}`); }
    for (const id of ids) { if (!seen.has(id)) { seen.add(id); works.push({ id, year: y }); } }
    if (MODE === 'full') console.log(`  year ${y}: +${ids.length} (total ${works.length})`);
    await sleep(120);
  }
  console.log(`[index] total work ids: ${works.length}`);

  // probe: only need ~20 end-to-end
  const target = MODE === 'probe' ? works.slice(0, 22) : works;

  // resumable (full): skip already-done ids
  let doneIds = new Set();
  if (MODE === 'full' && fs.existsSync(PROGRESS)) {
    try { doneIds = new Set(JSON.parse(fs.readFileSync(PROGRESS, 'utf8')).doneIds || []); } catch {}
    console.log(`[full] resuming: ${doneIds.size} ids already processed`);
  }

  const artworks = [];
  let done = 0, noPhoto = 0, imgErr = 0, parseErr = 0, bytesEst = 0;
  let idx = 0; let capped = false;
  const persist = () => { if (MODE === 'full') fs.writeFileSync(PROGRESS, JSON.stringify({ doneIds: [...doneIds] })); };

  await Promise.all(Array.from({ length: CONC }, async () => {
    while (idx < target.length && !capped) {
      const t = target[idx++];
      if (doneIds.has(t.id)) continue;
      let w;
      try {
        const html = await getText(DETAIL(t.id));
        w = parseDetail(t.id, html);
        if (w.year == null) w.year = t.year; // fall back to listing year
      } catch (e) {
        parseErr++;
        fs.appendFileSync(FAILED, JSON.stringify({ id: t.id, stage: 'detail', err: String(e.message || e) }) + '\n');
        continue;
      }
      if (!w.photoAssetId) {
        noPhoto++; doneIds.add(t.id);
        if (++done % 100 === 0) { console.log(`  …${done}/${target.length} (ok ${artworks.length}, noPhoto ${noPhoto}, imgErr ${imgErr})`); persist(); }
        continue; // no still image → out of scope (video/audio/pdf-only)
      }
      try {
        const { imageUrl } = await processImage(w);
        const a = toArtwork(w, imageUrl);
        if (a) {
          artworks.push(a);
          bytesEst += JSON.stringify(a).length + 2;
          if (MODE === 'full' && bytesEst > CAP_BYTES) { capped = true; console.log(`[full] hit size cap (~${(bytesEst / 1024 / 1024).toFixed(1)}MB) at ${artworks.length} works`); }
        }
        doneIds.add(t.id);
      } catch (e) {
        imgErr++;
        fs.appendFileSync(FAILED, JSON.stringify({ id: t.id, asset: w.photoAssetId, stage: 'image', err: String(e.message || e) }) + '\n');
        if (imgErr <= 8) console.log(`  img err id=${t.id}: ${e.message}`);
      }
      if (++done % 100 === 0) { console.log(`  …${done}/${target.length} (ok ${artworks.length}, noPhoto ${noPhoto}, imgErr ${imgErr}, ~${(bytesEst / 1024 / 1024).toFixed(1)}MB)`); persist(); }
    }
  }));
  persist();

  artworks.sort((x, y) => String(x.id).localeCompare(String(y.id)));
  const stem = MODE === 'probe' ? `${COLLECTION_STEM}-probe` : COLLECTION_STEM;
  writeCollection(artworks, stem, /*compact*/ MODE === 'full');
  console.log(`\n[${MODE}] DONE. collected ${artworks.length} | noPhoto ${noPhoto} | imgErr ${imgErr} | parseErr ${parseErr}`);
  if (MODE === 'probe') {
    const sample = artworks.slice(0, 6).map((w) => ({ id: w.id, prix: w.medium, title: w.title.slice(0, 42), artist: w.artist.slice(0, 28), year: w.year, img: w.imageUrl }));
    console.log('[probe] sample:', JSON.stringify(sample, null, 2));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
