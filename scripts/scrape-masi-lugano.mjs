#!/usr/bin/env node
// MASI Lugano (Museo d'arte della Svizzera italiana, Lugano) — full collection scraper.
// Source: museum-OWN open Apache Solr core on the museum's own domain, no auth/key.
//   GET https://collezione.masilugano.ch/solr/published/select?q=category_en_s:{Cat}&wt=json&rows=N&start=M&sort=oid+asc
//   (Zetcom MuseumPlus/eMuseum back end + Next.js front; solrPath:/solr/published found in JS bundle.)
//   Send Referer https://collezione.masilugano.ch/en/collection/ + a browser UA.
//
// All metadata is INLINE per Solr doc (no detail fetch): oid, title_{en,it,fr,de}_s,
//   person_ss (ARRAY "Name (dates)"), date_s, material_en_s (medium), dimension_s,
//   category_en_s, number_s (inv), img_s (FULL-size .large.jpg), display_lac_s/display_palace_s.
// Full image = https://collezione.masilugano.ch/{img_s}  (e.g. multimedia/3/multimedia-62813.large.jpg,
//   verified 1200px / ~0.8MB; the .small.jpg is the ~60KB thumb and is ignored).
//
// SCOPE: flat visual works only, classified by the museum's own category_en_s string field.
//   PAINTINGS (category Painting): collect ALL — no cap, no value-filter.
//   OTHER 2D (Drawing, Print, Photography, Collage, Fresco): value-filter — skip study/sketch/copy.
//   EXCLUDED (3D / non-flat): Sculpture, Installation, Object, Book, Video, Video installation,
//     Decorative Arts, Ceramic, Mosaic, Tapestry.
//   In-scope total = 1567 + 653 + 555 + 476 + 6 + 6 = 3263 (all 100% imaged).
//
// category_en_s is an exact-match STRING field: query ONE category per request
//   (q=category_en_s:Painting). A parenthesized OR returns 0 docs (Solr parser quirk on this core).
//
// METADATA: artist kept as source (person_ss joined "; "); a missing artist is NEVER filled with
//   "Anonymous" — such a record simply fails the min-4 guard (title+artist+year+category) and is dropped
//   (42 paintings lack person_ss, 34 lack date_s — these drop, by design).
//
// Usage:
//   node scripts/scrape-masi-lugano.mjs --classify   # dry-run: per-category scope tally (no images)
//   node scripts/scrape-masi-lugano.mjs --pilot      # fetch ~20 in-scope, verify image dims, NO R2, write pilot JSON
//   node scripts/scrape-masi-lugano.mjs --full       # full scrape + R2 upload, write collection JSON

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

const SLUG = 'masi-lugano';
const COLLECTION_STEM = `${SLUG}-collection`;
const ORIGIN = 'https://collezione.masilugano.ch';
const SOLR = `${ORIGIN}/solr/published/select`;
const REFERER = `${ORIGIN}/en/collection/`;
const ITEM_BASE = `${ORIGIN}/en/collection/item`;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');

// In-scope categories. Painting collects ALL; the rest are value-filtered (skip study/sketch/copy).
const SCOPE_CATS = ['Painting', 'Drawing', 'Print', 'Photography', 'Collage', 'Fresco'];
// category_en_s → normalized ARMIN category.
const CAT_MAP = { Painting: 'painting', Drawing: 'drawing', Print: 'print', Photography: 'photograph', Collage: 'collage', Fresco: 'fresco' };

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : args.includes('--pilot') ? 'pilot' : 'classify';
const PILOT_TARGET = 20;
const ROWS = 300;

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ---------- Solr fetch (one category per request, paginate start/rows) ----------
async function solr(params) {
  const qs = new URLSearchParams({ wt: 'json', ...params }).toString();
  const url = `${SOLR}?${qs}`;
  for (let att = 1; att <= 4; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Referer: REFERER, Accept: 'application/json' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) { if (att === 4) throw new Error(`${e.message} @ ${url}`); await sleep(600 * att); }
  }
}

async function fetchCategory(cat, limit = Infinity) {
  const head = await solr({ q: `category_en_s:${cat}`, rows: '0' });
  const numFound = head.response.numFound;
  const target = Math.min(numFound, limit);
  const docs = [];
  for (let start = 0; start < target; start += ROWS) {
    const rows = Math.min(ROWS, target - start);
    const j = await solr({ q: `category_en_s:${cat}`, rows: String(rows), start: String(start), sort: 'oid asc' });
    docs.push(...j.response.docs);
    await sleep(250);
  }
  return { numFound, docs };
}

// ---------- value filter (non-painting 2D only): skip study / sketch / copy ----------
// Conservative: match whole-word study/sketch/copy markers in the title (IT+EN) or medium.
const STUDY_RE = /\b(bozzetto|schizzo|studio per|study for|sketch for|preparatory|preliminary|copia da|copia di|copy after|copy of|after the|riproduzione)\b/i;
function isStudyOrCopy(title, medium) {
  const t = `${title || ''} ${medium || ''}`.toLowerCase();
  return STUDY_RE.test(t);
}

// ---------- Solr doc → ARMIN artwork (pre-image) ----------
function parseDoc(doc) {
  const oid = String(doc.oid || '').trim();
  const title = (doc.title_en_s || doc.title_it_s || doc.title_fr_s || doc.title_de_s || '').trim();
  // person_ss is an array of "Name (dates)" — keep raw, join with "; ".
  const persons = Array.isArray(doc.person_ss) ? doc.person_ss : (doc.person_ss ? [doc.person_ss] : []);
  const artist = persons.map((p) => String(p).trim()).filter(Boolean).join('; ');
  const dateStr = (doc.date_s || '').trim();           // e.g. "1908-1909", "1880 circa"
  const ym = dateStr.match(/\d{4}/);
  const year = ym ? parseInt(ym[0], 10) : null;
  const medium = (doc.material_en_s || '').trim();
  const dimensions = (doc.dimension_s || '').trim();
  const objectNumber = (doc.number_s || '').trim();
  const catEn = (doc.category_en_s || '').trim();
  const category = CAT_MAP[catEn] || null;
  const imgPath = (doc.img_s || '').trim();
  const imgUrl = imgPath ? `${ORIGIN}/${imgPath}` : null;
  const thumbPath = (doc.thumb_s || '').trim();
  const thumbUrl = thumbPath ? `${ORIGIN}/${thumbPath}` : null;
  const onDisplay = doc.display_lac_s === 'true' || doc.display_palace_s === 'true';
  const displayLocation = doc.display_lac_s === 'true' ? 'LAC Lugano Arte e Cultura'
    : doc.display_palace_s === 'true' ? 'Palazzo Reali' : '';
  return { oid, title, artist, year, dateStr, medium, dimensions, objectNumber, catEn, category,
    imgUrl, thumbUrl, onDisplay, displayLocation, sourceUrl: `${ITEM_BASE}/${oid}/` };
}

// ---------- image: download full-size .large.jpg, autocrop(no-trim)→webp, upload to R2 ----------
async function dl(url) {
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Referer: REFERER } });
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

// Returns { imageUrl, srcW, srcH }. In pilot mode uploadR2 is skipped (imageUrl = original full URL).
async function processImage(a, { upload }) {
  const src = await dl(a.imgUrl);
  const meta = await (await import('sharp')).default(src).metadata().catch(() => ({}));
  if (meta.width && Math.max(meta.width, meta.height) < 600) throw new Error(`thumb ${meta.width}x${meta.height}`);
  if (!upload) return { imageUrl: a.imgUrl, srcW: meta.width || null, srcH: meta.height || null };
  const { buffer } = await autocropToWebp(src);          // no trim opts → pure webp(2048/q85)
  const hash8 = sha(a.imgUrl).slice(0, 8);
  const key = `artworks/${COLLECTION_STEM}/${a.oid}-${hash8}-imageUrl.webp`;
  await uploadR2(key, buffer);
  return { imageUrl: `${R2_PUBLIC}/${key}`, srcW: meta.width || null, srcH: meta.height || null };
}

// ---------- record assembly (min-4 guard: title + artist + year + category) ----------
function toArtwork(a, imageUrl, srcPx) {
  if (!a.title || !a.artist || a.year == null || !a.category) return null; // min-4 → drop
  return {
    id: a.oid,                       // stable native id, UN-prefixed (orchestrator prefixes at registration)
    objectNumber: a.objectNumber,
    title: a.title,
    artist: a.artist,
    date: a.dateStr || (a.year != null ? String(a.year) : ''),
    year: a.year,
    medium: a.medium,
    dimensions: a.dimensions,
    category: a.category,
    description: '',
    imageUrl,
    thumbnailUrl: a.thumbUrl || '',
    onDisplay: a.onDisplay,
    displayLocation: a.displayLocation,
    sourceUrl: a.sourceUrl,
    metadata: { oid: a.oid, source_category: a.catEn, src_px: srcPx || '' },
    original_imageUrl: a.imgUrl,
  };
}

function writeCollection(artworks, stem) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'Museo d’arte della Svizzera italiana (MASI Lugano)',
    collection: 'Collection',
    website: 'https://collezione.masilugano.ch/en/collection/',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'api',
    category_breakdown: cats,
    artworks,
  };
  const out = path.join(REPO, 'public/data', `${stem}.json`);
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
  console.log(`[write] ${out} (${artworks.length} works) breakdown=`, cats);
  return out;
}

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });

  // ---- gather in-scope candidates across categories ----
  // Painting: ALL. Others: value-filter (skip study/sketch/copy).
  const candidates = [];
  const tally = {};
  let totalInScope = 0, valueFiltered = 0, noImg = 0, dropMin4 = 0;

  for (const cat of SCOPE_CATS) {
    // pilot: pull just a handful per category so we exercise multiple categories cheaply.
    const perCatLimit = MODE === 'pilot' ? Math.ceil(PILOT_TARGET / SCOPE_CATS.length) + 2 : Infinity;
    const { numFound, docs } = await fetchCategory(cat, perCatLimit);
    if (MODE !== 'pilot') console.log(`[fetch] ${cat}: numFound=${numFound}, pulled=${docs.length}`);
    for (const doc of docs) {
      const a = parseDoc(doc);
      totalInScope++;
      tally[a.category] = (tally[a.category] || 0) + 1;
      if (!a.imgUrl) { noImg++; continue; }
      // value filter applies to NON-painting 2D only.
      if (a.category !== 'painting' && isStudyOrCopy(a.title, a.medium)) { valueFiltered++; continue; }
      if (!a.title || !a.artist || a.year == null) { dropMin4++; continue; } // min-4 pre-check
      candidates.push(a);
    }
  }

  console.log('\n[classify] in-scope docs seen:', totalInScope, '| breakdown:', tally);
  console.log('[classify] value-filtered (study/sketch/copy, non-painting):', valueFiltered);
  console.log('[classify] missing image:', noImg, '| dropped on min-4 (no title/artist/year):', dropMin4);
  console.log('[classify] surviving candidates:', candidates.length);

  if (MODE === 'classify') {
    const noArtist = candidates.length; // already filtered; show a few survivors + a few that dropped
    console.log('\n[classify] sample survivors:');
    for (const a of candidates.slice(0, 8)) console.log('   -', a.category, '|', JSON.stringify(a.title).slice(0, 38), '|', a.artist, '|', a.year);
    console.log(`\n[classify] EXPECTED full-run in-scope universe = 3263 (Painting 1567 ALL + Drawing 653 + Print 555 + Photography 476 + Collage 6 + Fresco 6, value-filtered).`);
    return;
  }

  // ---- image processing ----
  const pool = MODE === 'pilot' ? candidates.slice(0, PILOT_TARGET) : candidates;
  const upload = MODE !== 'pilot'; // pilot = NO R2 upload
  console.log(`\n[${MODE}] image-processing ${pool.length} candidates${upload ? ' → R2' : ' (NO R2 upload; verify dims + metadata only)'} …`);

  const artworks = [];
  let done = 0, imgErr = 0;
  const CONC = MODE === 'pilot' ? 3 : 5;
  let idx = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (idx < pool.length) {
      const a = pool[idx++];
      try {
        const { imageUrl, srcW, srcH } = await processImage(a, { upload });
        const w = toArtwork(a, imageUrl, srcW && srcH ? `${srcW}x${srcH}` : '');
        if (w) artworks.push(w); else dropMin4++;
      } catch (e) {
        imgErr++;
        fs.appendFileSync(path.join(STATE_DIR, `${SLUG}-failed.ndjson`), JSON.stringify({ oid: a.oid, url: a.imgUrl, err: String(e.message || e) }) + '\n');
        if (imgErr <= 5) console.log(`  img err oid=${a.oid}: ${e.message}`);
      }
      if (++done % 50 === 0) console.log(`  …${done}/${pool.length} (ok ${artworks.length}, imgErr ${imgErr})`);
    }
  }));

  artworks.sort((x, y) => Number(x.id) - Number(y.id));
  const stem = MODE === 'pilot' ? `${COLLECTION_STEM}-pilot` : COLLECTION_STEM;
  writeCollection(artworks, stem);
  console.log(`\n[${MODE}] DONE. collected ${artworks.length} | img errors ${imgErr} | min4-drops(post-image) ${dropMin4}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
