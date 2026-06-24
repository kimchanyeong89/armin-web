#!/usr/bin/env node
// Frac Centre-Val de Loire (Orléans, France) — collection scraper.
// GENRE: 건축 (architecture) — FLAT works only: architectural drawings, plans, prints, photographs, posters.
//
// Notable experimental-architecture collection (ArchiLab). The public SPA
// (collection.frac-centre.fr) is a NAVIGART instance — SAME backend/API as CNAP.
//
// Source: museum-OWN Navigart JSON API, no auth, no key.
//   GET https://api.navigart.fr/503/artworks?sort=by_inv&size=N&from=M
//   ("503" = Frac Centre's collection id on Navigart; read from the SPA's main bundle baseUrl).
//   Returns { totalCount, filteredCount, results:[ { _id, _source.ua.{ artwork, medias, authors } } ] }.
//   totalCount = 21,564 works; ~75% carry an image.
//
// Metadata comes from the listing record itself (Navigart embeds the full detail record
//   in _source.ua.artwork — every field is present there, same as CNAP):
//   title_notice, authors_notice/authors_list, authors_birth_death, date_creation (raw FR),
//   domain (the reliable scope signal), domain_denomination, dimensions, collection_department,
//   copyright, slug.
// Full image = first media's url_template (https://images.navigart.fr/{size}/{file_name}).
//   {size} raster token 1000 = max (~1000px long edge). Use 1000 → guard ≥600px.
//   Photographer credit (e.g. "François Lauginie") + per-media copyright are carried in metadata.
//
// SCOPE (건축, flat visual works only) — classify by `domain`:
//   - "Dessin"            → drawing      (architectural drawings/plans/sketches — the ArchiLab core)
//   - "Estampe"           → print
//   - "Photographie"      → photograph
//   - "Design graphique"  → drawing/print by denomination (posters/affiches → print)
//   EXCLUDED domains (3D / non-flat / non-image):
//   - "Architecture"            → physical models ("Maquette d'architecture") — 3D
//   - "Oeuvre en 3 dimensions"  → installation / sculpture — 3D
//   - "Publication, livre, imprimé" → books — not a single flat image
//   Excluded always: records with no media (no downloadable image).
//   Photographs & drawings are NEVER colour-gated (per COLLECTION_SCRAPING_GUIDE §1).
//
// Usage:
//   node scripts/scrape-frac-centre.mjs --classify   # dry-run: full-collection scope tally (no images)
//   node scripts/scrape-frac-centre.mjs --probe       # build ~20 in-scope end-to-end + R2 upload
//   node scripts/scrape-frac-centre.mjs --full        # full in-scope scrape + R2, resumable

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

const SLUG = 'frac-centre';
const COLLECTION_STEM = `${SLUG}-collection`;
const NAVIGART_ID = '503';
const API = `https://api.navigart.fr/${NAVIGART_ID}/artworks`;
const IMG_SIZE = '1000'; // max raster token on images.navigart.fr (≥600px long edge for most)
const SPA_BASE = 'https://collection.frac-centre.fr/artwork'; // public detail page (Navigart SPA)
const UA = 'armin-museum-research/1.0';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const PROGRESS = path.join(STATE_DIR, `${SLUG}-progress.json`);
const FAILED = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : args.includes('--probe') ? 'probe' : 'classify';
const PROBE_TARGET = 20;
const PAGE = 200;              // API page size for listing
const CONC = 5;                // image download/upload concurrency
const CAP_BYTES = 23 * 1024 * 1024; // hard JSON size cap

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ---------- API fetch (paged listing) ----------
async function fetchPage(from, size) {
  const url = `${API}?sort=by_inv&size=${size}&from=${from}`;
  for (let att = 1; att <= 4; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (r.status === 429) { await sleep(2000 * att); continue; } // respect rate-limit
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const ct = r.headers.get('content-type') || '';
      if (!ct.includes('application/json')) throw new Error(`non-json ${ct}`);
      return await r.json();
    } catch (e) { if (att === 4) throw new Error(`page from=${from}: ${e.message}`); await sleep(800 * att); }
  }
}

async function getTotal() {
  const d = await fetchPage(0, 1);
  return d.totalCount || d.filteredCount || 0;
}

// ---------- scope classifier ----------
// Map a Frac Centre record to one of the in-scope flat categories, or null (out of scope).
function classify(art) {
  const domain = (art.domain || '').trim().toLowerCase().normalize('NFC');
  const deno = (art.domain_denomination || '').toLowerCase().normalize('NFC');

  if (domain === 'dessin') return 'drawing';
  if (domain === 'estampe') return 'print';
  if (domain === 'photographie') return 'photograph';
  if (domain === 'design graphique') {
    if (/affiche|poster|sérigraph|serigraph|lithograph|estampe/.test(deno)) return 'print';
    return 'drawing'; // flat graphic-design work on paper
  }
  // EXCLUDE: Architecture (maquette/model = 3D), Oeuvre en 3 dimensions (installation),
  //          Publication/livre/imprimé (books), anything else.
  return null;
}

// ---------- listing record → ARMIN artwork (pre-image) ----------
function decodeNL(s) { return (s || '').replace(/\s*\n\s*/g, ' ').trim(); }

function parseRecord(r) {
  const ua = r && r._source && r._source.ua;
  if (!ua) return null;
  const art = ua.artwork || {};
  const medias = ua.medias;
  const media = Array.isArray(medias) && medias.length ? medias[0] : null;

  const category = classify(art);
  if (!category) return null;                 // out of scope
  if (!media || !media.file_name || !media.url_template) return null; // no downloadable image

  const id = String(art._id || r._id || '');
  if (!id) return null;

  const title = decodeNL(art.title_notice || art.title_list || art.recap_title);
  let artist = decodeNL(art.authors_notice || art.authors_list || art.recap_authors);
  // legitimate "Anonyme"/"Sans auteur" kept as-is

  const dateStr = decodeNL(art.date_creation);
  const ym = dateStr.match(/\d{3,4}/);
  const year = ym ? parseInt(ym[0], 10) : null;

  const dimensions = decodeNL(art.dimensions);
  // Frac Centre records carry no free-text "medium" string; use the denomination as medium hint.
  const medium = decodeNL(art.domain_denomination || art.domain);
  const slug = art.slug || `${id}`;
  const imgUrl = media.url_template.replace('{size}', IMG_SIZE).replace('{file_name}', media.file_name);

  return {
    id, slug, title, artist, year, dateStr, medium, dimensions, category, imgUrl,
    objectNumber: decodeNL(art.recap_number || ''),
    dept: art.collection_department || '',
    domain: art.domain || '',
    denomination: art.domain_denomination || '',
    copyright: decodeNL(art.copyright || art.recap_copyright || media.copyright || ''),
    photographer: decodeNL(media.photographer || ''),
    birthDeath: decodeNL(art.authors_birth_death),
    sourceUrl: `${SPA_BASE}/${slug}`,
    maxW: media.max_width || null,
    maxH: media.max_height || null,
  };
}

// ---------- image: download full-size, verify ≥600px, autocrop, upload R2 ----------
async function dl(url) {
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
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
  if (meta.width && meta.height && Math.max(meta.width, meta.height) < 600)
    throw new Error(`thumb ${meta.width}x${meta.height}`);
  const { buffer } = await autocropToWebp(src);          // webp(2048/q85), no trim by default
  const hash8 = sha(a.imgUrl).slice(0, 8);
  const key = `artworks/${COLLECTION_STEM}/${a.id}-${hash8}-imageUrl.webp`;
  await uploadR2(key, buffer);
  return { imageUrl: `${R2_PUBLIC}/${key}`, srcW: meta.width || null, srcH: meta.height || null };
}

// ---------- record assembly (min-4 guard) — COMPACT shape ----------
function toArtwork(a, imageUrl) {
  if (!a.title || !a.artist || a.year == null || !a.category) return null; // min-4 → drop
  return {
    id: a.id,
    objectNumber: a.objectNumber || '',
    title: a.title,
    artist: a.artist,
    date: a.dateStr || String(a.year),
    year: a.year,
    medium: a.medium,
    dimensions: a.dimensions,
    category: a.category,
    description: '',
    imageUrl,
    thumbnailUrl: a.imgUrl,
    onDisplay: false,
    displayLocation: '',
    sourceUrl: a.sourceUrl,
    metadata: {
      department: a.dept,
      domain: a.domain,
      denomination: a.denomination,
      copyright: a.copyright,
      photographer: a.photographer,
      authors_birth_death: a.birthDeath,
    },
    original_imageUrl: a.imgUrl,
  };
}

function writeCollection(artworks, stem, compact) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'Frac Centre-Val de Loire',
    collection: 'Art & Architecture (ArchiLab)',
    website: 'https://www.frac-centre.fr/collection-art-architecture',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'api',
    category_breakdown: cats,
    artworks,
  };
  const out = path.join(REPO, 'public/data', `${stem}.json`);
  fs.writeFileSync(out, compact ? JSON.stringify(payload) : JSON.stringify(payload, null, 2));
  const mb = (fs.statSync(out).size / 1024 / 1024).toFixed(2);
  console.log(`[write] ${out} (${artworks.length} works, ${mb} MB) breakdown=`, cats);
  return out;
}

// prioritize named + dated works when capping a huge corpus
function priorityScore(a) {
  let s = 0;
  if (a.artist && !/^(anonyme|sans auteur)/i.test(a.artist)) s += 2;
  if (a.year != null) s += 1;
  if (a.dimensions) s += 1;
  return s;
}

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const total = await getTotal();
  console.log(`[fetch] Frac Centre Navigart id=${NAVIGART_ID} totalCount=${total}`);

  if (MODE === 'classify') {
    const tally = {}; const domTally = {}; let inScope = 0, scanned = 0, noImg = 0, drop4 = 0;
    for (let from = 0; from < total; from += PAGE) {
      const d = await fetchPage(from, PAGE);
      for (const r of d.results || []) {
        scanned++;
        const ua = r._source && r._source.ua; if (!ua) continue;
        const art = ua.artwork || {};
        const dom = (art.domain || '').trim(); domTally[dom] = (domTally[dom] || 0) + 1;
        const a = parseRecord(r);
        if (!a) { if (!(Array.isArray(ua.medias) && ua.medias.length)) noImg++; continue; }
        inScope++; tally[a.category] = (tally[a.category] || 0) + 1;
        if (!a.title || !a.artist || a.year == null) drop4++;
      }
      if (from % (PAGE * 10) === 0) console.log(`  …scanned ${scanned}/${total} in-scope ${inScope}`);
      await sleep(120);
    }
    console.log('\n[classify] scanned:', scanned, '| no-image:', noImg);
    console.log('[classify] in-scope (flat + with image):', inScope, '| would drop on min-4:', drop4);
    console.log('[classify] in-scope breakdown:', tally);
    console.log('[classify] ALL domains (incl. out-of-scope):', JSON.stringify(domTally, null, 0));
    return;
  }

  // probe / full: gather in-scope candidate records (with image)
  const candidates = [];
  const limitScan = MODE === 'probe' ? 800 : total; // probe only needs enough to find 20
  for (let from = 0; from < limitScan; from += PAGE) {
    const d = await fetchPage(from, PAGE);
    for (const r of d.results || []) {
      const a = parseRecord(r);
      if (a) candidates.push(a);
    }
    if (MODE === 'probe' && candidates.length >= PROBE_TARGET * 3) break;
    if (MODE === 'full' && from % (PAGE * 10) === 0)
      console.log(`  …listing ${Math.min(from + PAGE, total)}/${total}, in-scope so far ${candidates.length}`);
    await sleep(120);
  }
  console.log(`[${MODE}] in-scope candidates (with image): ${candidates.length}`);

  let work = candidates;
  if (MODE === 'probe') {
    work = candidates.slice().sort((x, y) => priorityScore(y) - priorityScore(x)).slice(0, PROBE_TARGET);
  } else {
    work = candidates.slice().sort((x, y) => priorityScore(y) - priorityScore(x));
  }

  // resumable: load already-done ids (full mode)
  let doneIds = new Set();
  if (MODE === 'full' && fs.existsSync(PROGRESS)) {
    try { doneIds = new Set(JSON.parse(fs.readFileSync(PROGRESS, 'utf8')).doneIds || []); } catch {}
    console.log(`[full] resuming: ${doneIds.size} ids already processed`);
  }

  const artworks = [];
  let done = 0, imgErr = 0, drop4 = 0, bytesEst = 0;
  let idx = 0; let capped = false;
  const persist = () => { if (MODE === 'full') fs.writeFileSync(PROGRESS, JSON.stringify({ doneIds: [...doneIds] })); };

  await Promise.all(Array.from({ length: CONC }, async () => {
    while (idx < work.length && !capped) {
      const a = work[idx++];
      if (doneIds.has(a.id)) continue;
      try {
        const { imageUrl } = await processImage(a);
        const w = toArtwork(a, imageUrl);
        if (w) {
          artworks.push(w);
          bytesEst += JSON.stringify(w).length + 2;
          if (MODE === 'full' && bytesEst > CAP_BYTES) { capped = true; console.log(`[full] hit size cap (~${(bytesEst/1024/1024).toFixed(1)}MB) at ${artworks.length} works`); }
        } else drop4++;
        doneIds.add(a.id);
      } catch (e) {
        imgErr++;
        fs.appendFileSync(FAILED, JSON.stringify({ id: a.id, url: a.imgUrl, err: String(e.message || e) }) + '\n');
        if (imgErr <= 8) console.log(`  img err id=${a.id}: ${e.message}`);
      }
      if (++done % 100 === 0) { console.log(`  …${done}/${work.length} (ok ${artworks.length}, imgErr ${imgErr}, ~${(bytesEst/1024/1024).toFixed(1)}MB)`); persist(); }
    }
  }));
  persist();

  artworks.sort((x, y) => String(x.id).localeCompare(String(y.id)));
  const stem = MODE === 'probe' ? `${COLLECTION_STEM}-probe` : COLLECTION_STEM;
  writeCollection(artworks, stem, /*compact*/ MODE === 'full');
  console.log(`\n[${MODE}] DONE. collected ${artworks.length} | img errors ${imgErr} | min4-drops ${drop4}`);
  if (MODE === 'probe') {
    const sample = artworks.slice(0, 6).map((w) => ({ id: w.id, cat: w.category, title: w.title.slice(0, 40), artist: w.artist.slice(0, 30), year: w.year, img: w.imageUrl }));
    console.log('[probe] sample:', JSON.stringify(sample, null, 2));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
