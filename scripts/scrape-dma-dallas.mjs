#!/usr/bin/env node
// Dallas Museum of Art (Dallas, TX) — full collection scraper.
// 100% museum-OWN infrastructure, no auth / no API key. THREE DMA endpoints:
//   1. SEARCH  (enumerate ids + cheap medium prefilter):
//        POST https://search.dma.org/production_collection_objects/_search   (open Elasticsearch)
//        — the _doc-sorted `search_after` cursor pages past the 10k max_result_window.
//        — _source has: id, number, title, medium, department, dated, date_begin,
//          display_status, primary_image, constituents[] {name,role:"Artist",…}.
//        — ⚠️ the index DOES NOT carry `classification` or `dimensions`.
//   2. DETAIL  (authoritative scope + dimensions, one GET per object):
//        GET https://files.dma.org/collection/production/objects/{id}/object.json
//        — adds `classification` ("Paintings"/"Prints"/"Drawings"/"Photographs"/"Pastels"/
//          "Watercolors"/"Sculpture"/… — clean), `dimensions` (full cm text), `object_name`,
//          `copyright`. This is the museum-OWN category source.
//   3. IMAGE   (IIIF v2, full-size):
//        https://image.dma.org/iiif/2/production__objects__{id}__{primary_image}__image.jpg/full/full/0/default.jpg
//        — DMA stores images at ≤1200 px on the long edge, so `full/full` IS the full-size
//          master. (`/full/!2048,2048/…` returns HTTP 403 on this server — upscale syntax is
//          blocked; `full/full` == native max, never a thumbnail.) The webp pass re-encodes at
//          2048/q85 withoutEnlargement, so masters stay at native resolution.
//
// SCOPE (flat works only — painting | drawing | print | photograph):
//   Authoritative = object.json `classification`:
//     *Painting* / Watercolors            → painting
//     *Print*    / Posters                 → print
//     *Drawing*  / Pastels                 → drawing
//     *Photograph*                         → photograph
//     Works on Paper / Collages            → resolved by medium (print-medium→print else drawing)
//     Sculpture, Containers, Books, Installation, Time Based Media, decorative/3D → OUT
//   Paintings: ALL, no cap. Value-filter: skip study/sketch/copy-after; skip portrait miniatures
//   (ivory/enamel/vellum, ≤14 cm). Anonymous/Unknown artist is NEVER filled — min-4 drop instead.
//
// Usage:
//   node scripts/scrape-dma-dallas.mjs --classify        # dry-run: scope tally only (samples detail, no images)
//   node scripts/scrape-dma-dallas.mjs --pilot [N]       # build ~N in-scope (default 20) + R2 upload, pilot JSON
//   node scripts/scrape-dma-dallas.mjs --pilot --no-upload  # pilot WITHOUT R2 (metadata-only verify)
//   node scripts/scrape-dma-dallas.mjs --full            # full scrape + R2 upload, write collection JSON

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

const SLUG = 'dma-dallas';
const COLLECTION_STEM = `${SLUG}-collection`;
const SEARCH = 'https://search.dma.org/production_collection_objects/_search';
const DETAIL = (id) => `https://files.dma.org/collection/production/objects/${id}/object.json`;
const IIIF = (id, pi) => `https://image.dma.org/iiif/2/production__objects__${id}__${pi}__image.jpg/full/full/0/default.jpg`;
const OBJECT_PAGE = (id) => `https://dma.org/art/collection/object/${id}`;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : args.includes('--pilot') ? 'pilot' : 'classify';
const NO_UPLOAD = args.includes('--no-upload');
const PILOT_TARGET = (() => { const n = args.find((a) => /^\d+$/.test(a)); return n ? parseInt(n, 10) : 20; })();

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const clean = (s) => (s == null ? '' : String(s)).replace(/\s+/g, ' ').trim();

// ---------- ES search: enumerate the whole index via _doc search_after ----------
async function esPost(body) {
  for (let att = 1; att <= 4; att++) {
    try {
      const r = await fetch(SEARCH, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) { if (att === 4) throw e; await sleep(600 * att); }
  }
}

// Page every object id (+ index-level prefilter fields). Returns array of _source rows.
async function enumerateIndex({ onPage } = {}) {
  const SOURCE = ['id', 'number', 'title', 'medium', 'department', 'dated', 'date_begin', 'display_status', 'primary_image', 'constituents'];
  const PAGE = 1000;
  const out = [];
  let after = null;
  let total = null;
  for (;;) {
    const body = { size: PAGE, track_total_hits: true, query: { match_all: {} }, sort: ['_doc'], _source: SOURCE };
    if (after) body.search_after = after;
    const j = await esPost(body);
    if (total == null) { total = j.hits.total.value; console.log(`[enum] index total = ${total}`); }
    const hits = j.hits.hits;
    if (!hits.length) break;
    for (const h of hits) out.push(h._source);
    after = hits[hits.length - 1].sort;
    if (onPage) onPage(out.length, total);
    if (out.length % 5000 < PAGE) console.log(`  [enum] ${out.length}/${total}`);
    await sleep(120);
    if (hits.length < PAGE) break;
  }
  console.log(`[enum] enumerated ${out.length}/${total} index rows`);
  return out;
}

// ---------- cheap index prefilter: drop obvious 3D before paying for object.json ----------
// The index `medium` free-text is messy but its leading material reliably flags decorative/3D.
// We KEEP anything that could be flat (paint/print/draw/photo terms, work-on-paper, or unknown)
// and only DROP rows whose medium is dominated by a hard 3D material. Authoritative scope is
// still decided later from object.json `classification`; this only saves detail GETs.
const FLAT_HINT = /\b(oil|acryl|tempera|watercolou?r|gouache|casein|encaustic|paint|canvas|panel|board|masonite|fresco|litho|lithograph|etch|engrav|aquatint|drypoint|mezzotint|woodcut|woodblock|linocut|screenprint|silkscreen|serigraph|monotype|monoprint|print|poster|graphite|pencil|charcoal|chalk|pastel|crayon|conté|conte|ink|wash|sanguine|sepia|drawing|collage|gelatin silver|c-print|chromogenic|dye transfer|inkjet|pigment print|platinum print|albumen|daguerreotype|tintype|cyanotype|photograph|on paper|on vellum)\b/i;
const HARD_3D = /\b(silver|gold|gilt|bronze|brass|copper|iron|steel|stainless|pewter|aluminum|aluminium|tin|lead|metal|ceramic|porcelain|earthenware|stoneware|terracotta|terra cotta|faience|glass|crystal|stone|marble|granite|alabaster|jade|wood|ebony|mahogany|teak|oak|bamboo|ivory|bone|horn|shell|lacquer|enamel|cotton|wool|silk|linen|fiber|fibre|textile|leather|hide|feather|basket|gourd|plaster|wax|resin|plastic|rubber|concrete|neon)\b/i;
function indexLooksFlat(row) {
  const m = (row.medium || '').toLowerCase();
  if (!m) return true;                 // empty medium (779 rows) → keep, let object.json decide
  if (FLAT_HINT.test(m)) return true;  // any flat hint wins (e.g. "oil on canvas", "ivory" but "watercolor on ivory" still flat)
  if (HARD_3D.test(m)) return false;   // dominated by 3D material, no flat hint → drop
  return true;                         // unknown → keep (conservative)
}

// ---------- detail fetch ----------
async function fetchDetail(id) {
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(DETAIL(id), { headers: { 'User-Agent': UA } });
      if (r.status === 404) return null;          // object.json genuinely absent
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const t = await r.text();                   // served as octet-stream; parse manually
      return JSON.parse(t);
    } catch (e) { if (att === 3) { return { __err: String(e.message || e) }; } await sleep(400 * att); }
  }
}

// ---------- classification → category (authoritative, from object.json) ----------
const PRINT_MEDIUM = /\b(litho|lithograph|etch|engrav|aquatint|drypoint|mezzotint|woodcut|woodblock|linocut|screenprint|silkscreen|serigraph|monotype|monoprint|relief print|intaglio|offset|poster|print)\b/i;
function mapCategory(cls, medium) {
  const c = (cls || '').toLowerCase();
  if (!c) return null;
  if (/photograph/.test(c)) return 'photograph';
  if (/paint/.test(c) || /watercolor/.test(c)) return 'painting';
  if (/print/.test(c) || /poster/.test(c)) return 'print';
  if (/drawing/.test(c) || /pastel/.test(c)) return 'drawing';
  // ambiguous works-on-paper / collages: resolve by medium
  if (/works on paper|collage/.test(c)) return PRINT_MEDIUM.test(medium || '') ? 'print' : 'drawing';
  return null; // Sculpture, Containers, Books, Installation, Time Based Media, decorative, etc. → OUT
}

// ---------- value-filter: study/sketch/copy + portrait-miniature ----------
function isStudyOrCopy(title, objectName) {
  const s = `${title || ''} ${objectName || ''}`.toLowerCase();
  if (/\b(study|sketch|preparatory)\b/.test(s)) return true;
  if (/\bcopy after\b|\bcopy of\b|\bafter\s+[A-Z]/.test(`${title || ''} ${objectName || ''}`)) return true;
  return false;
}
// portrait miniature: paint-led on ivory/enamel/vellum AND ≤14 cm longest side.
// (guards: "vellum paper", mixed-media lists, and enamel buttons handled by the size+paint test)
function maxDimCm(dimText) {
  const cms = [...String(dimText || '').matchAll(/([\d.]+)\s*(?:×|x)\s*([\d.]+)(?:\s*(?:×|x)\s*([\d.]+))?\s*cm/gi)];
  let mx = 0;
  for (const m of cms) for (const v of [m[1], m[2], m[3]]) { const f = parseFloat(v); if (!isNaN(f)) mx = Math.max(mx, f); }
  return mx; // 0 = unknown
}
function isPortraitMiniature(medium, dimText, category) {
  if (category !== 'painting' && category !== 'drawing') return false;
  const m = (medium || '').toLowerCase();
  const onMini = /(on|sur)\s+(ivory|enamel|vellum)\b/.test(m) || /\b(ivory|enamel|vellum)\b/.test(m);
  if (!onMini) return false;
  if (/vellum\s+paper/.test(m)) return false; // vellum-paper is ordinary works-on-paper
  const mx = maxDimCm(dimText);
  if (mx === 0) return false;                  // unknown size → don't assume miniature
  return mx <= 14;
}

// ---------- detail record → ARMIN candidate ----------
function parseYear(dated, dateBegin) {
  // prefer `dated` display string (most accurate), fall back to date_begin
  const fromDated = String(dated || '').match(/(\d{3,4})/);
  if (fromDated) return parseInt(fromDated[1], 10);
  const fromBegin = String(dateBegin || '').match(/-?\d{1,4}/);
  if (fromBegin) { const y = parseInt(fromBegin[0], 10); if (!isNaN(y) && y !== 0) return y; }
  return null;
}
function artistFrom(constituents) {
  const arts = (constituents || []).filter((c) => (c.role || '').toLowerCase() === 'artist' && clean(c.name));
  const names = (arts.length ? arts : (constituents || []).filter((c) => clean(c.name)))
    .map((c) => clean(c.name)).filter(Boolean);
  return [...new Set(names)].join('; ');
}

function buildCandidate(idxRow, detail) {
  const id = String(idxRow.id);
  const cls = detail.classification || '';
  const medium = clean(detail.medium || idxRow.medium);
  const category = mapCategory(cls, medium);
  if (!category) return { id, category: null };          // out of scope

  const title = clean(detail.title || idxRow.title);
  const objectName = clean(detail.object_name);
  const artist = artistFrom(detail.constituents || idxRow.constituents);
  const dimensions = clean(detail.dimensions);
  const year = parseYear(detail.dated || idxRow.dated, detail.date_begin || idxRow.date_begin);
  const dateStr = clean(detail.dated || idxRow.dated) || (year != null ? String(year) : '');
  const primary_image = detail.primary_image || idxRow.primary_image;
  const displayStatus = (detail.display_status || idxRow.display_status || '').toLowerCase();

  return {
    id, category, title, artist, year, dateStr, medium, dimensions,
    objectNumber: clean(detail.number || idxRow.number),
    description: clean(detail.description),
    primary_image,
    imgUrl: primary_image ? IIIF(id, primary_image) : null,
    onDisplay: displayStatus === 'on view' || displayStatus === 'on-view',
    classification: cls,
    objectName,
    copyright: (detail.copyright && (detail.copyright.credit_line || detail.copyright.type)) || '',
    department: clean(detail.department || idxRow.department),
    sourceUrl: OBJECT_PAGE(id),
  };
}

// ---------- image: download full-size, re-encode to webp, upload to R2 ----------
async function dl(url) {
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (r.status === 403 || r.status === 404) throw new Error(`HTTP ${r.status} (no image)`);
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

async function processImage(a) {
  const src = await dl(a.imgUrl);                        // IIIF full/full (native master, ≤1200px)
  const meta = await (await import('sharp')).default(src).metadata().catch(() => ({}));
  if (meta.width && Math.max(meta.width, meta.height) < 400) throw new Error(`thumb ${meta.width}x${meta.height}`);
  const { buffer } = await autocropToWebp(src);          // NO trim (opt-in) → pure webp(2048/q85, no-enlarge)
  if (NO_UPLOAD) return { imageUrl: null, srcW: meta.width || null, srcH: meta.height || null };
  const hash8 = sha(a.imgUrl).slice(0, 8);
  const key = `artworks/${COLLECTION_STEM}/${a.id}-${hash8}-imageUrl.webp`;
  await uploadR2(key, buffer);
  return { imageUrl: `${R2_PUBLIC}/${key}`, srcW: meta.width || null, srcH: meta.height || null };
}

// ---------- record assembly (min-4 guard) ----------
function toArtwork(a, imageUrl) {
  if (!a.title || !a.artist || a.year == null || !a.category) return null; // min-4 → drop
  return {
    id: a.id,
    objectNumber: a.objectNumber || '',
    title: a.title,
    artist: a.artist,
    date: a.dateStr || (a.year != null ? String(a.year) : ''),
    year: a.year,
    medium: a.medium,
    dimensions: a.dimensions,
    category: a.category,
    description: a.description || '',
    imageUrl,
    thumbnailUrl: a.imgUrl,
    onDisplay: !!a.onDisplay,
    displayLocation: '',
    sourceUrl: a.sourceUrl,
    metadata: {
      dma_id: a.id,
      classification: a.classification,
      object_name: a.objectName || '',
      department: a.department || '',
      copyright: a.copyright || '',
    },
    original_imageUrl: a.imgUrl,
  };
}

function writeCollection(artworks, stem) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'Dallas Museum of Art',
    collection: 'Collection',
    website: 'https://dma.org/art/collection',
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

// ---------- detail fetch pool over a list of index rows ----------
async function resolveCandidates(rows, { limit = Infinity, label = 'resolve' } = {}) {
  const candidates = [];
  const stats = { detailFetched: 0, detail404: 0, detailErr: 0, outScope: 0, study: 0, miniature: 0, noImg: 0 };
  let idx = 0, done = 0;
  const CONC = 8;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (idx < rows.length && candidates.length < limit) {
      const row = rows[idx++];
      const d = await fetchDetail(row.id);
      done++;
      if (done % 500 === 0) console.log(`  [${label}] detail ${done}/${rows.length} (in-scope ${candidates.length})`);
      if (d == null) { stats.detail404++; continue; }
      if (d.__err) { stats.detailErr++; fs.appendFileSync(path.join(STATE_DIR, `${SLUG}-detail-failed.ndjson`), JSON.stringify({ id: row.id, err: d.__err }) + '\n'); continue; }
      stats.detailFetched++;
      const a = buildCandidate(row, d);
      if (!a.category) { stats.outScope++; continue; }
      if (isStudyOrCopy(a.title, a.objectName)) { stats.study++; continue; }
      if (isPortraitMiniature(a.medium, a.dimensions, a.category)) { stats.miniature++; continue; }
      if (!a.imgUrl) { stats.noImg++; continue; }
      candidates.push(a);
    }
  }));
  return { candidates, stats };
}

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });

  // 1) enumerate the whole index
  const rows = await enumerateIndex();
  // 2) cheap index prefilter → flat-candidate rows
  const flatRows = rows.filter(indexLooksFlat);
  console.log(`[prefilter] index rows ${rows.length} → flat-candidate ${flatRows.length} (dropped ${rows.length - flatRows.length} obvious 3D)`);

  if (MODE === 'classify') {
    // sample the flat rows' detail to estimate true in-scope category split (no images)
    const SAMPLE = Math.min(600, flatRows.length);
    // deterministic spread sample across the prefiltered list
    const step = Math.max(1, Math.floor(flatRows.length / SAMPLE));
    const sampleRows = flatRows.filter((_, i) => i % step === 0).slice(0, SAMPLE);
    console.log(`\n[classify] sampling ${sampleRows.length} of ${flatRows.length} flat rows via object.json …`);
    const { candidates, stats } = await resolveCandidates(sampleRows, { label: 'classify' });
    const tally = {};
    let dropMin4 = 0;
    for (const a of candidates) { tally[a.category] = (tally[a.category] || 0) + 1; if (!a.title || !a.artist || a.year == null) dropMin4++; }
    const inRate = candidates.length / sampleRows.length;
    console.log('\n[classify] sample detail stats:', stats);
    console.log('[classify] sample in-scope category split:', tally);
    console.log(`[classify] sample in-scope rate = ${(inRate * 100).toFixed(1)}% of flat rows`);
    console.log(`[classify] EXTRAPOLATED in-scope ≈ ${Math.round(inRate * flatRows.length)} (of ${flatRows.length} flat rows; full index ${rows.length})`);
    console.log(`[classify] sample min-4 would-drop (missing title/artist/year): ${dropMin4}/${candidates.length}`);
    // show a few candidates for eyeballing
    for (const a of candidates.slice(0, 8)) console.log('   ·', a.category, '|', JSON.stringify(a.title).slice(0, 32), '|', a.artist.slice(0, 28), '|', a.year, '|', a.classification);
    return;
  }

  // pilot/full: resolve candidates from detail, then process images
  const limit = MODE === 'pilot' ? PILOT_TARGET : Infinity;
  const srcRows = MODE === 'pilot'
    ? flatRows.filter((_, i) => i % Math.max(1, Math.floor(flatRows.length / (PILOT_TARGET * 6))) === 0) // spread sample so pilot isn't all one dept
    : flatRows;
  console.log(`\n[${MODE}] resolving candidates from ${srcRows.length} flat rows (target ${limit === Infinity ? 'ALL' : limit}) …`);
  const { candidates, stats } = await resolveCandidates(srcRows, { limit, label: MODE });
  console.log(`[${MODE}] detail stats:`, stats, `→ ${candidates.length} in-scope candidates`);

  console.log(`\n[${MODE}] image-processing ${candidates.length} candidates → ${NO_UPLOAD ? 'NO-UPLOAD (metadata only)' : 'R2'} …`);
  const artworks = [];
  let done = 0, imgErr = 0, dropMin4 = 0;
  const CONC = 4;
  let idx = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (idx < candidates.length) {
      const a = candidates[idx++];
      try {
        const { imageUrl } = await processImage(a);
        const w = toArtwork(a, imageUrl);
        if (w) artworks.push(w); else dropMin4++;
      } catch (e) {
        imgErr++;
        fs.appendFileSync(path.join(STATE_DIR, `${SLUG}-img-failed.ndjson`), JSON.stringify({ id: a.id, url: a.imgUrl, err: String(e.message || e) }) + '\n');
        if (imgErr <= 8) console.log(`  img err id=${a.id}: ${e.message}`);
      }
      if (++done % 50 === 0) console.log(`  …${done}/${candidates.length} (ok ${artworks.length}, imgErr ${imgErr})`);
    }
  }));

  artworks.sort((x, y) => Number(x.id) - Number(y.id));
  const stem = MODE === 'pilot' ? `${COLLECTION_STEM}-pilot` : COLLECTION_STEM;
  writeCollection(artworks, stem);
  console.log(`\n[${MODE}] DONE. collected ${artworks.length} | img errors ${imgErr} | min4-drops ${dropMin4}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
