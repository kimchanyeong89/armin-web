#!/usr/bin/env node
// Architekturzentrum Wien (Az W) — Austrian national architecture museum (Vienna).
// GENRE: 건축 (Architecture) — flat archival works: architectural photographs, drawings, plans.
//
// Source: museum-OWN "Sammlung Online" JSON API (Manticore Search backend), no auth, no key.
//   Public SPA:  https://www.azw.at/de/sammlung-online/   (Vue app, plugin azw-sammlung)
//   API base:    https://api.sammlung.azw.at/api
//   Images:      https://images.sammlung.azw.at/{size}/{uuid[0:2]}/{uuid[2:4]}/{uuid}_{suffix}.jpg
//     Sizes: small (400px long-edge, _s) and medium (700px long-edge, _m). NO large/original exist.
//     Search _source.image_path returns the SMALL (400px) variant → must transform to medium (_m, 700px)
//     to clear the ≥600px bar:  "small/aa/bb/<uuid>_s.jpg" → "medium/aa/bb/<uuid>_m.jpg".
//
//   LISTING (paged search) — POST /search   (Manticore JSON query DSL):
//     body { index:"entries", limit, offset, max_matches:50000, sort:"name_asc",
//            query:{ bool:{ must:[ {equals:{type:"work"}}, {equals:{is_part_of_azw_collection_facet:true}} ] } } }
//     -> { hits:{ total, hits:[ { _id, _source:{ title, persons, person_facet[], year_range,
//            date_from_facet, date_to_facet, collection_name, function, city, country, address,
//            slug, image_path, is_part_of_azw_collection_facet } } ] } }
//     NOTE: `max_matches:50000` is REQUIRED to page past offset ~2000 (else deep offsets return empty).
//           `sort` must be one of: relevance | name_asc | name_desc | date_asc | date_desc.
//           `must_not` is NOT supported — filter empty image_path client-side.
//
//   KEY-IMAGE meta (category/credit) — GET /work/{slug}/image
//     -> { data:{ title, image_number, credit, dating, document_category, image_path } }
//     document_category ∈ {Negativ, Ekta, Diapositiv, Positiv, Foto, ...} → photograph;
//       {Plan, Zeichnung, Skizze, Entwurf, ...} → drawing.  Default (architecture archive) → drawing.
//
// SCOPE (건축, flat visual works): type="work" AND is_part_of_azw_collection=true (the genuine
//   Az W-owned holdings — named architect archives: Achleitner, Spiluttini, Domenig, Tesar, Mack,
//   Hollein, Lackner, Staber…). One representative key image per architecture project.
//   Excluded: type="person" (Architektinnenlexikon biographies, 3,780 — no artwork);
//             works with empty image_path (no downloadable image);
//             the ~21k non-Az W index-only "Architektur Austria" entries (not museum holdings).
//   Each key image is a real archival photograph or architectural drawing — flat, in-scope.
//   Architectural drawings/photographs are NEVER colour-gated (per COLLECTION_SCRAPING_GUIDE §1).
//
// Usage:
//   node scripts/scrape-azw-vienna.mjs --probe     # ~18 works end-to-end + R2 upload  (proves the pipe)
//   node scripts/scrape-azw-vienna.mjs --full      # full in-scope scrape + R2, resumable
//   node scripts/scrape-azw-vienna.mjs --count      # just print scope totals, no images

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

const SLUG = 'azw-vienna';
const COLLECTION_STEM = `${SLUG}-collection`;
const API = 'https://api.sammlung.azw.at/api';
const IMAGES_BASE = 'https://images.sammlung.azw.at';
const SPA_DETAIL = 'https://www.azw.at/de/sammlung-online/work'; // public detail: /work/{slug}
const UA = 'armin-museum-research/1.0';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const PROGRESS = path.join(STATE_DIR, `${SLUG}-progress.json`);
const FAILED = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : args.includes('--count') ? 'count' : 'probe';
const PROBE_TARGET = 18;
const PAGE = 100;   // search page size
const CONC = 6;     // image download/upload concurrency
const CAP_BYTES = 23 * 1024 * 1024;

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

const JSON_HEADERS = {
  'User-Agent': UA,
  'Content-Type': 'application/json',
  Accept: 'application/json',
  Origin: 'https://www.azw.at',
  Referer: 'https://www.azw.at/',
};

// in-scope filter: Az W-owned architecture works
const SCOPE_MUST = [
  { equals: { type: 'work' } },
  { equals: { is_part_of_azw_collection_facet: true } },
];

// ---------- API: paged search ----------
async function searchPage(offset, limit) {
  const body = JSON.stringify({
    index: 'entries',
    limit,
    offset,
    max_matches: 50000,
    sort: 'name_asc',
    query: { bool: { must: SCOPE_MUST } },
  });
  for (let att = 1; att <= 4; att++) {
    try {
      const r = await fetch(`${API}/search`, { method: 'POST', headers: JSON_HEADERS, body });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      if (!j.hits) throw new Error(`no hits: ${JSON.stringify(j).slice(0, 160)}`);
      return j.hits;
    } catch (e) { if (att === 4) throw e; await sleep(600 * att); }
  }
}

async function getTotal() {
  const h = await searchPage(0, 0);
  return h.total;
}

// key-image meta (category + credit) — best-effort; null on failure
async function fetchImageMeta(slug) {
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(`${API}/work/${encodeURIComponent(slug)}/image`, { headers: JSON_HEADERS });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      return j.data || null;
    } catch (e) { if (att === 3) return null; await sleep(400 * att); }
  }
  return null;
}

// search returns the 400px "small" variant; rewrite to the 700px "medium" variant.
// "small/aa/bb/<uuid>_s.jpg" → "medium/aa/bb/<uuid>_m.jpg"  (no large/original exist on this host)
function toMedium(p) {
  if (!p) return p;
  return p.replace(/^small\//, 'medium/').replace(/_s(\.[a-z]+)$/i, '_m$1');
}

// ---------- parse a search hit into a candidate (metadata from _source) ----------
const PHOTO_CATS = /negativ|ekta|diapositiv|positiv|foto|dia\b|abzug|kontakt|print/i;
const DRAW_CATS = /plan|zeichnung|skizze|entwurf|riss|grundriss|aufriss|schnitt|detail/i;

function parseHit(h) {
  const s = h._source || {};
  if (!s.slug) return null;
  if (!s.image_path) return null;            // no downloadable image → skip
  const title = (s.title || '').trim();
  if (!title) return null;

  // architect / maker — prefer the facet array (clean names), else the `persons` blob
  let artist = '';
  if (Array.isArray(s.person_facet) && s.person_facet.length) artist = s.person_facet.join('; ');
  else if (s.persons) artist = String(s.persons).trim();
  if (!artist) artist = 'unbekannt'; // Az W: many anonymous archival items — keep, set below

  // year: prefer the numeric facet, fall back to parsing year_range
  let year = null;
  if (Number.isFinite(s.date_from_facet)) year = s.date_from_facet;
  else if (s.year_range) { const m = String(s.year_range).match(/\d{3,4}/); if (m) year = parseInt(m[0], 10); }

  const dateStr = s.year_range || (s.date_from_facet
    ? (s.date_to_facet && s.date_to_facet !== s.date_from_facet ? `${s.date_from_facet}–${s.date_to_facet}` : String(s.date_from_facet))
    : '');

  const collection = s.collection_name || (Array.isArray(s.collection_facet) ? s.collection_facet.join(', ') : '');

  return {
    id: `${SLUG}-${s.slug}`,            // globally-unique id (slug already unique within Az W)
    slug: s.slug,
    objectNumber: '',                    // inventory no. not in _source; filled from /image if present
    title,
    artist,
    year,
    dateStr,
    function_azw: s.function || '',
    collection,
    city: s.city || '',
    country: s.country || '',
    address: s.address || '',
    imagePath: s.image_path,             // small variant from search ("small/aa/bb/<uuid>_s.jpg")
    imgUrl: `${IMAGES_BASE}/${toMedium(s.image_path)}`, // → medium (700px) to clear ≥600px bar
    sourceUrl: `${SPA_DETAIL}/${s.slug}`,
  };
}

// decide category from key-image document_category (architecture archive → drawing by default)
function categoryFor(a, imgMeta) {
  const dc = imgMeta?.document_category || '';
  const credit = imgMeta?.credit || '';
  if (PHOTO_CATS.test(dc) || /foto\s*:/i.test(credit)) return 'photograph';
  if (DRAW_CATS.test(dc)) return 'drawing';
  // collection-level hint: photographer fonds (Spiluttini, *Fotokonvolute*, *Fotograf*) → photograph
  if (/spiluttini|fotokonvolut|fotograf/i.test(a.collection)) return 'photograph';
  // Az W is an architecture archive: representative key images are predominantly drawings/plans
  return 'drawing';
}

// ---------- image: download, verify ≥600px, autocrop→webp, upload R2 ----------
async function dl(url) {
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Referer: 'https://www.azw.at/' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 4000) throw new Error(`tiny ${buf.length}b`);
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
  const { buffer } = await autocropToWebp(src);
  const hash8 = sha(a.imgUrl).slice(0, 8);
  const key = `artworks/${COLLECTION_STEM}/${a.id}-${hash8}-imageUrl.webp`;
  await uploadR2(key, buffer);
  return { imageUrl: `${R2_PUBLIC}/${key}`, srcW: meta.width || null, srcH: meta.height || null };
}

// ---------- record assembly (min-4 guard) ----------
function toArtwork(a, imageUrl, imgMeta) {
  // min-4: title, artist, year, category. Anonymous archival items are common — keep artist as-is
  // ("unbekannt") but require a usable year; without a year we drop (per guide: no Unknown padding).
  if (!a.title || a.year == null || !a.category) return null;
  const credit = imgMeta?.credit || '';
  return {
    id: a.id,
    objectNumber: imgMeta?.image_number || a.objectNumber || '',
    title: a.title,
    artist: a.artist,
    date: a.dateStr || String(a.year),
    year: a.year,
    medium: imgMeta?.document_category || '',
    dimensions: '',
    category: a.category,
    description: a.function_azw || '',
    imageUrl,
    thumbnailUrl: a.imgUrl,
    onDisplay: false,
    displayLocation: '',
    sourceUrl: a.sourceUrl,
    metadata: {
      collection: a.collection,
      function: a.function_azw,
      city: a.city,
      country: a.country,
      address: a.address,
      credit,
      document_category: imgMeta?.document_category || '',
      image_title: imgMeta?.title || '',
    },
    original_imageUrl: a.imgUrl,
  };
}

function writeCollection(artworks, stem, compact) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'Architekturzentrum Wien (Az W)',
    collection: 'Architecture Collection',
    website: 'https://www.azw.at/de/sammlung-online/',
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

// ---------- gather candidates (paged) ----------
async function gather(maxNeeded) {
  const out = [];
  const total = await getTotal();
  console.log(`[search] Az W-collection works (type=work & is_part_of_azw_collection): ${total}`);
  for (let off = 0; off < total; off += PAGE) {
    const hits = await searchPage(off, PAGE);
    for (const h of hits.hits || []) {
      const a = parseHit(h);
      if (a) out.push(a);
    }
    if (off % (PAGE * 10) === 0) console.log(`  …listed ${Math.min(off + PAGE, total)}/${total}, with-image ${out.length}`);
    if (maxNeeded && out.length >= maxNeeded) break;
    await sleep(120);
  }
  return out;
}

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });

  if (MODE === 'count') {
    const total = await getTotal();
    // also sample image-coverage
    const hits = await searchPage(0, 300);
    const withImg = (hits.hits || []).filter((h) => h._source?.image_path).length;
    console.log(`[count] Az W-collection works: ${total}; image coverage ~${Math.round(100 * withImg / Math.max(hits.hits.length, 1))}% → est in-scope ~${Math.round(total * withImg / Math.max(hits.hits.length, 1))}`);
    return;
  }

  const candidates = await gather(MODE === 'probe' ? PROBE_TARGET * 2 : 0);
  console.log(`[${MODE}] candidates with image: ${candidates.length}`);

  let work = candidates;
  if (MODE === 'probe') work = candidates.slice(0, PROBE_TARGET);

  // resumable
  let doneIds = new Set();
  if (MODE === 'full' && fs.existsSync(PROGRESS)) {
    try { doneIds = new Set(JSON.parse(fs.readFileSync(PROGRESS, 'utf8')).doneIds || []); } catch {}
    console.log(`[full] resuming: ${doneIds.size} ids already processed`);
  }

  const artworks = [];
  let done = 0, imgErr = 0, drop4 = 0, bytesEst = 0;
  let idx = 0, capped = false;
  const persist = () => { if (MODE === 'full') fs.writeFileSync(PROGRESS, JSON.stringify({ doneIds: [...doneIds] })); };

  await Promise.all(Array.from({ length: CONC }, async () => {
    while (idx < work.length && !capped) {
      const a = work[idx++];
      if (doneIds.has(a.id)) continue;
      try {
        const imgMeta = await fetchImageMeta(a.slug);
        a.category = categoryFor(a, imgMeta);
        const { imageUrl } = await processImage(a);
        const w = toArtwork(a, imageUrl, imgMeta);
        if (w) {
          artworks.push(w);
          bytesEst += JSON.stringify(w).length + 2;
          if (MODE === 'full' && bytesEst > CAP_BYTES) { capped = true; console.log(`[full] hit size cap (~${(bytesEst / 1024 / 1024).toFixed(1)}MB) at ${artworks.length} works`); }
        } else drop4++;
        doneIds.add(a.id);
      } catch (e) {
        imgErr++;
        fs.appendFileSync(FAILED, JSON.stringify({ id: a.id, url: a.imgUrl, err: String(e.message || e) }) + '\n');
        if (imgErr <= 8) console.log(`  img err ${a.slug}: ${e.message}`);
      }
      if (++done % 100 === 0) { console.log(`  …${done}/${work.length} (ok ${artworks.length}, imgErr ${imgErr}, ~${(bytesEst / 1024 / 1024).toFixed(1)}MB)`); persist(); }
    }
  }));
  persist();

  artworks.sort((x, y) => String(x.id).localeCompare(String(y.id)));
  const stem = MODE === 'probe' ? `${COLLECTION_STEM}-probe` : COLLECTION_STEM;
  writeCollection(artworks, stem, /*compact*/ MODE === 'full');
  console.log(`\n[${MODE}] DONE. collected ${artworks.length} | img errors ${imgErr} | min4-drops ${drop4}`);
  if (MODE === 'probe') {
    const sample = artworks.slice(0, 6).map((w) => ({ id: w.id, cat: w.category, title: w.title.slice(0, 40), artist: w.artist.slice(0, 28), year: w.year, img: w.imageUrl }));
    console.log('[probe] sample:', JSON.stringify(sample, null, 2));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
