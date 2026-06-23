#!/usr/bin/env node
// Powerhouse Museum (Museum of Applied Arts and Sciences / MAAS), Sydney — collection scraper.
//
// Source: the museum's OWN infrastructure only.
//   1) ENUMERATE: POST https://collection.powerhouse.com.au/api/search
//        - Searchkit (@searchkit/instantsearch-client) → Elasticsearch index "objects".
//        - Body MUST be a BARE top-level array: [{ indexName:"objects", params:{...Algolia params} }]
//          (the {requests:[...]} wrapper returns HTTP 500; the bare array returns 200).
//        - Requires browser-ish headers + Origin/Referer (research UA → 403 Forbidden).
//        - Facet filter on "aggregatedTerms.categories" selects flat-work categories.
//        - Hits are TRIMMED: only { id, registrationNumber, title, hasMedia, multimedia.images[] }.
//        - ES max_result_window = 10,000 (page*hitsPerPage ≥ 10000 → 500). Categories that exceed
//          that (only raw "Photographs", which is mostly the negative collection) are sliced with a
//          free-text query sweep (query narrows AND paginates) and de-duplicated by object id.
//   2) ENRICH: GET https://collection.powerhouse.com.au/_next/data/{buildId}/object/{id}.json
//        - Returns the full Elasticsearch _source: title, registrationNumber, category[],
//          recordType, production[] (creator/date/place), dimensions{}, statement, description.
//        - buildId is fetched live at runtime (it drifts on each site deploy).
//   3) IMAGES: Cloudflare Images CDN (museum-owned), arbitrary width up to source.
//        https://imagedelivery.net/znDGKaxxskgDbNUpqPVRFg/ph-collection-media/images/{imageId}.jpg/w=2048,q=82
//        The hit's multimedia.images[0].{width,height} = the DELIVERABLE resolution → gate ≥600px.
//
// SCOPE: FLAT works only (the object collection is overwhelmingly 3D — excluded by category).
//   In-scope categories → ARMIN enum:
//     photograph ← Photographs, Photographic prints, Gelatin/Silver gelatin prints, Photographic postcards, Photograph albums
//     print      ← Posters, Pictorials, Advertising leaflets/Advertisements, Postcards, Bookplates,
//                  Wallpaper samples, Leaflets, Booklets, Magazines, Ephemera
//     drawing    ← Drawings, Architectural drawings, Technical drawings, Design drawings
//   HARD-EXCLUDE (negatives / transparencies / slides — not positive images): any record whose
//     statement/description marks it "photographic negative", "glass plate/negative", "lantern
//     slide", "transparency", "slide", "astrographic plate". (The "Photographs" facet bucket is
//     ~entirely the negative collection; this filter keeps only positive prints.)
//
// min-4 (title, artist, year, category) enforced — NO "Unknown" filling. artist = first named
//   production.creator.title; if none, fall back to a non-generic organisation maker parsed from the
//   statement (e.g. "published by Kerry and Co"); if still none, the record is DROPPED.
//   In-scope > 25k → prioritize named+dated, cap JSON < 23MB, write COMPACT (no indent).
//
// Usage:
//   node scripts/scrape-powerhouse-sydney.mjs --probe    # ~15 in-scope works end-to-end (+R2), writes *-probe.json
//   node scripts/scrape-powerhouse-sydney.mjs --full     # all in-scope, resumable (+R2), writes collection JSON

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const sharp = require('sharp');
const REPO = path.resolve(fileURLToPath(import.meta.url), '../..');
require('dotenv').config({ path: path.join(REPO, '.env.local') });

const SLUG = 'powerhouse-sydney';
const COLLECTION_STEM = `${SLUG}-collection`;
const ORIGIN = 'https://collection.powerhouse.com.au';
const SEARCH_EP = `${ORIGIN}/api/search`;
const CF_IMG = 'https://imagedelivery.net/znDGKaxxskgDbNUpqPVRFg/ph-collection-media/images';
const IMG_VARIANT = 'w=2048,q=82,metadata=keep';
const BUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const PROGRESS = path.join(STATE_DIR, `${SLUG}-progress.json`);
const FAILED = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : 'probe';
const PROBE_TARGET = 15;
const MAX_JSON_BYTES = 23 * 1024 * 1024;
const ES_WINDOW = 10000;        // ES max_result_window
const HPP = 100;                // hitsPerPage for enumeration
const MIN_LONG_EDGE = 600;

// In-scope museum categories → ARMIN enum. (Order = enrichment-time priority for multi-category docs.)
const CATEGORY_MAP = {
  // photographs (positive prints; negatives filtered out by statement keyword)
  'Photographs': 'photograph',
  'Photographic prints': 'photograph',
  'Gelatin silver prints': 'photograph',
  'Silver gelatin prints': 'photograph',
  'Photographic postcards': 'photograph',
  'Photograph albums': 'photograph',
  // works on paper / prints / posters
  'Posters': 'print',
  'Pictorials': 'print',
  'Advertising leaflets': 'print',
  'Advertisements': 'print',
  'Postcards': 'print',
  'Bookplates': 'print',
  'Wallpaper samples': 'print',
  'Leaflets': 'print',
  'Booklets': 'print',
  'Magazines': 'print',
  'Ephemera': 'print',
  // drawings
  'Architectural drawings': 'drawing',
  'Technical drawings': 'drawing',
  'Design drawings': 'drawing',
  'Drawings': 'drawing',
};
const IN_SCOPE_CATS = Object.keys(CATEGORY_MAP);

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ---------- HTTP helpers ----------
const SEARCH_HEADERS = {
  'content-type': 'application/json',
  accept: '*/*',
  origin: ORIGIN,
  referer: `${ORIGIN}/search`,
  'user-agent': BUA,
};

async function postSearch(params) {
  // params is the Algolia params object; we wrap it in the bare-array request shape.
  const body = JSON.stringify([{ indexName: 'objects', params }]);
  for (let att = 1; att <= 4; att++) {
    try {
      const r = await fetch(SEARCH_EP, { method: 'POST', headers: SEARCH_HEADERS, body });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const res = j.results && j.results[0];
      if (!res) throw new Error('no results[0]');
      return res;
    } catch (e) { if (att === 4) throw e; await sleep(500 * att); }
  }
}

async function getBuildId() {
  const r = await fetch(`${ORIGIN}/`, { headers: { 'user-agent': BUA } });
  const html = await r.text();
  const m = html.match(/"buildId":"([^"]+)"/);
  if (!m) throw new Error('could not read buildId from homepage');
  return m[1];
}

async function getEnrichment(buildId, id) {
  const url = `${ORIGIN}/_next/data/${buildId}/object/${id}.json`;
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': BUA } });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const co = j && j.pageProps && j.pageProps.collectionObject;
      return (co && co._source) || null;
    } catch (e) { if (att === 3) throw e; await sleep(400 * att); }
  }
}

// ---------- enumeration ----------
function catFilterParams(cat, page, extraQuery = '') {
  return {
    query: extraQuery,
    hitsPerPage: HPP,
    page,
    facetFilters: [[`aggregatedTerms.categories:${cat}`]],
  };
}

// Enumerate every hit id for a category. Hits carry image dims inline, so we keep them.
// Returns Map<id, hit> (deduped). Handles the 10k ES window by query-slicing when needed.
//   capPages: max pages to read from the unfiltered listing (probe passes 1).
//   sweep:    when true AND total>10k, run an a–z0–9 query sweep to reach the long tail (full only).
async function enumerateCategory(cat, capPages = Infinity, sweep = true) {
  const seen = new Map();
  const first = await postSearch(catFilterParams(cat, 0));
  const total = first.nbHits;
  const pages = Math.min(Math.ceil(total / HPP), Math.ceil(ES_WINDOW / HPP), capPages);
  for (const h of first.hits) seen.set(h.id, h);
  for (let p = 1; p < pages; p++) {
    const res = await postSearch(catFilterParams(cat, p));
    for (const h of res.hits) seen.set(h.id, h);
    await sleep(120);
    if (p % 20 === 0) process.stdout.write(`    [${cat}] page ${p}/${pages} (seen ${seen.size}/${total})\r`);
  }
  // If the category exceeds the ES window, sweep with single-letter queries to reach the long tail.
  if (sweep && total > ES_WINDOW) {
    const sweep = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');
    for (const q of sweep) {
      try {
        const r0 = await postSearch(catFilterParams(cat, 0, q));
        const np = Math.min(Math.ceil(r0.nbHits / HPP), Math.ceil(ES_WINDOW / HPP));
        for (const h of r0.hits) seen.set(h.id, h);
        for (let p = 1; p < np; p++) {
          const res = await postSearch(catFilterParams(cat, p, q));
          for (const h of res.hits) seen.set(h.id, h);
          await sleep(80);
        }
      } catch { /* skip sweep term on error */ }
      process.stdout.write(`    [${cat}] sweep '${q}' → seen ${seen.size}/${total}      \r`);
    }
  }
  process.stdout.write('\n');
  console.log(`  [enum] ${cat}: total≈${total}, collected ${seen.size} unique ids`);
  return { total, hits: seen };
}

// ---------- record assembly ----------
function bestImage(hit) {
  const mm = hit && hit.multimedia;
  const imgs = (mm && Array.isArray(mm.images)) ? mm.images : [];
  // choose the largest deliverable image on the record
  let best = null;
  for (const im of imgs) {
    if (!im || im.id == null) continue;
    const longEdge = Math.max(im.width || 0, im.height || 0);
    if (!best || longEdge > best.longEdge) best = { id: im.id, w: im.width || 0, h: im.height || 0, longEdge };
  }
  return best;
}

const NEG_RE = /(photographic negative|glass[ -]?(plate|negative)|cellulose negative|nitrate negative|lantern slide|\btransparenc|\bnegative\b|astrographic plate|photographic slide|\bslide\b)/i;

// Pull the first NAMED maker. Prefer production.creator.title; else parse an org from statement.
function extractArtist(src) {
  for (const p of (src.production || [])) {
    const c = p && p.creator;
    if (c && typeof c === 'object' && c.title && String(c.title).trim()) return String(c.title).trim();
  }
  // organisation makers often appear only in the statement: "...by Kerry and Co...", "published by X"
  const stmt = src.statement || '';
  const m = stmt.match(/\b(?:made by|published by|printed by|manufactured by|produced by|designed by|drawn by|photographed by|by)\s+([A-Z][^,.;]{2,60})/);
  if (m) {
    const cand = m[1].trim();
    if (!/^(unknown|various|a\b|an\b|the\b)/i.test(cand)) return cand;
  }
  return '';
}

const NOW_YEAR = new Date().getFullYear();
const sane = (y) => (y != null && y >= 1500 && y <= NOW_YEAR + 1) ? Number(y) : null;
function extractYear(src) {
  for (const p of (src.production || [])) {
    const ye = p && p.yearEarliest;
    if (ye && typeof ye === 'object' && sane(ye.year) != null) return sane(ye.year);
    if (p && p.dateEarliest) { const mm = String(p.dateEarliest).match(/\b\d{4}\b/); if (mm && sane(+mm[0]) != null) return +mm[0]; }
    if (p && p.date) { const mm = String(p.date).match(/\b(1[5-9]\d\d|20[0-4]\d)\b/); if (mm) return +mm[0]; }
  }
  // fallback: a 4-digit year in the statement
  const mm = (src.statement || '').match(/\b(1[5-9]\d\d|20[0-4]\d)\b/);
  return mm ? Number(mm[0]) : null;
}

function extractDateStr(src) {
  for (const p of (src.production || [])) {
    if (p && p.date && String(p.date).trim()) return String(p.date).trim();
  }
  const y = extractYear(src);
  return y != null ? String(y) : '';
}

// medium: parse from the statement (format: "<Object>, [<'Title'>,] <materials>, <maker>, ...").
// The material segment is the first comma-part that reads like materials (contains a material word
// or a "x / y" slash list) — skip a leading quoted-title segment (e.g. "'Swimming'").
const MATERIAL_RE = /\b(paper|card|ink|paint|gelatin|silver|albumen|photograph|photographic|canvas|board|linen|cotton|wood|plastic|vellum|watercolour|gouache|lithograph|screenprint|offset|pencil|chalk|crayon|emulsion|cellulose|acetate|glass|metal|cardboard|pigment|dye|colour|wove|laid)\b/i;
function extractMedium(src) {
  const stmt = (src.statement || '').split('\n')[0];
  const parts = stmt.split(',').map((s) => s.trim()).filter(Boolean);
  for (let i = 1; i < Math.min(parts.length, 5); i++) {
    const cand = parts[i];
    if (cand.length > 80) continue;
    if (/^['"].*['"]$/.test(cand)) continue;                 // skip a quoted title segment
    if (/\b(by|for|published|designed|made|printed|manufactured|unknown|various)\b/i.test(cand)) continue;
    if (MATERIAL_RE.test(cand) || /\s\/\s/.test(cand)) return cand;
  }
  return '';
}

function extractDimensions(src) {
  const d = src.dimensions;
  if (!d || typeof d !== 'object') return '';
  const u = d.unitLength || 'mm';
  const bits = [];
  if (d.height) bits.push(`height ${d.height} ${u}`);
  if (d.width) bits.push(`width ${d.width} ${u}`);
  if (d.depth) bits.push(`depth ${d.depth} ${u}`);
  if (d.diameter) bits.push(`diameter ${d.diameter} ${u}`);
  return bits.join(' × ');
}

// Map the museum category[] to ARMIN enum, preferring the in-scope match.
function mapCategory(src) {
  const cats = Array.isArray(src.category) ? src.category : [];
  for (const c of cats) if (CATEGORY_MAP[c]) return CATEGORY_MAP[c];
  return null;
}

// ---------- image: download from CDN, verify size, autocrop, upload ----------
async function dl(url) {
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': BUA, referer: ORIGIN } });
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

async function processImage(imageId, srcUrl) {
  const src = await dl(srcUrl);
  const meta = await sharp(src).metadata().catch(() => ({}));
  if (meta.width && Math.max(meta.width, meta.height) < MIN_LONG_EDGE) throw new Error(`thumb ${meta.width}x${meta.height}`);
  const webp = await sharp(src).rotate().resize(2048, 2048, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
  const hash8 = sha(srcUrl).slice(0, 8);
  const key = `artworks/${COLLECTION_STEM}/${imageId}-${hash8}-imageUrl.webp`;
  await uploadR2(key, webp);
  return { imageUrl: `${R2_PUBLIC}/${key}`, srcW: meta.width || null, srcH: meta.height || null };
}

// ---------- candidate building (enumerate + enrich + scope/min-4 filter) ----------
// Returns a list of candidate objects ready for image processing, sorted to prioritize named+dated.
async function buildCandidates(buildId, { probe = false } = {}) {
  // 1) enumerate in-scope ids (dedup across categories), keeping the inline image dims.
  const idToHit = new Map();
  // Probe: hit a few HIGH-keep-rate categories first (named+dated, not the negative-heavy
  // "Photographs" bucket), page-0 only, NO 10k sweep — fast and reliably yields ≥15 keepers.
  const probeCats = ['Posters', 'Pictorials', 'Architectural drawings', 'Photographic prints', 'Drawings'];
  const cats = probe ? probeCats : IN_SCOPE_CATS;
  for (const cat of cats) {
    if (probe && idToHit.size >= 250) break;
    const { hits } = await enumerateCategory(cat, probe ? 1 : Infinity, /* sweep */ !probe);
    for (const [id, h] of hits) if (!idToHit.has(id)) idToHit.set(id, h);
  }
  console.log(`[enum] total unique in-scope ids: ${idToHit.size}`);

  // 2) keep only those with an inline image ≥600px (cheap pre-filter before enrichment)
  const withImg = [];
  for (const [id, h] of idToHit) {
    const bi = bestImage(h);
    if (bi && bi.longEdge >= MIN_LONG_EDGE) withImg.push({ id, hit: h, img: bi });
  }
  console.log(`[enum] with deliverable image ≥${MIN_LONG_EDGE}px: ${withImg.length}`);

  // 3) enrich (maker/date/medium/category) + apply scope + min-4. Concurrency-limited.
  const candidates = [];
  let enriched = 0, droppedNeg = 0, droppedMin4 = 0, droppedScope = 0, enrErr = 0;
  const queue = probe ? withImg.slice(0, 250) : withImg;
  const CONC = 8;
  let idx = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (idx < queue.length) {
      if (probe && candidates.length >= PROBE_TARGET) return;
      const c = queue[idx++];
      let src;
      try { src = await getEnrichment(buildId, c.id); }
      catch (e) { enrErr++; continue; }
      enriched++;
      if (!src) { droppedScope++; continue; }
      const category = mapCategory(src);
      if (!category) { droppedScope++; continue; }
      const blob = `${src.statement || ''} ${src.description || ''}`;
      if (NEG_RE.test(blob)) { droppedNeg++; continue; }   // negatives/transparencies/slides out
      const artist = extractArtist(src);
      const year = extractYear(src);
      const title = (src.title || '').trim();
      if (!title || !artist || year == null) { droppedMin4++; continue; }
      candidates.push({
        id: c.id,
        imageId: c.img.id,
        objectNumber: src.registrationNumber || '',
        title,
        artist,
        year,
        dateStr: extractDateStr(src),
        medium: extractMedium(src),
        dimensions: extractDimensions(src),
        category,
        description: (src.description || src.statement || '').split('\n')[0].slice(0, 500),
        srcCategory: (Array.isArray(src.category) ? src.category[0] : '') || '',
      });
      if (enriched % 200 === 0) process.stdout.write(`    [enrich] ${enriched}/${queue.length} → kept ${candidates.length}\r`);
    }
  }));
  process.stdout.write('\n');
  console.log(`[enrich] enriched ${enriched} | kept ${candidates.length} | dropped: negatives ${droppedNeg}, min4 ${droppedMin4}, out-of-scope ${droppedScope}, errors ${enrErr}`);

  // prioritize named+dated with longer descriptions (already all named+dated by min-4);
  // sort by id for stable resumability.
  candidates.sort((a, b) => Number(a.id) - Number(b.id));
  return candidates;
}

// ---------- output ----------
function toArtwork(c, imageUrl, srcUrl) {
  return {
    id: `${SLUG}-${c.id}`,
    objectNumber: c.objectNumber,
    title: c.title,
    artist: c.artist,
    date: c.dateStr || (c.year != null ? String(c.year) : ''),
    year: c.year,
    medium: c.medium,
    dimensions: c.dimensions,
    category: c.category,
    description: c.description,
    imageUrl,
    thumbnailUrl: srcUrl,
    onDisplay: false,
    displayLocation: '',
    sourceUrl: `${ORIGIN}/object/${c.id}`,
    metadata: { ph_id: c.id, ph_category: c.srcCategory },
    original_imageUrl: srcUrl,
  };
}

function writeCollection(artworks, stem, totalInScope) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'Powerhouse Museum (MAAS)',
    collection: 'Collection',
    website: `${ORIGIN}/`,
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    total_in_scope: totalInScope,
    source_type: 'api',
    category_breakdown: cats,
    artworks,
  };
  const compact = stem === COLLECTION_STEM; // full = compact; probe = pretty for inspection
  const out = path.join(REPO, 'public/data', `${stem}.json`);
  let str = compact ? JSON.stringify(payload) : JSON.stringify(payload, null, 2);
  // enforce <23MB by trimming the longest descriptions / dropping the tail if necessary
  if (Buffer.byteLength(str) > MAX_JSON_BYTES) {
    for (const w of payload.artworks) w.description = (w.description || '').slice(0, 160);
    str = JSON.stringify(payload);
  }
  while (Buffer.byteLength(str) > MAX_JSON_BYTES && payload.artworks.length > 0) {
    payload.artworks.length = Math.floor(payload.artworks.length * 0.95);
    payload.total_count = payload.artworks.length;
    str = JSON.stringify(payload);
  }
  fs.writeFileSync(out, str);
  console.log(`[write] ${out} (${payload.artworks.length} works, ${(Buffer.byteLength(str) / 1048576).toFixed(1)}MB) breakdown=`, cats);
  return out;
}

// ---------- PROBE ----------
async function runProbe() {
  console.log(`[probe] target ${PROBE_TARGET} in-scope works end-to-end`);
  const buildId = await getBuildId();
  console.log(`[probe] buildId = ${buildId}`);
  const cands = await buildCandidates(buildId, { probe: true });
  const sample = cands.slice(0, PROBE_TARGET);
  console.log(`[probe] processing ${sample.length} images → R2 …`);
  const artworks = [];
  for (const c of sample) {
    const srcUrl = `${CF_IMG}/${c.imageId}.jpg/${IMG_VARIANT}`;
    try {
      const { imageUrl, srcW, srcH } = await processImage(c.imageId, srcUrl);
      artworks.push(toArtwork(c, imageUrl, srcUrl));
      console.log(`  ✓ ${c.id} [${c.category}] "${c.title.slice(0, 40)}" — ${c.artist.slice(0, 30)} (${c.year}) ${srcW}x${srcH}`);
    } catch (e) {
      console.log(`  ✗ ${c.id}: ${e.message}`);
    }
  }
  const out = writeCollection(artworks, `${COLLECTION_STEM}-probe`, '(probe)');
  // probe summary
  const f6 = (k) => artworks.filter((a) => a[k] && String(a[k]).length).length;
  console.log(`\n[probe] DONE ${artworks.length}/${PROBE_TARGET}`);
  console.log(`[probe] fill: artist ${f6('artist')}/${artworks.length}, year ${artworks.filter(a => a.year != null).length}/${artworks.length}, medium ${f6('medium')}/${artworks.length}, dimensions ${f6('dimensions')}/${artworks.length}`);
  if (artworks.length < PROBE_TARGET) { console.error(`[probe] FAILED — only ${artworks.length}/${PROBE_TARGET} works`); process.exit(2); }
  console.log(`[probe] OK → ${out}`);
}

// ---------- FULL (resumable) ----------
function loadProgress() { try { return JSON.parse(fs.readFileSync(PROGRESS, 'utf8')); } catch { return { done: {} }; } }
function saveProgress(p) { fs.writeFileSync(PROGRESS, JSON.stringify(p)); }

async function runFull() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const buildId = await getBuildId();
  console.log(`[full] buildId = ${buildId}`);
  const cands = await buildCandidates(buildId, { probe: false });
  const totalInScope = cands.length;
  console.log(`[full] ${totalInScope} named+dated in-scope candidates with images`);

  const prog = loadProgress();
  const artworks = [];
  let done = 0, imgErr = 0;
  const CONC = 6;
  let idx = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (idx < cands.length) {
      const c = cands[idx++];
      const srcUrl = `${CF_IMG}/${c.imageId}.jpg/${IMG_VARIANT}`;
      if (prog.done[c.id]) { artworks.push(prog.done[c.id]); done++; continue; }
      try {
        const { imageUrl } = await processImage(c.imageId, srcUrl);
        const w = toArtwork(c, imageUrl, srcUrl);
        artworks.push(w);
        prog.done[c.id] = w;
      } catch (e) {
        imgErr++;
        fs.appendFileSync(FAILED, JSON.stringify({ id: c.id, imageId: c.imageId, err: String(e.message || e) }) + '\n');
        if (imgErr <= 8) console.log(`  img err ${c.id}: ${e.message}`);
      }
      if (++done % 100 === 0) { saveProgress(prog); console.log(`  …${done}/${cands.length} (ok ${artworks.length}, imgErr ${imgErr})`); }
      if (done % 500 === 0) { try { writeCollection([...artworks].sort((a, b) => Number(a.metadata.ph_id) - Number(b.metadata.ph_id)), COLLECTION_STEM, totalInScope); } catch (e) { console.log('  [checkpoint warn]', e.message); } }
    }
  }));
  saveProgress(prog);
  artworks.sort((a, b) => Number(a.metadata.ph_id) - Number(b.metadata.ph_id));
  const out = writeCollection(artworks, COLLECTION_STEM, totalInScope);
  console.log(`\n[full] DONE. collected ${artworks.length} | img errors ${imgErr}`);
  console.log(`[full] → ${out}`);
}

// ---------- main ----------
(async () => {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  if (MODE === 'probe') await runProbe();
  else await runFull();
})().catch((e) => { console.error(e); process.exit(1); });
