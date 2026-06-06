#!/usr/bin/env node
// Museum Boijmans Van Beuningen (Rotterdam) — full collection scraper.
// Source: museum-OWN backend, NO aggregator.
//   1) ENUMERATION + structured fields: the site's own Algolia index
//      POST https://S1ZZM36I7L-dsn.algolia.net/1/indexes/production_collection_artworks/query
//      (public search-only key from the collection page's searchConfiguration).
//      Index holds BOTH languages → pin facetFilters ["locale:en"] to dedupe (57,612 en docs).
//      Algolia hard-caps page navigation at page*hitsPerPage<=1000, so we SLICE each category
//      by dating_start numeric ranges, recursively splitting any range with nbHits>1000,
//      plus a dating_start=0 (undated) bucket. This walks the WHOLE category, not just 1000.
//   2) DETAIL record (full image + dimensions): the modal API per id
//      GET https://www.boijmans.nl/en/api/artworks/{id}/modal
//      → { image: large-{hash}.jpg (full-size, verified ~800-1024px @300DPI),
//          content_specs: HTML <table> with a Dimensions row }.
//
// METADATA (all 6 fields, from the DETAIL data — never a list/filename shortcut):
//   title, artist, year, category  ← Algolia hit (its structured objectname/material/artists
//                                     fields ARE the detail record; richer than the HTML table)
//   medium                          ← Algolia material[].name (oil/canvas/...)
//   dimensions                      ← modal API content_specs "Dimensions" row
//   Artist kept exactly as the source stores it (main_artist; we do NOT reorder).
//   Min-4 guard (title/artist/year/category) or the record is DROPPED. Never fill artist with
//   "Anonymous"/"Unknown" — a record with no real artist is dropped.
//
// SCOPE (museum-OWN source only):
//   Category from objectname leaf/tree ∈ {painting, drawing, print, photograph}.
//   PAINTINGS: collect ALL (no cap). Other 2D (drawing/print/photograph): value-filtered —
//   skip clear study/sketch/copy/squeeze (title-based, since Boijmans has NO study/sketch object
//   type) and skip portrait miniatures (ivory/enamel/vellum paint-led ≤14cm). Sculpture/3D excluded.
//
// IMAGE: full-size large-*.jpg from storage.boijmans.nl (reject <600px long edge as thumbnail).
//   autocrop white-trim → webp(2048/q85) → R2
//   armin-gallery-images/artworks/boijmans-collection/{id}-{hash8}-imageUrl.webp
//   (hash8 = first 8 of sha256(source image url)). imageUrl = pub-*.r2.dev URL; keep original_imageUrl.
//
// RESUMABLE: --full persists processed ids + collected artworks to scripts/.state/ after each
//   batch and skips processed ids on restart, so a multi-hour run can be re-invoked and continue.
//
// Usage:
//   node scripts/scrape-boijmans.mjs --classify              # dry-run: scope tally only (no images, no upload)
//   node scripts/scrape-boijmans.mjs --pilot --limit=20 --no-upload   # 20-record metadata pilot, write collection JSON, no R2
//   node scripts/scrape-boijmans.mjs --full                  # full scrape + R2 upload (resumable)

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { autocropToWebp } from './lib/autocrop.mjs';

const require = createRequire(import.meta.url);
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const REPO = path.resolve(fileURLToPath(import.meta.url), '../..');
// CRITICAL: dotenv from the REPO ROOT .env.local (NOT scripts/.env.local — that loads 0 vars
// and silently disables R2 upload). The template astrup-fearnley has this right.
require('dotenv').config({ path: path.join(REPO, '.env.local') });

const SLUG = 'boijmans';
const COLLECTION_STEM = `${SLUG}-collection`;
const DATA_DIR = path.join(REPO, 'public', 'data');
const STATE_DIR = path.join(REPO, 'scripts', '.state');

const ALGOLIA_APP = 'S1ZZM36I7L';
const ALGOLIA_KEY = 'c5a5dbed3cdf3ee64bc109c7e15f15cf';
const ALGOLIA_URL = `https://${ALGOLIA_APP}-dsn.algolia.net/1/indexes/production_collection_artworks/query`;
const MODAL_API = (id) => `https://www.boijmans.nl/en/api/artworks/${id}/modal`;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : args.includes('--pilot') ? 'pilot' : 'classify';
const LIMIT = (() => { const a = args.find((x) => x.startsWith('--limit=')); return a ? Number(a.split('=')[1]) : Infinity; })();
const NO_UPLOAD = args.includes('--no-upload');
const OUT_NAME = (() => { const a = args.find((x) => x.startsWith('--out=')); return a ? a.split('=')[1] : `${COLLECTION_STEM}.json`; })();
const OUT_PATH = path.join(DATA_DIR, OUT_NAME);
const STATE_PATH = path.join(STATE_DIR, `${SLUG}-progress.json`);
const FAILED_PATH = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);
const ENUM_CACHE = path.join(STATE_DIR, `${SLUG}-enum.json`);

// In-scope top-level object categories (objectname leaf or tree name) → ARMIN enum.
const CATEGORIES = { painting: 'painting', drawing: 'drawing', print: 'print', photograph: 'photograph' };
// Value-filter for NON-painting works only: drop clear studies/copies/squeezes (title-based —
// Boijmans has no study/sketch object type). Paintings are NEVER skipped.
const SKIP_TITLE = /\b(study for|sketch for|preparatory|copy after|copy of|squeeze|rubbing|reproduction after)\b/i;

const s3 = (process.env.R2_ACCOUNT_ID && !NO_UPLOAD) ? new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
}) : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const decodeEntities = (s) => (s || '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#8217;/g, '’')
  .replace(/&#8216;/g, '‘').replace(/&#8211;/g, '–').replace(/&#8212;/g, '—')
  .replace(/&hellip;/g, '…').replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).trim();
const stripTags = (s) => decodeEntities((s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());

// Placeholder-artist test (matches validate-metadata's full-string rule + the Dutch forms this
// EN-locale index actually emits: "Anoniem", "Onbekend"). A record whose artist is PURELY a
// placeholder has NO real artist → it is DROPPED (we never keep "Anonymous"/"Unknown" as artist).
// "Anoniem and Michelangelo Buonarroti" is NOT pure → kept (it carries a real collaborator).
const PLACEHOLDER_ARTIST = /^(anoniem|onbekend|anonymous|unknown|unidentified|onbekende kunstenaar|n\/?a|none|-+)$/i;
const isPlaceholderArtist = (a) => !a || PLACEHOLDER_ARTIST.test(String(a).trim());

// ---------- Algolia query layer ----------
async function algolia(params, tries = 4) {
  for (let t = 1; t <= tries; t++) {
    try {
      const r = await fetch(ALGOLIA_URL, {
        method: 'POST',
        headers: {
          'X-Algolia-Application-Id': ALGOLIA_APP,
          'X-Algolia-API-Key': ALGOLIA_KEY,
          'Content-Type': 'application/json',
          'User-Agent': UA,
        },
        body: JSON.stringify({ params }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) { if (t === tries) throw e; await sleep(700 * t); }
  }
}
const qp = (obj) => Object.entries(obj).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

// nbHits for a category, optionally constrained to a dating_start range.
async function countCategory(catLeaf, numericFilters) {
  const facetFilters = JSON.stringify([['locale:en'], [`objectname.tree.name:${catLeaf}`]]);
  const body = { query: '', hitsPerPage: 0, page: 0, facetFilters };
  if (numericFilters) body.numericFilters = JSON.stringify(numericFilters);
  const d = await algolia(qp(body));
  return d.nbHits;
}

// Pull every hit for a category within a dating_start [lo,hi] range (assumed <=1000), paging.
async function fetchRange(catLeaf, lo, hi) {
  const facetFilters = JSON.stringify([['locale:en'], [`objectname.tree.name:${catLeaf}`]]);
  const numericFilters = JSON.stringify([`dating_start>=${lo}`, `dating_start<=${hi}`]);
  const out = [];
  let page = 0;
  while (true) {
    const d = await algolia(qp({ query: '', hitsPerPage: 1000, page, facetFilters, numericFilters }));
    out.push(...(d.hits || []));
    await sleep(150);
    if (page + 1 >= d.nbPages || out.length >= d.nbHits) break;
    page++;
  }
  return out;
}

// Recursively split a dating_start range until each piece has <=1000 hits, then fetch it.
async function harvestRange(catLeaf, lo, hi, acc) {
  const n = await countCategory(catLeaf, [`dating_start>=${lo}`, `dating_start<=${hi}`]);
  if (n === 0) return;
  if (n <= 1000 || lo >= hi) {
    const hits = await fetchRange(catLeaf, lo, hi);
    acc.push(...hits);
    console.log(`    [${catLeaf}] ${lo}..${hi}: ${hits.length}/${n}`);
    return;
  }
  const mid = Math.floor((lo + hi) / 2);
  await harvestRange(catLeaf, lo, mid, acc);
  await harvestRange(catLeaf, mid + 1, hi, acc);
}

// Enumerate a whole category: undated bucket + dated ranges (split to stay under Algolia's cap).
async function harvestCategory(catLeaf) {
  const acc = [];
  // undated (dating_start == 0) — pull as its own bucket
  const undated = await fetchRange(catLeaf, 0, 0);
  acc.push(...undated);
  console.log(`    [${catLeaf}] undated(0): ${undated.length}`);
  // dated: full plausible range, recursively split
  await harvestRange(catLeaf, 1, 2100, acc);
  // de-dup by id (a hit can carry multiple objectname leaves and appear via >1 facet — but we
  // query one leaf at a time so this only guards range-boundary overlap, which there is none of;
  // still cheap insurance).
  const seen = new Set();
  const uniq = acc.filter((h) => { const id = String(h.id); if (seen.has(id)) return false; seen.add(id); return true; });
  return uniq;
}

// Enumerate all in-scope categories; tag each hit with the matched category (painting wins).
async function enumerateAll() {
  if (fs.existsSync(ENUM_CACHE)) {
    try {
      const c = JSON.parse(fs.readFileSync(ENUM_CACHE, 'utf8'));
      if (c && Array.isArray(c.hits) && c.hits.length) {
        console.log(`[enum] using cached enumeration: ${c.hits.length} hits (${ENUM_CACHE})`);
        return c.hits;
      }
    } catch { /* re-enumerate */ }
  }
  const byId = new Map(); // id -> { hit, category } — painting takes priority over other leaves
  const priority = ['painting', 'drawing', 'print', 'photograph'];
  for (const leaf of priority) {
    console.log(`  [enum] category "${leaf}" …`);
    const hits = await harvestCategory(leaf);
    for (const h of hits) {
      const id = String(h.id);
      if (!byId.has(id)) byId.set(id, { ...h, _cat: CATEGORIES[leaf] });
      // if already present from a higher-priority leaf, keep that (painting beats drawing etc.)
    }
    console.log(`  [enum] "${leaf}" → ${hits.length} hits (running unique total ${byId.size})`);
  }
  const hits = [...byId.values()];
  fs.writeFileSync(ENUM_CACHE, JSON.stringify({ enumerated_at: new Date().toISOString(), hits }));
  console.log(`[enum] total unique in-scope hits: ${hits.length} (cached → ${ENUM_CACHE})`);
  return hits;
}

// ---------- scope decision on an Algolia hit ----------
// Returns ARMIN category if in-scope & passes value-filter, else null.
function scopeOf(h) {
  // gather all objectname leaf + tree names
  const names = new Set();
  for (const o of (h.objectname || [])) {
    if (o.name) names.add(String(o.name).toLowerCase());
    for (const t of (o.tree || [])) if (t.name) names.add(String(t.name).toLowerCase());
  }
  let cat = null;
  if (names.has('painting')) cat = 'painting';
  else if (names.has('drawing')) cat = 'drawing';
  else if (names.has('print')) cat = 'print';
  else if (names.has('photograph')) cat = 'photograph';
  if (!cat) return null;

  // PAINTINGS: collect ALL, no value-filter.
  if (cat === 'painting') return 'painting';

  // value-filter for non-paintings
  const title = decodeEntities(h.title || '');
  if (SKIP_TITLE.test(title)) return null;

  // portrait-miniature heuristic: paint-led on ivory/enamel/vellum AND ≤14cm.
  const mats = (h.material || []).flatMap((m) => [m.name, ...((m.tree || []).map((t) => t.name))]).filter(Boolean).map((s) => s.toLowerCase());
  const matStr = mats.join(' ');
  const isMiniMaterial = /\b(ivory|enamel|vellum)\b/.test(matStr) && /\b(oil|gouache|watercolou?r|paint|tempera)\b/.test(matStr) && !/paper/.test(matStr);
  if (isMiniMaterial) return null; // size confirmation happens after modal fetch; material alone is a strong signal here

  return cat;
}

// ---------- dimensions parse from modal content_specs ----------
function parseDimensions(contentSpecsHtml) {
  if (!contentSpecsHtml) return '';
  // find the <td> following the "Dimensions" <th>
  const m = contentSpecsHtml.match(/<th[^>]*>\s*Dimensions\s*<\/th>\s*<td>([\s\S]*?)<\/td>/i);
  if (!m) return '';
  // rows are "<span ...>Height</span> 65,5 cm<br/> <span ...>Width</span> 54,3 cm<br/>"
  // turn each label-span into "Label:" and collapse to one line.
  const parts = [];
  const re = /<span[^>]*class="[^"]*__subfield[^"]*"[^>]*>([\s\S]*?)<\/span>\s*([^<]*)/gi;
  let mm;
  while ((mm = re.exec(m[1])) !== null) {
    const label = stripTags(mm[1]);
    const val = decodeEntities(mm[2]).replace(/\s+/g, ' ').trim();
    if (label && val) parts.push(`${label} ${val}`);
  }
  if (parts.length) return parts.join(', ');
  // fallback: just strip tags on the whole td
  return stripTags(m[1]);
}

// numeric long-edge in cm from a parsed dimensions string (for miniature size guard)
function longEdgeCm(dimStr) {
  const nums = [...(dimStr || '').matchAll(/(\d+(?:[.,]\d+)?)\s*cm/gi)].map((x) => parseFloat(x[1].replace(',', '.')));
  return nums.length ? Math.max(...nums) : null;
}

// ---------- hit → partial ARMIN artwork (5 fields from Algolia) ----------
function fieldsFromHit(h) {
  const title = decodeEntities(h.title || '');
  const artist = decodeEntities(h.main_artist || ''); // kept exactly as source stores it
  const dateStr = decodeEntities(h.dating_indication || '') || (typeof h.dating_start === 'number' && h.dating_start > 0 ? String(h.dating_start) : '');
  // year: prefer the structured dating_start int; else recover a 4-digit year from the
  // dating_indication text ("1912", "voor 1933", "circa 1506-1508" → 1912/1933/1506).
  let year = (typeof h.dating_start === 'number' && h.dating_start > 0) ? h.dating_start : null;
  if (year == null) { const m = dateStr.match(/\d{3,4}/); if (m) year = parseInt(m[0], 10); }
  // medium = material leaf names joined (oil + canvas → "oil, canvas")
  const mediumNames = [];
  for (const m of (h.material || [])) if (m.name) mediumNames.push(decodeEntities(m.name));
  const medium = [...new Set(mediumNames)].join(', ');
  return { id: String(h.id), tmsId: h.tms_id, identifier: h.identifier || '', slug: h.slug || '', title, artist, year, dateStr, medium, thumbnailUrl: h.image || '', sourceUrl: h.url || '' };
}

// ---------- modal API: full image + dimensions ----------
async function fetchModal(id, tries = 3) {
  for (let t = 1; t <= tries; t++) {
    try {
      const r = await fetch(MODAL_API(id), { headers: { 'User-Agent': UA } });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) { if (t === tries) throw e; await sleep(600 * t); }
  }
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

// ---------- build one full artwork record (modal fetch + min-4 + optional image upload) ----------
async function buildArtwork(base) {
  // cheap min-4 drop on Algolia fields FIRST — avoids a modal fetch for ~1.3k placeholder-artist
  // / no-year records that can never qualify (placeholder artist counts as MISSING artist).
  if (!base.title || isPlaceholderArtist(base.artist) || base.year == null || !base.category) return { drop: true };

  const modal = await fetchModal(base.id);
  if (!modal || !modal.image) throw new Error('no modal/large image');
  const imgUrl = modal.image; // large-*.jpg full-size
  const dimensions = parseDimensions(modal.content_specs);

  // late miniature guard: paint-led ivory/enamel/vellum already filtered by material; here also
  // drop if dims confirm a tiny paint-led piece flagged borderline (defensive, non-painting only).
  if (base.category !== 'painting') {
    const le = longEdgeCm(dimensions);
    if (le != null && le <= 14 && /\b(ivory|enamel|vellum)\b/i.test(base.medium) && /\b(oil|gouache|watercolou?r|paint|tempera)\b/i.test(base.medium)) {
      throw new Error('portrait-miniature (size+medium)');
    }
  }

  // min-4 guard BEFORE spending an image download (placeholder artist counts as MISSING artist)
  if (!base.title || isPlaceholderArtist(base.artist) || base.year == null || !base.category) return { drop: true };

  let imageUrl = base.thumbnailUrl, srcW = null, srcH = null;
  if (s3) {
    const src = await dl(imgUrl);
    const sharp = (await import('sharp')).default;
    const meta = await sharp(src).metadata().catch(() => ({}));
    srcW = meta.width || null; srcH = meta.height || null;
    if (meta.width && Math.max(meta.width, meta.height) < 600) throw new Error(`thumb ${meta.width}x${meta.height}`);
    const { buffer } = await autocropToWebp(src);
    const hash8 = sha(imgUrl).slice(0, 8);
    const key = `artworks/${COLLECTION_STEM}/${base.id}-${hash8}-imageUrl.webp`;
    await uploadR2(key, buffer);
    imageUrl = `${R2_PUBLIC}/${key}`;
  } else {
    // --no-upload pilot: still verify the large image is full-size (download header only via dims)
    const src = await dl(imgUrl);
    const sharp = (await import('sharp')).default;
    const meta = await sharp(src).metadata().catch(() => ({}));
    srcW = meta.width || null; srcH = meta.height || null;
    imageUrl = imgUrl; // record the source large URL when not uploading
  }

  const description = stripTags(modal.description || base.description || '');
  return {
    artwork: {
      id: base.id,
      objectNumber: base.identifier || '',
      title: base.title,
      artist: base.artist,
      date: base.dateStr || (base.year != null ? String(base.year) : ''),
      year: base.year,
      medium: base.medium,
      dimensions,
      category: base.category,
      description,
      imageUrl,
      thumbnailUrl: base.thumbnailUrl,
      onDisplay: false,
      displayLocation: '',
      sourceUrl: base.sourceUrl,
      metadata: { tms_id: base.tmsId, algolia_id: base.id, slug: base.slug, src_px: srcW && srcH ? `${srcW}x${srcH}` : '' },
      original_imageUrl: imgUrl,
    },
  };
}

// ---------- state (resumable) ----------
function loadState() {
  if (fs.existsSync(STATE_PATH)) {
    try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); } catch { /* fresh */ }
  }
  return { processed: [], artworks: [] };
}
function saveState(st) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(st));
}

function writeCollection(artworks) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'Museum Boijmans Van Beuningen',
    collection: 'Collection',
    website: 'https://www.boijmans.nl/en/collection',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'api',
    category_breakdown: cats,
    artworks,
  };
  fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2));
  console.log(`[write] ${OUT_PATH} (${artworks.length} works) breakdown=`, cats);
  return OUT_PATH;
}

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const hits = await enumerateAll();

  // scope-classify the whole enumerated set
  const tally = {};
  let inScope = 0, outScope = 0;
  const candidates = [];
  for (const h of hits) {
    const cat = scopeOf(h);
    if (!cat) { outScope++; continue; }
    inScope++; tally[cat] = (tally[cat] || 0) + 1;
    const f = fieldsFromHit(h);
    f.category = cat;
    f.description = decodeEntities(h.description || '');
    candidates.push(f);
  }
  console.log('\n[classify] enumerated hits:', hits.length);
  console.log('[classify] in-scope:', inScope, '| out-of-scope (value-filtered/3D):', outScope);
  console.log('[classify] breakdown:', tally);

  if (MODE === 'classify') {
    // min-4 droppage forecast (from Algolia fields; year/artist are the usual missers)
    let dropMin4 = 0, noImg = 0, dropArtist = 0, dropYear = 0;
    for (const c of candidates) {
      const bad = !c.title || isPlaceholderArtist(c.artist) || c.year == null;
      if (bad) dropMin4++;
      if (isPlaceholderArtist(c.artist)) dropArtist++;
      if (c.year == null) dropYear++;
      if (!c.thumbnailUrl) noImg++;
    }
    console.log('\n[classify] in-scope that would DROP on min-4 (missing title/real-artist/year):', dropMin4, `(placeholder-artist ${dropArtist}, no-year ${dropYear})`);
    console.log('[classify] in-scope missing thumbnail in Algolia:', noImg);
    const sample = candidates.slice(0, 8);
    console.log('\n[classify] sample in-scope:');
    for (const c of sample) console.log('   -', c.category, '|', JSON.stringify(c.title).slice(0, 46), '| artist=', JSON.stringify(c.artist).slice(0, 30), '| year=', c.year, '| medium=', JSON.stringify(c.medium).slice(0, 36));
    return;
  }

  // pilot/full: build records (modal fetch + image)
  const st = MODE === 'full' ? loadState() : { processed: [], artworks: [] };
  const done = new Set(st.processed.map(String));
  const artworks = st.artworks.slice();
  let collected = artworks.length, dropMin4 = 0, imgErr = 0, processedThisRun = 0;

  // pilot: cap the number of COLLECTED records at LIMIT (default 20 for pilot via --limit)
  const pilotTarget = MODE === 'pilot' ? (Number.isFinite(LIMIT) ? LIMIT : 20) : Infinity;

  const CONC = MODE === 'pilot' ? 4 : 5;
  let idx = 0;
  const todo = candidates.filter((c) => !done.has(String(c.id)));
  console.log(`\n[${MODE}] candidates ${candidates.length}, already done ${done.size}, to process ${todo.length}, target ${pilotTarget === Infinity ? 'ALL' : pilotTarget}, upload=${s3 ? 'ON' : 'OFF'}`);

  let stop = false;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (!stop && idx < todo.length) {
      if (collected >= pilotTarget) { stop = true; break; }
      const c = todo[idx++];
      try {
        const res = await buildArtwork(c);
        if (res.drop) { dropMin4++; }
        else { artworks.push(res.artwork); collected++; }
        if (MODE === 'full') { done.add(String(c.id)); }
      } catch (e) {
        imgErr++;
        fs.appendFileSync(FAILED_PATH, JSON.stringify({ id: c.id, title: c.title, err: String(e.message || e) }) + '\n');
        if (imgErr <= 8) console.log(`  err id=${c.id}: ${e.message}`);
        if (MODE === 'full') { done.add(String(c.id)); } // don't retry persistently-bad records forever
      }
      processedThisRun++;
      await sleep(120); // throttle ~ keep modal+CDN polite
      if (processedThisRun % 50 === 0) {
        console.log(`  …processed ${processedThisRun} (collected ${collected}, imgErr ${imgErr}, min4-drop ${dropMin4})`);
        if (MODE === 'full') { saveState({ processed: [...done], artworks }); }
      }
    }
  }));

  artworks.sort((x, y) => Number(x.id) - Number(y.id));
  if (MODE === 'full') saveState({ processed: [...done], artworks });
  writeCollection(artworks);
  console.log(`\n[${MODE}] DONE. collected ${artworks.length} | img/modal errors ${imgErr} | min4-drops ${dropMin4}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
