#!/usr/bin/env node
// CNAP — Centre national des arts plastiques (Paris, France) — full collection scraper.
// GENRE: 디자인 (design / graphic design / poster / photograph / drawing) — FLAT works only.
//
// Source: museum-OWN Navigart JSON API (GColl / Videomuseum backend), no auth, no key.
//   GET https://api.navigart.fr/15/artworks?sort=by_inv&size=N&from=M
//   ("15" = CNAP's collection id on Navigart; the public SPA is www.cnap.fr/collection-en-ligne)
//   Returns { totalCount, filteredCount, results:[ { _id, _source.ua.{ artwork, medias, authors } } ] }.
//   totalCount = 128,640 works; ~97,095 carry an image.
//
// Metadata comes from the DETAIL record _source.ua.artwork (every field is present there):
//   title_notice, authors_notice/authors_list, authors_birth_death, authors_nationality,
//   date_creation (raw FR string), mst (medium), dimensions, inventory, copyright,
//   collection_department (the reliable in-scope filter), domain (artwork type), slug.
// Full image = first media's url_template (https://images.navigart.fr/{size}/{file_name}).
//   {size} valid raster tokens: 1000 (max, ~1000px long edge) and 800. Use 1000 → ≥600px guaranteed.
//   Reproduction rights: all in-scope sampled records carry "Reproduction internet autorisée".
//
// SCOPE (디자인, flat visual works only) — classify by collection_department + medium/domain:
//   - "Cabinet de la photographie"  → photograph   (ALL)
//   - "Cabinet d'art graphique"     → drawing/print/mixed_media_2d by `mst`   (ALL flat works on paper)
//   - "Design"                      → ONLY flat design (drawings/posters/graphic);
//                                     EXCLUDE 3D design objects (vase/lamp/furniture: domain contains "Objet")
//   Excluded departments: Arts Plastiques (painting/sculpture), Cinéma (moving image),
//     Nouveaux medias (video/new media), Architecture (3D-adjacent; kept out to stay flat-focused).
//   Excluded always: records with no media (no downloadable image).
//   Photographs & drawings are NEVER colour-gated (per COLLECTION_SCRAPING_GUIDE §1).
//
// >25k in-scope → COMPACT JSON + prioritize named+dated, cap output under 23MB (see CAP_BYTES).
//
// Usage:
//   node scripts/scrape-cnap-france.mjs --classify        # dry-run: scope tally only (no images, fast)
//   node scripts/scrape-cnap-france.mjs --probe           # build ~15 in-scope end-to-end + R2 upload
//   node scripts/scrape-cnap-france.mjs --full            # full in-scope scrape + R2, resumable

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

const SLUG = 'cnap-france';
const COLLECTION_STEM = `${SLUG}-collection`;
const NAVIGART_ID = '15';
const API = `https://api.navigart.fr/${NAVIGART_ID}/artworks`;
const IMG_SIZE = '1000'; // max raster token on images.navigart.fr (≥600px long edge)
const SPA_BASE = 'https://www.cnap.fr/collection-en-ligne/#/artwork'; // public detail page (Navigart SPA)
const UA = 'armin-museum-research/1.0';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const PROGRESS = path.join(STATE_DIR, `${SLUG}-progress.json`);
const FAILED = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : args.includes('--probe') ? 'probe' : 'classify';
const PROBE_TARGET = 15;
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
      if (r.status === 429) { await sleep(2000 * att); continue; } // RETRY hint: respect rate-limit
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
// Map a CNAP record to one of the in-scope categories, or null (out of scope).
function classify(art) {
  const dept = (art.collection_department || '').trim();
  const mst = (art.mst || '').toLowerCase().normalize('NFC');
  const domain = (art.domain || '').toLowerCase().normalize('NFC');
  const deno = (art.domain_denomination || '').toLowerCase().normalize('NFC');
  const blob = `${domain} ${deno} ${art.domain_leaf || ''}`.toLowerCase();

  if (dept === 'Cabinet de la photographie') return 'photograph';

  if (dept === "Cabinet d'art graphique" || dept === 'Cabinet d’art graphique') {
    return graphicCategory(mst, blob);
  }

  if (dept === 'Design') {
    // include only FLAT design work; exclude 3D objects (vase, lamp, furniture, etc.)
    if (/objet/.test(blob)) return null;                 // "Objet/Design", "Objet" → 3D object
    if (/sculptur|mobilier|meuble|luminaire|vaisselle|céramique|verre\b/.test(blob)) return null;
    // flat: drawings ("Dessin design"), colour studies ("Design couleur"), posters/affiches
    if (/affiche|poster/.test(blob)) return 'print';
    return graphicCategory(mst, blob);
  }

  return null; // all other departments (Arts plastiques / Cinéma / Nouveaux medias / Architecture) out of scope
}

// classify a works-on-paper / flat record by its medium string
function graphicCategory(mst, blob) {
  // PRINT (multiples)
  if (/lithograph|litho|sérigraph|serigraph|sérigraphie|eau-forte|eau forte|gravure|estampe|aquatinte|pointe sèche|burin|xylograph|bois gravé|linogravure|offset|héliogravure|photogravure|tirage offset|impression|imprimé/.test(mst))
    return 'print';
  if (/affiche|poster/.test(blob)) return 'print';
  // mixed media on paper / collage
  if (/collage|montage|technique mixte|mixed media|photomontage/.test(mst)) return 'mixed_media_2d';
  // DRAWING (default for works on paper: pencil, ink, gouache, charcoal, pastel, watercolour)
  if (/crayon|mine de plomb|encre|plume|fusain|sanguine|pastel|gouache|aquarelle|lavis|feutre|stylo|pointe d.argent|pierre noire|craie|dessin/.test(mst))
    return 'drawing';
  // medium-less or paint-under-glass etc.: still a flat graphic work → drawing
  return 'drawing';
}

// ---------- detail-record → ARMIN artwork (pre-image) ----------
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

  const title = decodeNL(art.title_notice || art.title_list);
  // artist: prefer the readable notice form (e.g. "MAN RAY (Emmanuel RADNITZKY, dit)")
  let artist = decodeNL(art.authors_notice || art.authors_list);
  if (/^(anonyme|sans auteur|anonymous)/i.test(artist)) artist = artist; // keep — legitimate "Anonyme"

  const dateStr = decodeNL(art.date_creation);
  const ym = dateStr.match(/\d{3,4}/);
  const year = ym ? parseInt(ym[0], 10) : null;

  const medium = decodeNL(art.mst);
  const dimensions = decodeNL(art.dimensions);
  const slug = art.slug || `${id}`;
  const imgUrl = media.url_template.replace('{size}', IMG_SIZE).replace('{file_name}', media.file_name);

  return {
    id, slug, title, artist, year, dateStr, medium, dimensions, category, imgUrl,
    objectNumber: decodeNL(art.inventory),
    dept: art.collection_department || '',
    domain: art.domain || '',
    copyright: decodeNL(art.copyright),
    nationality: decodeNL(art.authors_nationality),
    birthDeath: decodeNL(art.authors_birth_death),
    reproRights: decodeNL(art.artw_reproduction_rights),
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
      copyright: a.copyright,
      nationality: a.nationality,
      reproduction_rights: a.reproRights,
    },
    original_imageUrl: a.imgUrl,
  };
}

function writeCollection(artworks, stem, compact) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'Centre national des arts plastiques (Cnap)',
    collection: 'Design, Photography & Graphic Arts',
    website: 'https://www.cnap.fr/collection-en-ligne',
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
  if (a.medium) s += 1;
  return s;
}

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const total = await getTotal();
  console.log(`[fetch] CNAP Navigart id=${NAVIGART_ID} totalCount=${total}`);

  if (MODE === 'classify') {
    // sample-page through the whole collection, tally scope (no images)
    const tally = {}; let inScope = 0, scanned = 0, noImg = 0, drop4 = 0;
    for (let from = 0; from < total; from += PAGE) {
      const d = await fetchPage(from, PAGE);
      for (const r of d.results || []) {
        scanned++;
        const a = parseRecord(r);
        if (!a) continue;
        // parseRecord already requires media+in-scope; count it
        inScope++; tally[a.category] = (tally[a.category] || 0) + 1;
        if (!a.title || !a.artist || a.year == null) drop4++;
      }
      if (from % (PAGE * 10) === 0) console.log(`  …scanned ${scanned}/${total} in-scope ${inScope}`);
      await sleep(150);
    }
    console.log('\n[classify] scanned:', scanned);
    console.log('[classify] in-scope (with image):', inScope, '| would drop on min-4:', drop4);
    console.log('[classify] breakdown:', tally);
    return;
  }

  // probe / full: gather in-scope candidate records (with image)
  const candidates = [];
  const limitScan = MODE === 'probe' ? 600 : total; // probe only needs to scan enough to find 15
  for (let from = 0; from < limitScan; from += PAGE) {
    const d = await fetchPage(from, PAGE);
    for (const r of d.results || []) {
      const a = parseRecord(r);
      if (a) candidates.push(a);
    }
    if (MODE === 'probe' && candidates.length >= PROBE_TARGET * 3) break;
    if (MODE === 'full' && from % (PAGE * 10) === 0)
      console.log(`  …listing ${Math.min(from + PAGE, total)}/${total}, in-scope so far ${candidates.length}`);
    await sleep(150);
  }
  console.log(`[${MODE}] in-scope candidates (with image): ${candidates.length}`);

  let work = candidates;
  if (MODE === 'probe') {
    // probe: prefer named+dated for a representative end-to-end sample
    work = candidates.slice().sort((x, y) => priorityScore(y) - priorityScore(x)).slice(0, PROBE_TARGET);
  } else {
    // full: prioritize named+dated first so a size-cap keeps the best records
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
    const sample = artworks.slice(0, 5).map((w) => ({ id: w.id, cat: w.category, title: w.title.slice(0, 40), artist: w.artist.slice(0, 30), year: w.year, img: w.imageUrl }));
    console.log('[probe] sample:', JSON.stringify(sample, null, 2));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
