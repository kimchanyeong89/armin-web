#!/usr/bin/env node
// Solomon R. Guggenheim Museum (New York) — collection scraper.
// Source: museum-OWN WordPress REST API (custom post type `artwork`), no auth, CORS-open.
//   GET https://www.guggenheim.org/wp-json/wp/v2/artwork?artwork_type={termId}&per_page=100&page=P&_embed=1
// Metadata comes from the DETAIL record + its _embedded taxonomy terms:
//   title.rendered, _embedded.wp:term artist / decade / artwork_type,
//   _embedded.wp:featuredmedia[0].source_url (full image).
//
// ⚠️ SITE LIMITATION (verified Phase A): medium + dimensions are NOT public anywhere
//   (content/excerpt empty; the rich tombstone lives behind the key-walled api.guggenheim.org
//   Collections API → 401). We keep medium="" / dimensions="" (SHOULD per guide; min-4 still
//   passes). Date granularity is DECADE-only — derive year from the decade term ("2010s"→2010).
//
// SCOPE (this collection): painting · photograph · drawing.
//   Query the three in-scope artwork_type term-ids directly (cleaner than fetching all 2016
//   and inferring the ~10% with empty artwork_type):
//     Painting     1811  → painting   (collect ALL, no cap, no value-filter)
//     Photography  1805  → photograph (value-filter: tiny images only)
//     Work on paper 1861 → drawing    (value-filter: skip study/sketch/copy prefixes + tiny)
//   EXCLUDED (out of scope): Sculpture 1820, Installation 1804, Film/Video 1807, Internet Art 2053.
//
// Usage:
//   node scripts/scrape-guggenheim-ny.mjs --classify   # dry-run: scope tally only (no images)
//   node scripts/scrape-guggenheim-ny.mjs --pilot      # build ~20 in-scope, NO R2 upload, write pilot JSON
//   node scripts/scrape-guggenheim-ny.mjs --full       # full scrape + R2 upload, write collection JSON

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

const SLUG = 'guggenheim-ny';
const COLLECTION_STEM = `${SLUG}-collection`;
const API = 'https://www.guggenheim.org/wp-json/wp/v2/artwork';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');

// in-scope artwork_type terms → ARMIN category. Order = scrape order.
const TYPE_MAP = [
  { termId: 1811, category: 'painting', filter: false },   // Painting — collect ALL
  { termId: 1805, category: 'photograph', filter: true },  // Photography — value-filter
  { termId: 1861, category: 'drawing', filter: true },     // Work on paper — value-filter
];
const MIN_LONG_EDGE = 600; // reject thumbnails / tiny derivatives (long edge < 600px)

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : args.includes('--pilot') ? 'pilot' : 'classify';
const PILOT_TARGET = 20;

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const decodeEntities = (s) => (s || '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#8217;/g, '’')
  .replace(/&#8216;/g, '‘').replace(/&#8211;/g, '–').replace(/&#8212;/g, '—')
  .replace(/&#8220;/g, '“').replace(/&#8221;/g, '”').replace(/&#8230;/g, '…')
  .replace(/&hellip;/g, '…').replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).trim();

// ---------- fetch layer ----------
async function getPage(termId, page) {
  const url = `${API}?artwork_type=${termId}&per_page=100&page=${page}&_embed=1`;
  for (let att = 1; att <= 4; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (r.status === 400) return { data: [], total: 0, done: true }; // page past end
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const total = parseInt(r.headers.get('x-wp-total') || '0', 10);
      const totalPages = parseInt(r.headers.get('x-wp-totalpages') || '0', 10);
      const data = await r.json();
      return { data, total, totalPages };
    } catch (e) { if (att === 4) throw e; await sleep(600 * att); }
  }
}

async function fetchType(termId) {
  const out = [];
  const first = await getPage(termId, 1);
  out.push(...first.data);
  const totalPages = first.totalPages || 1;
  for (let p = 2; p <= totalPages; p++) {
    await sleep(500);
    const r = await getPage(termId, p);
    if (r.done) break;
    out.push(...r.data);
  }
  return { records: out, total: first.total };
}

// ---------- detail-record → ARMIN artwork ----------
function parseRecord(r, category) {
  const terms = ((r._embedded && r._embedded['wp:term']) || []).flat().filter(Boolean);
  const artist = terms
    .filter((x) => x.taxonomy === 'artist')
    .map((x) => decodeEntities(x.name))
    .filter(Boolean)
    .join('; ');

  // year = decade-start integer ("2010s" → 2010). Keep the decade string as `date`.
  const decadeTerm = terms.find((x) => x.taxonomy === 'decade');
  const decadeStr = decadeTerm ? String(decadeTerm.name).trim() : '';
  const decMatch = decadeStr.match(/\d{4}/);
  const year = decMatch ? parseInt(decMatch[0], 10) : null;

  const title = decodeEntities(r.title && r.title.rendered);

  // full-size image: prefer media_details.sizes.full, else top-level source_url
  const fm = r._embedded && r._embedded['wp:featuredmedia'] && r._embedded['wp:featuredmedia'][0];
  let imgUrl = null, mdW = null, mdH = null;
  if (fm) {
    const md = fm.media_details || {};
    const full = (md.sizes && md.sizes.full) || null;
    imgUrl = (full && full.source_url) || fm.source_url || null;
    mdW = (full && full.width) || md.width || null;
    mdH = (full && full.height) || md.height || null;
  }

  return {
    id: String(r.slug || r.id),  // slug = museum accession id (e.g. 33103); stable, NOT prefixed here
    wpId: r.id,
    title, artist, year,
    date: decadeStr,
    category,
    imgUrl, mdW, mdH,
    sourceUrl: r.link || `https://www.guggenheim.org/artwork/${r.slug}`,
  };
}

// value-filter for non-painting 2D (skip preparatory / copy works; tiny images handled at image stage).
// Paintings are NEVER value-filtered (filter=false). medium/dims unavailable → title-prefix heuristic only.
const PREP_PREFIX = /^(study|sketch|drawing|cartoon|copy)\s+(for|after|of)\b/i;
function passesValueFilter(p) {
  if (PREP_PREFIX.test(p.title)) return false;
  return true;
}

// ---------- image: download full-size, autocrop, upload to R2 ----------
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

async function processImage(a, uploadEnabled) {
  const src = await dl(a.imgUrl);                       // full-size jpeg from museum CDN
  const meta = await (await import('sharp')).default(src).metadata().catch(() => ({}));
  const longEdge = Math.max(meta.width || 0, meta.height || 0);
  if (longEdge && longEdge < MIN_LONG_EDGE) throw new Error(`thumb ${meta.width}x${meta.height}`);
  const { buffer } = await autocropToWebp(src);         // webp(2048/q85), no trim (autocrop OFF)
  const hash8 = sha(a.imgUrl).slice(0, 8);
  const key = `artworks/${COLLECTION_STEM}/${a.id}-${hash8}-imageUrl.webp`;
  if (uploadEnabled) await uploadR2(key, buffer);
  return { imageUrl: `${R2_PUBLIC}/${key}`, srcW: meta.width || null, srcH: meta.height || null };
}

// ---------- record assembly (min-4 guard) ----------
function toArtwork(a, imageUrl) {
  // min-4: title + artist + year + category must be REAL. NEVER fill artist with Anonymous.
  if (!a.title || !a.artist || a.year == null || !a.category) return null;
  return {
    id: a.id,
    objectNumber: a.id,
    title: a.title,
    artist: a.artist,
    date: a.date || (a.year != null ? String(a.year) : ''),
    year: a.year,
    medium: '',          // ⚠️ not public on Guggenheim
    dimensions: '',      // ⚠️ not public on Guggenheim
    category: a.category,
    description: '',
    imageUrl,
    thumbnailUrl: a.imgUrl,
    onDisplay: false,
    displayLocation: '',
    sourceUrl: a.sourceUrl,
    metadata: { wp_id: a.wpId, accession: a.id, src_w: a.mdW, src_h: a.mdH },
    original_imageUrl: a.imgUrl,
  };
}

function writeCollection(artworks, stem) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'Solomon R. Guggenheim Museum',
    collection: 'Collection Online',
    website: 'https://www.guggenheim.org/collection-online',
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

  // fetch + parse each in-scope type
  let parsed = [];
  const typeTotals = {};
  for (const { termId, category, filter } of TYPE_MAP) {
    const { records, total } = await fetchType(termId);
    typeTotals[category] = { total, fetched: records.length };
    console.log(`[fetch] ${category} (type ${termId}): X-WP-Total=${total}, fetched=${records.length}`);
    for (const r of records) {
      const p = parseRecord(r, category);
      p._valueFilter = filter;
      parsed.push(p);
    }
  }

  // scope tally
  const tally = {};
  let inScope = 0, noImg = 0, valueDropped = 0, min4Drop = 0;
  for (const p of parsed) {
    const kept = !(p._valueFilter && !passesValueFilter(p));
    if (!kept) { valueDropped++; continue; }
    inScope++;
    tally[p.category] = (tally[p.category] || 0) + 1;
    if (!p.imgUrl) noImg++;
    if (!p.title || !p.artist || p.year == null) min4Drop++;
  }
  console.log('\n[classify] type totals:', JSON.stringify(typeTotals));
  console.log('[classify] total parsed:', parsed.length, '| value-filtered out (study/sketch/copy):', valueDropped);
  console.log('[classify] in-scope (post value-filter):', inScope, '| missing image:', noImg, '| would drop on min-4:', min4Drop);
  console.log('[classify] breakdown:', tally);

  if (MODE === 'classify') {
    const dropped = parsed.filter((p) => p._valueFilter && !passesValueFilter(p)).slice(0, 20);
    console.log('\n[classify] sample VALUE-FILTERED titles (preparatory/copy):');
    for (const p of dropped) console.log('   -', JSON.stringify(p.title).slice(0, 70));
    const noArtist = parsed.filter((p) => !p.artist).slice(0, 10);
    console.log('\n[classify] sample records with NO artist (would drop on min-4):', noArtist.length);
    for (const p of noArtist) console.log('   -', JSON.stringify(p.title).slice(0, 60), '| decade=', p.date);
    return;
  }

  // candidates: in-scope (post value-filter), with image
  let candidates = parsed.filter((p) => !(p._valueFilter && !passesValueFilter(p)) && p.imgUrl);
  const uploadEnabled = MODE === 'full';   // pilot = NO R2 upload (verify metadata only)
  if (MODE === 'pilot') candidates = candidates.slice(0, PILOT_TARGET);
  console.log(`\n[${MODE}] image-processing ${candidates.length} candidates${uploadEnabled ? ' → R2' : ' (NO upload)'} …`);

  const artworks = [];
  let done = 0, imgErr = 0;
  const CONC = 4;
  let idx = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (idx < candidates.length) {
      const a = candidates[idx++];
      try {
        const { imageUrl } = await processImage(a, uploadEnabled);
        const w = toArtwork(a, imageUrl);
        if (w) artworks.push(w); else min4Drop++;
      } catch (e) {
        imgErr++;
        fs.appendFileSync(path.join(STATE_DIR, `${SLUG}-failed.ndjson`), JSON.stringify({ id: a.id, url: a.imgUrl, err: String(e.message || e) }) + '\n');
        if (imgErr <= 8) console.log(`  img err id=${a.id}: ${e.message}`);
      }
      if (++done % 50 === 0) console.log(`  …${done}/${candidates.length} (ok ${artworks.length}, imgErr ${imgErr})`);
    }
  }));

  artworks.sort((x, y) => String(x.id).localeCompare(String(y.id), undefined, { numeric: true }));
  const stem = MODE === 'pilot' ? `${COLLECTION_STEM}-pilot` : COLLECTION_STEM;
  writeCollection(artworks, stem);
  console.log(`\n[${MODE}] DONE. collected ${artworks.length} | img errors ${imgErr} | min4-drops ${min4Drop}`);
  console.log(`[${MODE}] total in-scope offered = ${inScope}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
