#!/usr/bin/env node
// Moderna Museet (Stockholm) collection scraper — Gallery Systems eMuseum on the museum's OWN
// collection-information-system subdomain: https://sis.modernamuseet.se  (SIS).
// Same eMuseum family as Wallace/Folkwang already in our corpus, but this front-end is the
// modern eMuseum (detailField/detailFieldLabel/detailFieldValue spans), not Zetcom eMuseumPlus.
//
// NO machine API (IIIF / JSON both 404 → fall through to HTML). Clean structured HTML scrape:
//   LISTING (enumerate {objId, mediaId}):
//     GET /en/objects/images?filter=classifications%3A<Facet>&page=N   (~12 result items/page)
//     Each result item = <div data-emuseum-id=".." class="result item grid-item ..">
//       · object id  : <a href="/en/objects/{ID}/{slug}...">
//       · media  id  : <img src="/internal/media/dispatcher/{mediaId}/thumbnail">
//       · NO image   : "<!-- No media available -->" + emuseum-defaultmedia-wrap → skip (no image)
//     Pagination: &page=N; loop until a page yields 0 result items (total count is client-side only).
//   DETAIL (parse all 6 metadata fields here):
//     GET /en/objects/{ID}/{slug}
//       titleField     → <h1 property="name">TITLE</h1> (+ sibling .moderna-by-artist "by X" only when untitled)
//       peopleField    → one <div class="detailField peopleField"> PER artist; name in property="name" span
//       displayDateField, mediumField (property="artMedium"), dimensionsField, classificationsField, invnoField
//   IMAGE (full-size, NOT thumbnail):
//     /internal/media/dispatcher/{mediaId}/full → high-res JPEG (e.g. 1200px vs 800px thumbnail).
//     autocrop white-trim → webp(2048/q85) → R2.
//
// SCOPE (museum's own /the-collection: 140k works, 90,560 online):
//   PAINTINGS = ALL, no cap (classifications:Paintings ≈ ~4,500 image-bearing records).
//   Other 2D = value-filtered: Photography (~100k), Drawings + Graphic art + Posters (~25k works on paper),
//   Moving Images (~400 art video/film). Skip study/sketch/copy/squeeze + portrait miniatures.
//   EXCLUDED: Sculptures, Installations, Performance, Artists' books (3D / bound / non-flat).
//
// RESUMABLE (huge corpus, multi-hour --full): processed objIds persisted to
//   scripts/.state/moderna-museet-processed.txt and skipped on restart; collection JSON
//   checkpointed every 200 keeps; R2 HeadObject skips already-uploaded images. Re-invoke to continue.
//
// Usage:
//   node scripts/scrape-moderna-museet.mjs --classify                # dry-run scope tally (enumerate ids, no images, no detail)
//   node scripts/scrape-moderna-museet.mjs --pilot --limit=20 --no-upload   # ~20 detail records, parse-only, no R2, no image
//   node scripts/scrape-moderna-museet.mjs --pilot                   # ~100 in-scope + R2 upload, write pilot JSON
//   node scripts/scrape-moderna-museet.mjs --full                    # full scrape + R2 upload, write collection JSON (resumable)

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { autocropToWebp } from './lib/autocrop.mjs';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
// CRITICAL: repo-root .env.local (NOT scripts/.env.local) or R2 creds load empty → upload silently disabled.
const REPO = path.resolve(fileURLToPath(import.meta.url), '../..');
require('dotenv').config({ path: path.join(REPO, '.env.local') });

const SLUG = 'moderna-museet';
const COLLECTION_STEM = `${SLUG}-collection`;
const BASE = 'https://sis.modernamuseet.se';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const PROCESSED_FILE = path.join(STATE_DIR, `${SLUG}-processed.txt`);
const FAILED_FILE = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const MODE = args.full ? 'full' : args.pilot ? 'pilot' : 'classify';
const NO_UPLOAD = !!args['no-upload'];
const LIMIT = args.limit ? Number(args.limit) : null;
const PILOT_TARGET = LIMIT || 100;
const CONCURRENCY = Number(args.concurrency || 4);
const REQ_DELAY = Number(args.delay || 250);     // politeness pause per object (detail fetch)
const MAX_PAGE = Number(args.maxpage || 2000);   // hard ceiling per facet (safety)

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});
const R2_READY = !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const hash8 = (s) => sha(s).slice(0, 8);
const dec = (s) => (s || '')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/&ndash;/g, '–').replace(/&mdash;/g, '—').replace(/&hellip;/g, '…');
const strip = (s) => dec((s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// ---------- in-scope classification facets (the museum's own facet vocabulary) ----------
// Listing-enumeration facets (param: classifications, value = English facet label).
// Order: paintings first (collect ALL), then value-filtered 2D, then video.
const FACETS = [
  { facet: 'Paintings',    category: 'painting',   paintingsAll: true },
  { facet: 'Drawings',     category: 'drawing',    paintingsAll: false },
  { facet: 'Graphic art',  category: 'print',      paintingsAll: false },
  { facet: 'Posters',      category: 'print',      paintingsAll: false },
  { facet: 'Moving Images',category: 'video',      paintingsAll: false },
  { facet: 'Photography',  category: 'photograph', paintingsAll: false },
];
// Map a DETAIL-page classification string → our category. Paintings wins if present (a work tagged
// "Photography,Paintings" or "Graphic art,Paintings" is a painting for our purposes).
function mapCategory(clsList) {
  const cls = clsList.map((c) => c.toLowerCase());
  if (cls.some((c) => c.includes('painting'))) return 'painting';
  if (cls.some((c) => c.includes('drawing'))) return 'drawing';
  if (cls.some((c) => c.includes('graphic') || c.includes('print') || c.includes('poster'))) return 'print';
  if (cls.some((c) => c.includes('moving image') || c.includes('video') || c.includes('film'))) return 'video';
  if (cls.some((c) => c.includes('photograph'))) return 'photograph';
  // hard-excluded shapes
  if (cls.some((c) => /sculptur|installation|performance|artist.* book|object/.test(c))) return null;
  return null;
}

// ---------- value filter for NON-painting 2D works (paintings are always kept) ----------
// Skip low-value / non-original / reproduction works (study/sketch/copy/squeeze) and portrait miniatures.
function valueReject(category, { title, medium, dimensions }) {
  if (category === 'painting') return null; // paintings: collect ALL, no value filter
  const t = (title || '').toLowerCase();
  const m = (medium || '').toLowerCase();
  // study / sketch / copy / squeeze / reproduction
  if (/\b(study|sketch|copy after|copy of|reproduction|squeeze|estampage|facsimile|facsimile)\b/.test(t)) return 'study/copy';
  if (/\b(efter|kopia efter)\b/.test(t)) return 'copy(sv)';
  // portrait miniature (ivory/enamel/vellum, small) — exclude per corpus policy
  if (/miniature/.test(t) || /miniature/.test(m)) {
    if (/ivory|enamel|vellum|elfenben|emalj|pergament/.test(m)) return 'miniature';
  }
  return null;
}

// ---------- listing: enumerate {objId, mediaId} for a facet (paginate to the end) ----------
async function fetchHtml(url, attempt = 1) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
    if ((r.status === 429 || r.status >= 500) && attempt <= 4) { await sleep(800 * 2 ** (attempt - 1)); return fetchHtml(url, attempt + 1); }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
  } catch (e) {
    if (attempt <= 3) { await sleep(600 * 2 ** (attempt - 1)); return fetchHtml(url, attempt + 1); }
    throw e;
  }
}

// Parse one listing page into result items: [{ objId, mediaId|null }]. Split per result-item div so
// the obj↔media pairing is intra-block (objects with no media are returned with mediaId:null).
function parseListing(html) {
  const items = [];
  // split on each result item container
  const parts = html.split(/<div data-emuseum-id="\d+" class="result item /);
  for (let i = 1; i < parts.length; i++) {
    const block = parts[i];
    const objM = block.match(/\/en\/objects\/(\d+)\//);
    if (!objM) continue;
    const objId = objM[1];
    const medM = block.match(/\/internal\/media\/dispatcher\/(\d+)\/(?:thumbnail|preview|full)/);
    items.push({ objId, mediaId: medM ? medM[1] : null });
  }
  return items;
}

function listingUrl(facet, page) {
  return `${BASE}/en/objects/images?filter=classifications%3A${encodeURIComponent(facet)}&page=${page}`;
}

// Enumerate every {objId, mediaId, facetCategory} across all in-scope facets.
// Dedupe by objId (a work in two facets, e.g. Paintings + Graphic art, is visited once; first facet wins).
async function enumerateAll(enumCap = Infinity) {
  const byId = new Map(); // objId -> { objId, mediaId, facetCategory }
  for (const f of FACETS) {
    let page = 1, pageItems = 0, facetCount = 0;
    do {
      const html = await fetchHtml(listingUrl(f.facet, page));
      const items = parseListing(html);
      pageItems = items.length;
      for (const it of items) {
        if (!byId.has(it.objId)) byId.set(it.objId, { ...it, facetCategory: f.category });
        else if (!byId.get(it.objId).mediaId && it.mediaId) byId.get(it.objId).mediaId = it.mediaId;
      }
      facetCount += items.length;
      page++;
      await sleep(120);
    } while (pageItems > 0 && page <= MAX_PAGE && byId.size < enumCap);
    console.log(`[enum] ${f.facet}: ${facetCount} listed across ${page - 2} pages`);
    if (byId.size >= enumCap) { console.log(`[enum] reached cap ${enumCap}; stopping early (pilot)`); break; }
  }
  return [...byId.values()];
}

// ---------- detail page → all 6 fields ----------
// Extract one detailField div's value text by its class name (e.g. 'mediumField', 'invnoField').
function fieldValue(html, cls) {
  const re = new RegExp(`<div class="detailField ${cls}">([\\s\\S]*?)</div>\\s*(?=<div class="detailField|<div class="detail|</div>)`);
  let m = html.match(re);
  if (!m) m = html.match(new RegExp(`<div class="detailField ${cls}">([\\s\\S]*?)</div>`));
  if (!m) return '';
  // take the detailFieldValue span(s) inside; for medium it carries property="artMedium"
  const vm = m[1].match(/<span[^>]*class="detailFieldValue"[^>]*>([\s\S]*?)<\/span>\s*$/) ||
             m[1].match(/(?:property="artMedium"[^>]*class="detailFieldValue"|class="detailFieldValue"[^>]*property="artMedium")[^>]*>([\s\S]*?)<\/span>/) ||
             m[1].match(/class="detailFieldValue"[^>]*>([\s\S]*?)<\/span>/);
  return strip(vm ? vm[1] : m[1]);
}

function parseDetail(html) {
  if (!html.includes('class="detailField titleField"') && !html.includes('property="name"')) return null;

  // TITLE: the h1 property="name" inside titleField. The "by {artist}" is a sibling .moderna-by-artist
  // div present ONLY for untitled works → if the h1 is empty, set Untitled.
  let title = '';
  const tf = html.match(/<div class="detailField titleField">([\s\S]*?)<\/div>/);
  const h1 = (tf ? tf[1] : html).match(/<h1[^>]*property="name"[^>]*>([\s\S]*?)<\/h1>/);
  title = strip(h1 ? h1[1] : '');
  // guard: if the title slot rendered only the maker-fallback "by X", treat as Untitled
  if (!title || /^by\s+/i.test(title)) title = 'Untitled';

  // ARTIST: every <div class="detailField peopleField"> is one artist (label "Artist"). Join with "; ".
  // Skip non-creator roles (former owner / donor / publisher / sitter / after).
  const artists = [];
  const peopleRe = /<div class="detailField peopleField"><span class="detailFieldLabel">([^<]*)<\/span>([\s\S]*?)<\/div>/g;
  let pm;
  while ((pm = peopleRe.exec(html))) {
    const label = strip(pm[1]).toLowerCase();
    if (/former owner|donor|donator|publisher|printer publisher|sitter|depicted|after\b|efter\b|tidigare ägare/.test(label)) continue;
    const nameM = pm[2].match(/property="name"[^>]*>([\s\S]*?)<\/span>/);
    const name = strip(nameM ? nameM[1] : '');
    if (name && !/^(anonym|anonymous|unknown|okänd|obekant)$/i.test(name)) artists.push(name);
  }
  const artist = [...new Set(artists)].join('; ');

  // DATE / YEAR
  const dateStr = fieldValue(html, 'displayDateField');
  const ym = dateStr.match(/\b(1[0-9]{3}|20[0-9]{2})\b/);
  const year = ym ? Number(ym[0]) : null;

  // MEDIUM
  const medium = fieldValue(html, 'mediumField');

  // DIMENSIONS — prefer "Bildmått:" (image size of the work); ignore frame/outer/etc. The value packs
  // several labelled measurements ("Bildmått: A Ram: B Yttermått: C"). Take Bildmått up to the NEXT
  // capitalised "Word(s):" label (Ram/Yttermått/Pappersmått/Plåtmått/Objektmått/…). decimal comma → dot.
  let dimensions = fieldValue(html, 'dimensionsField');
  // boundary = the next labelled measurement ("…mått:" e.g. Ram/Yttermått/Pappersmått, or "Ram:")
  const NEXT = String.raw`\s+(?:[A-ZÅÄÖ][\wÅÄÖåäö ]*?m[åa]tt|Ram|Med ram)\s*:`;
  // prefer Bildmått (the work's own image size); else fall back to the FIRST measurement, stripping its
  // own leading "Label:" prefix so no Swedish label leaks into the value.
  let m = dimensions.match(new RegExp(String.raw`Bildm[åa]tt:\s*([\s\S]+?)(?:${NEXT}|$)`));
  if (!m) m = dimensions.match(new RegExp(String.raw`^\s*[A-ZÅÄÖ][\wÅÄÖåäö ]*?:\s*([\s\S]+?)(?:${NEXT}|$)`));
  if (m) dimensions = m[1].trim();
  dimensions = dimensions.replace(/(\d),(\d)/g, '$1.$2').replace(/\s+/g, ' ').trim();

  // CLASSIFICATION(S) — list items inside classificationsField
  const cf = html.match(/<div class="detailField classificationsField">([\s\S]*?)<\/span><\/div>/) ||
             html.match(/<div class="detailField classificationsField">([\s\S]*?)<\/div>/);
  const clsList = cf ? [...cf[1].matchAll(/<li[^>]*>(?:<a[^>]*>)?([^<]+)/g)].map((m) => strip(m[1])).filter(Boolean) : [];

  // OBJECT NUMBER
  const objectNumber = fieldValue(html, 'invnoField');

  return { title, artist, dateStr, year, medium, dimensions, clsList, objectNumber };
}

async function fetchDetail(objId) {
  const html = await fetchHtml(`${BASE}/en/objects/${objId}/x`);
  return parseDetail(html);
}

// ---------- image: download full-size, autocrop, upload to R2 ----------
async function dl(url) {
  for (let att = 1; att <= 4; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
      if ((r.status === 429 || r.status >= 500) && att <= 3) { await sleep(700 * att); continue; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 4000) throw new Error(`tiny ${buf.length}b`);
      return buf;
    } catch (e) { if (att === 4) throw e; await sleep(500 * att); }
  }
}
async function r2Exists(key) {
  if (!R2_READY) return false;
  try { await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key })); return true; } catch { return false; }
}
async function r2Upload(key, buffer) {
  for (let att = 1; att <= 4; att++) {
    try {
      await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buffer, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000' }));
      return true;
    } catch (e) { if (att === 4) throw e; await sleep(400 * att); }
  }
}
async function processImage(mediaId) {
  const srcUrl = `${BASE}/internal/media/dispatcher/${mediaId}/full`;
  const key = `artworks/${COLLECTION_STEM}/${mediaId}-${hash8(srcUrl)}-imageUrl.webp`;
  if (await r2Exists(key)) return { imageUrl: `${R2_PUBLIC}/${key}`, srcUrl, skipped: true };
  const src = await dl(srcUrl);
  const meta = await sharp(src, { limitInputPixels: false }).metadata().catch(() => ({}));
  if (meta.width && Math.max(meta.width, meta.height) < 600) throw new Error(`thumb ${meta.width}x${meta.height}`);
  const { buffer } = await autocropToWebp(src);
  await r2Upload(key, buffer);
  return { imageUrl: `${R2_PUBLIC}/${key}`, srcUrl, srcW: meta.width || null, srcH: meta.height || null };
}

// ---------- record assembly (min-4 guard: title/artist/year/category) ----------
function toArtwork(c, det, imageUrl, srcUrl) {
  if (!det.title || !det.artist || det.year == null || !c.category) return null;
  return {
    id: `moderna-${c.objId}`,
    objectNumber: det.objectNumber || '',
    title: det.title,
    artist: det.artist,
    date: det.dateStr || (det.year != null ? String(det.year) : ''),
    year: det.year,
    medium: det.medium || '',
    dimensions: det.dimensions || '',
    category: c.category,
    description: '',
    imageUrl,
    thumbnailUrl: `${BASE}/internal/media/dispatcher/${c.mediaId}/thumbnail`,
    onDisplay: false,
    displayLocation: '',
    sourceUrl: `${BASE}/en/objects/${c.objId}`,
    metadata: { objectId: c.objId, mediaId: c.mediaId, classifications: det.clsList },
    original_imageUrl: srcUrl || `${BASE}/internal/media/dispatcher/${c.mediaId}/full`,
  };
}

function writeCollection(artworks, stem) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'Moderna Museet',
    collection: 'Collection',
    website: 'https://www.modernamuseet.se/stockholm/en/the-collection/',
    source: 'sis.modernamuseet.se — Gallery Systems eMuseum (listing enumerate + detail-page parse, full-size dispatcher image)',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'emuseum-html',
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
  console.log(`[moderna] mode=${MODE}${LIMIT ? ` limit=${LIMIT}` : ''}${NO_UPLOAD ? ' no-upload' : ''} R2=${R2_READY ? 'ready' : 'DISABLED'}`);

  // 1) enumerate listing (pilot: stop enumerating once we have plenty from the first facet)
  const enumCap = MODE === 'pilot' ? PILOT_TARGET * 6 : Infinity;
  const candidates = await enumerateAll(enumCap);
  const withImg = candidates.filter((c) => c.mediaId);
  const noImg = candidates.length - withImg.length;
  const tally = {};
  for (const c of withImg) tally[c.facetCategory] = (tally[c.facetCategory] || 0) + 1;
  console.log(`\n[classify] enumerated ${candidates.length} unique objects | with-image ${withImg.length} | no-image ${noImg}`);
  console.log('[classify] by facet-category (with image):', tally);

  if (MODE === 'classify') {
    console.log('\n[classify] paintings collected in full; other categories value-filtered at detail stage.');
    return;
  }

  // 2) resume: load processed objIds
  const processed = new Set();
  if (MODE === 'full' && fs.existsSync(PROCESSED_FILE)) {
    for (const line of fs.readFileSync(PROCESSED_FILE, 'utf8').split('\n')) { const id = line.trim(); if (id) processed.add(id); }
    console.log(`[resume] ${processed.size} objIds already processed (will skip)`);
  }
  let work = withImg.filter((c) => !processed.has(c.objId));
  if (MODE === 'pilot') work = work.slice(0, PILOT_TARGET * 3); // over-provision; we stop once enough KEEP

  // load existing collection for full-resume checkpoint merge
  const ckptPath = path.join(REPO, 'public/data', `${COLLECTION_STEM}.json`);
  const artworks = [];
  const seen = new Set();
  if (MODE === 'full' && fs.existsSync(ckptPath)) {
    try {
      const prev = JSON.parse(fs.readFileSync(ckptPath, 'utf8')).artworks || [];
      for (const a of prev) { artworks.push(a); seen.add(String(a.metadata?.objectId)); }
      console.log(`[resume] loaded ${artworks.length} existing records from collection JSON`);
    } catch { /* fresh */ }
  }

  console.log(`\n[${MODE}] processing up to ${work.length} candidates (detail + ${NO_UPLOAD ? 'NO image' : 'image→R2'}) …`);
  let done = 0, kept = 0, imgErr = 0, dropMin4 = 0, valFilt = 0, idx = 0, stop = false;
  const target = MODE === 'pilot' ? PILOT_TARGET : Infinity;

  const writeCheckpoint = () => {
    const stem = MODE === 'pilot' ? `${COLLECTION_STEM}-pilot` : COLLECTION_STEM;
    const sorted = [...artworks].sort((x, y) => Number(x.metadata.objectId) - Number(y.metadata.objectId));
    writeCollection(sorted, stem);
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (!stop) {
      const c = work[idx++];
      if (c === undefined) return;
      if (seen.has(c.objId)) continue;
      try {
        const det = await fetchDetail(c.objId);
        if (!det) { processed.add(c.objId); fs.appendFileSync(PROCESSED_FILE, c.objId + '\n'); continue; }
        // assign final category from detail classifications (paintings win); fall back to facet category
        c.category = mapCategory(det.clsList) || c.facetCategory;
        const vr = valueReject(c.category, det);
        if (vr) { valFilt++; processed.add(c.objId); if (MODE === 'full') fs.appendFileSync(PROCESSED_FILE, c.objId + '\n'); continue; }
        // min-4 pre-check before spending an image fetch
        if (!det.title || !det.artist || det.year == null || !c.category) {
          dropMin4++; processed.add(c.objId); if (MODE === 'full') fs.appendFileSync(PROCESSED_FILE, c.objId + '\n'); continue;
        }
        let imageUrl = '', srcUrl = '';
        if (NO_UPLOAD) {
          srcUrl = `${BASE}/internal/media/dispatcher/${c.mediaId}/full`;
          imageUrl = srcUrl; // pilot parse-only: record source url so JSON validates, no R2
        } else {
          const r = await processImage(c.mediaId);
          imageUrl = r.imageUrl; srcUrl = r.srcUrl;
        }
        const w = toArtwork(c, det, imageUrl, srcUrl);
        if (w) { artworks.push(w); seen.add(c.objId); kept++; } else { dropMin4++; }
      } catch (e) {
        imgErr++;
        fs.appendFileSync(FAILED_FILE, JSON.stringify({ objId: c.objId, mediaId: c.mediaId, err: String(e.message || e) }) + '\n');
        if (imgErr <= 8) console.log(`  err obj=${c.objId}: ${e.message}`);
      }
      processed.add(c.objId);
      if (MODE === 'full') fs.appendFileSync(PROCESSED_FILE, c.objId + '\n');
      if (++done % 50 === 0) console.log(`  …${done} processed (kept ${kept}, valFilt ${valFilt}, min4-drop ${dropMin4}, err ${imgErr})`);
      if (MODE === 'full' && kept > 0 && kept % 200 === 0) writeCheckpoint();
      if (kept >= target) { stop = true; }
      if (REQ_DELAY) await sleep(REQ_DELAY);
    }
  }));

  artworks.sort((x, y) => Number(x.metadata.objectId) - Number(y.metadata.objectId));
  const stem = MODE === 'pilot' ? `${COLLECTION_STEM}-pilot` : COLLECTION_STEM;
  writeCollection(artworks, stem);

  const cov = (fn) => artworks.filter(fn).length;
  console.log(`\n[${MODE}] DONE. kept ${artworks.length} | value-filtered ${valFilt} | min4-drops ${dropMin4} | img/detail errors ${imgErr}`);
  console.log(`[${MODE}] REAL coverage on kept: title ${cov((a) => a.title && a.title !== 'Untitled')}/${artworks.length} (incl Untitled ${cov((a) => a.title)}), artist ${cov((a) => a.artist)}, year ${cov((a) => a.year != null)}, medium ${cov((a) => a.medium)}, dimensions ${cov((a) => a.dimensions)}, objectNumber ${cov((a) => a.objectNumber)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
