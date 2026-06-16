#!/usr/bin/env node
// Poster House (New York) — full poster-collection scraper.
//
// Source: museum-OWN infrastructure, two layers (no auth):
//   1) ENUMERATION — WordPress REST custom post type `poster` on the collection subdomain:
//        GET https://collection.posterhouse.org/wp-json/wp/v2/poster?per_page=100&page=P&_fields=id,slug,link
//      Returns id + slug + permalink for all 7,573 posters (X-WP-Total). The `acf`/`content`
//      fields come back EMPTY over REST, so metadata is NOT here — only the object list.
//   2) DETAIL — each poster's server-rendered HTML page (theme `posterhouse-emuseum`,
//        template single-poster.php) carries the full metadata + the image URL:
//        .poster-title                              → title
//        first .p-style after the title             → date  ("1986")
//        .about-item.designer .p-style              → designer (artist)
//        .about-item.dimension .p-style             → dimensions
//        OBJECT NUMBER row                          → objectNumber ("PH.2026.158")
//        COUNTRY OF ORIGIN / CREDIT LINE / KEYWORDS → extra metadata
//        <img class="main-image" src=…emuseum…>     → full image
//      The full image lives on the museum's own eMuseum host:
//        https://posterhouse.emuseum.com/internal/media/dispatcher/{mediaId}/full?key={hex}
//      (verified 566×800 JPEG — well over the 600px long-edge floor; eMuseum serves the
//       single largest derivative at /full).
//
// SCOPE: the entire collection is posters → flat works, all in-scope. category = "poster"
//   (the app treats "poster" as a 2D class). Posters are NEVER colour-gated (scope rule),
//   so there is no grayscale curation step here.
//
// min-4 guard: title, artist(=designer), year, category must be non-empty. Anonymous /
//   undated posters drop (we never fill "Unknown"); this also satisfies the brief's
//   "prioritize named-designer/dated" directive for the >7k corpus.
//
// Usage:
//   node scripts/scrape-poster-house.mjs --probe   # ~15 works end-to-end (+R2), writes *-probe.json
//   node scripts/scrape-poster-house.mjs --full     # all in-scope, resumable (+R2), writes collection JSON
//
// Resume state: scripts/.state/poster-house-progress.json   (set of completed wp ids)
// Failures:     scripts/.state/poster-house-failed.ndjson

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

const SLUG = 'poster-house';
const COLLECTION_STEM = `${SLUG}-collection`;
const BASE = 'https://collection.posterhouse.org';
const LIST_API = `${BASE}/wp-json/wp/v2/poster`;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const PROGRESS_FILE = path.join(STATE_DIR, `${SLUG}-progress.json`);
const FAILED_FILE = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);
const JSON_CAP_BYTES = 24 * 1024 * 1024; // brief: keep JSON < 24MB

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : 'probe';
const PROBE_TARGET = 15;
const PER_PAGE = 100;
const FULL_CONC = 5;     // concurrent detail-page+image workers (full mode); gentle on the museum host

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function decodeEntities(s) {
  return (s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#8217;/g, '’')
    .replace(/&#8216;/g, '‘').replace(/&#8211;/g, '–').replace(/&#8212;/g, '—')
    .replace(/&hellip;/g, '…').replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .trim();
}
const stripTags = (s) => decodeEntities((s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// ---------- layer 1: enumerate all poster permalinks via WP REST ----------
async function fetchList(perPage, page) {
  const url = `${LIST_API}?per_page=${perPage}&page=${page}&_fields=id,slug,link`;
  for (let att = 1; att <= 4; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (r.status === 400) return { done: true };          // page past the end
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const total = parseInt(r.headers.get('x-wp-total') || '0', 10);
      const data = await r.json();
      return { data, total };
    } catch (e) { if (att === 4) throw e; await sleep(600 * att); }
  }
}

async function enumerateAll() {
  const first = await fetchList(PER_PAGE, 1);
  const total = first.total || 0;
  const pages = Math.ceil(total / PER_PAGE);
  console.log(`[enum] X-WP-Total = ${total} → ${pages} pages of ${PER_PAGE}`);
  const all = [...first.data];
  for (let p = 2; p <= pages; p++) {
    const res = await fetchList(PER_PAGE, p);
    if (res.done) break;
    all.push(...res.data);
    if (p % 10 === 0) console.log(`  …enumerated ${all.length}/${total}`);
    await sleep(250);
  }
  console.log(`[enum] collected ${all.length} poster permalinks`);
  return { items: all, total };
}

// ---------- layer 2: fetch + parse a poster detail page ----------
async function fetchHtml(url) {
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) { if (att === 3) throw e; await sleep(500 * att); }
  }
}

// year from a free-text date string ("1986", "c. 1925", "1968–1972", "ca. 1900")
function parseYear(dateStr) {
  const m = (dateStr || '').match(/\d{4}/);
  return m ? parseInt(m[0], 10) : null;
}

// Parse the .about-item rows. Each row is
//   <div class="about-item {KIND} flex-container"><span>{LABEL}</span><div class="p-style">{VALUE}</div></div>
// We index BOTH ways: by the row's CSS kind (designer/dimension/…) AND by the visible LABEL.
// The kind is authoritative for designer/dimension — the visible label flips between
// "Designer" and "Artist" for the SAME `designer` row, so label-only lookup loses ~70% of
// attributions. Other rows (OBJECT NUMBER / COUNTRY OF ORIGIN / CREDIT LINE / KEYWORDS) share a
// generic class, so those are read by label.
function parseAboutItems(src) {
  const byKind = {}, byLabel = {};
  const re = /<div class="about-item\s+([a-z0-9-]+)[^"]*"[^>]*>\s*<span[^>]*>(.*?)<\/span>\s*<div class="p-style">(.*?)<\/div>/gs;
  let m;
  while ((m = re.exec(src))) {
    const kind = m[1].trim();
    const label = stripTags(m[2]).toUpperCase();
    const value = stripTags(m[3]);
    if (kind && byKind[kind] === undefined) byKind[kind] = value;
    if (label) byLabel[label] = value;
  }
  return { byKind, byLabel };
}

// Returns a parsed-record object (pre-image) or null if the page is unparseable.
function parseDetail(src, listItem) {
  const titleM = src.match(/<div class="poster-title[^"]*">(.*?)<\/div>/s);
  const title = titleM ? stripTags(titleM[1]) : '';

  // date = first .p-style sitting between the title and the about-container
  let dateStr = '';
  const mid = src.match(/<div class="poster-title[^"]*">.*?<\/div>(.*?)<div class="about-container">/s);
  if (mid) {
    const dm = mid[1].match(/<div class="p-style">(.*?)<\/div>/s);
    if (dm) dateStr = stripTags(dm[1]);
  }

  const { byKind, byLabel } = parseAboutItems(src);
  // a field can be wrapped in a PHP warning when the theme var is undefined → treat as empty
  const clean = (v) => (v && !/Warning\s*:|Undefined|Array to string/i.test(v) && v !== '-') ? v : '';
  const designer = clean(byKind['designer'] || byLabel['DESIGNER'] || byLabel['ARTIST']);
  const dimensions = clean(byKind['dimension'] || byLabel['DIMENSIONS']);
  const objectNumber = clean(byLabel['OBJECT NUMBER']);
  const country = clean(byLabel['COUNTRY OF ORIGIN']);
  const credit = clean(byLabel['CREDIT LINE']);
  const keywords = clean(byLabel['KEYWORDS']);

  // full image (eMuseum dispatcher). class="main-image" is authoritative; fall back to any dispatcher /full.
  let imgUrl = null;
  const mainM = src.match(/<img\s+src="(https:\/\/[a-z0-9.-]*emuseum[a-z0-9.-]*\/internal\/media\/dispatcher\/\d+\/full\?key=[a-f0-9]+)"[^>]*class="main-image"/i)
    || src.match(/<img[^>]*class="main-image"[^>]*src="(https:\/\/[a-z0-9.-]*emuseum[a-z0-9.-]*\/internal\/media\/dispatcher\/\d+\/full\?key=[a-f0-9]+)"/i)
    || src.match(/(https:\/\/[a-z0-9.-]*emuseum[a-z0-9.-]*\/internal\/media\/dispatcher\/\d+\/full\?key=[a-f0-9]+)/i);
  if (mainM) imgUrl = decodeEntities(mainM[1]);

  // alt text → description (drop the trailing " Image" the theme appends)
  let description = '';
  const altM = src.match(/<img\s+src="https:\/\/[a-z0-9.-]*emuseum[^"]+"\s+alt="([^"]*)"/i);
  if (altM) description = decodeEntities(altM[1]).replace(/\s*Image\s*$/i, '').trim();

  return {
    id: String(listItem.id),
    slug: listItem.slug,
    title,
    artist: designer,
    dateStr,
    year: parseYear(dateStr),
    medium: '',                 // Poster House detail page exposes no medium/technique field
    dimensions,
    objectNumber,
    country,
    credit,
    keywords,
    description,
    imgUrl,
    sourceUrl: listItem.link,
  };
}

// ---------- image: download full-size, size-gate, autocrop, upload to R2 ----------
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
  const meta = await (await import('sharp')).default(src).metadata().catch(() => ({}));
  if (meta.width && Math.max(meta.width, meta.height) < 600) throw new Error(`thumb ${meta.width}x${meta.height}`);
  const { buffer } = await autocropToWebp(src);            // white-trim + webp(2048/q85)
  const hash8 = sha(a.imgUrl).slice(0, 8);
  const key = `artworks/${COLLECTION_STEM}/${a.id}-${hash8}-imageUrl.webp`;
  await uploadR2(key, buffer);
  return { imageUrl: `${R2_PUBLIC}/${key}`, srcW: meta.width || null, srcH: meta.height || null };
}

// ---------- record assembly (min-4 guard) ----------
function toArtwork(a, imageUrl) {
  if (!a.title || !a.artist || a.year == null) return null; // category is constant "poster"
  return {
    id: `${SLUG}-${a.id}`,
    objectNumber: a.objectNumber || '',
    title: a.title,
    artist: a.artist,
    date: a.dateStr || String(a.year),
    year: a.year,
    medium: a.medium || '',
    dimensions: a.dimensions || '',
    category: 'poster',
    description: a.description || '',
    imageUrl,
    thumbnailUrl: a.imgUrl,
    onDisplay: false,
    displayLocation: '',
    sourceUrl: a.sourceUrl,
    metadata: {
      wp_id: a.id,
      wp_slug: a.slug,
      country: a.country || '',
      credit_line: a.credit || '',
      keywords: a.keywords || '',
    },
    original_imageUrl: a.imgUrl,
  };
}

function writeCollection(artworks, stem, totalCount) {
  artworks.sort((x, y) => Number(x.metadata.wp_id) - Number(y.metadata.wp_id));
  const payload = {
    museum: 'Poster House',
    collection: 'Permanent Collection',
    website: 'https://collection.posterhouse.org/',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'api+html',
    artworks,
  };
  const out = path.join(REPO, 'public/data', `${stem}.json`);
  let str = JSON.stringify(payload, null, 2);
  if (Buffer.byteLength(str) > JSON_CAP_BYTES) {
    // brief: cap JSON < 24MB — keep the named-designer/dated head, drop the tail (still sorted).
    let lo = 0, hi = artworks.length;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      const trial = { ...payload, total_count: mid, artworks: artworks.slice(0, mid) };
      if (Buffer.byteLength(JSON.stringify(trial, null, 2)) > JSON_CAP_BYTES) hi = mid; else lo = mid + 1;
    }
    const keep = lo - 1;
    payload.artworks = artworks.slice(0, keep);
    payload.total_count = keep;
    payload.capped = { kept: keep, of: artworks.length, reason: '24MB cap' };
    str = JSON.stringify(payload, null, 2);
    console.log(`[write] CAP hit → kept ${keep}/${artworks.length} to stay < 24MB`);
  }
  fs.writeFileSync(out, str);
  console.log(`[write] ${out} (${payload.total_count} works, ${(Buffer.byteLength(str) / 1048576).toFixed(1)}MB) of ${totalCount} enumerated`);
  return out;
}

// ---------- progress (resume) ----------
function loadProgress() {
  try { return new Set(JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'))); } catch { return new Set(); }
}
function saveProgress(set) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify([...set]));
}
function logFail(id, stage, err, extra = {}) {
  fs.appendFileSync(FAILED_FILE, JSON.stringify({ id, stage, err: String(err && err.message || err), ...extra }) + '\n');
}

// run an async worker pool over `items`
async function pool(items, conc, worker) {
  let idx = 0;
  await Promise.all(Array.from({ length: conc }, async () => {
    while (idx < items.length) { const i = idx++; await worker(items[i], i); }
  }));
}

// ---------- PROBE ----------
async function runProbe() {
  console.log(`[probe] target ${PROBE_TARGET} posters end-to-end`);
  const first = await fetchList(PER_PAGE, 1);
  console.log(`[probe] X-WP-Total = ${first.total}`);
  const sample = first.data.slice(0, PROBE_TARGET);

  const artworks = [];
  let parsed = 0, noImg = 0, dropMin4 = 0, imgErr = 0, thumb = 0;
  for (const li of sample) {
    let det;
    try {
      const html = await fetchHtml(li.link);
      det = parseDetail(html, li);
      parsed++;
    } catch (e) { console.log(`  [html err] ${li.slug}: ${e.message}`); continue; }
    console.log(`  • ${det.id} "${det.title.slice(0, 40)}" | ${det.artist || '(no designer)'} | ${det.dateStr || '(no date)'} | ${det.dimensions || '-'} | img=${det.imgUrl ? 'yes' : 'NO'}`);
    if (!det.imgUrl) { noImg++; continue; }
    try {
      const { imageUrl, srcW, srcH } = await processImage(det);
      const w = toArtwork(det, imageUrl);
      if (w) { artworks.push(w); console.log(`      ↳ R2 ok (${srcW}x${srcH})`); }
      else { dropMin4++; console.log(`      ↳ DROP (min-4: title/artist/year)`); }
    } catch (e) {
      if (/thumb/.test(e.message)) thumb++; else imgErr++;
      console.log(`      ↳ img err: ${e.message}`);
    }
    await sleep(300);
  }
  writeCollection(artworks, `${COLLECTION_STEM}-probe`, sample.length);
  console.log(`\n[probe] parsed ${parsed}/${sample.length} | built ${artworks.length} | noImg ${noImg} | min4-drop ${dropMin4} | thumb ${thumb} | imgErr ${imgErr}`);
  if (artworks.length === 0) { console.error('[probe] FAIL — zero artworks built'); process.exit(1); }
  console.log('[probe] PASS');
}

// ---------- FULL ----------
async function runFull() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const { items, total } = await enumerateAll();
  const done = loadProgress();
  const existing = readExisting();        // resume: keep already-built artworks
  const artworks = [...existing];
  console.log(`[full] resume: ${done.size} ids already processed, ${existing.length} artworks on disk`);

  const todo = items.filter((li) => !done.has(String(li.id)));
  console.log(`[full] ${todo.length} posters to fetch (of ${items.length})`);

  let built = 0, noImg = 0, dropMin4 = 0, imgErr = 0, htmlErr = 0, n = 0;
  let lastSave = Date.now();

  await pool(todo, FULL_CONC, async (li) => {
    let det;
    try { det = parseDetail(await fetchHtml(li.link), li); }
    catch (e) { htmlErr++; logFail(li.id, 'html', e, { url: li.link }); markDone(done, li.id); return; }

    if (!det.imgUrl) { noImg++; logFail(li.id, 'no-image', 'no emuseum dispatcher url', { url: li.link }); markDone(done, li.id); return; }
    // pre-check min-4 before paying for the image
    if (!det.title || !det.artist || det.year == null) { dropMin4++; markDone(done, li.id); return; }

    try {
      const { imageUrl } = await processImage(det);
      const w = toArtwork(det, imageUrl);
      if (w) { artworks.push(w); built++; } else { dropMin4++; }
    } catch (e) { imgErr++; logFail(li.id, 'image', e, { img: det.imgUrl }); }
    markDone(done, li.id);

    if (++n % 50 === 0) console.log(`  …${n}/${todo.length} (built ${built}, noImg ${noImg}, drop ${dropMin4}, imgErr ${imgErr}, htmlErr ${htmlErr})`);
    if (Date.now() - lastSave > 30000) { saveProgress(done); checkpoint(artworks, total); lastSave = Date.now(); }
  });

  saveProgress(done);
  writeCollection(artworks, COLLECTION_STEM, total);
  console.log(`\n[full] DONE. built ${artworks.length} | noImg ${noImg} | min4-drop ${dropMin4} | imgErr ${imgErr} | htmlErr ${htmlErr}`);
}

function markDone(set, id) { set.add(String(id)); }
function readExisting() {
  try {
    const p = path.join(REPO, 'public/data', `${COLLECTION_STEM}.json`);
    return JSON.parse(fs.readFileSync(p, 'utf8')).artworks || [];
  } catch { return []; }
}
function checkpoint(artworks, total) {
  try { writeCollection([...artworks], COLLECTION_STEM, total); } catch (e) { console.log('  [checkpoint warn]', e.message); }
}

// ---------- main ----------
(async () => {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  if (MODE === 'probe') await runProbe();
  else await runFull();
})().catch((e) => { console.error(e); process.exit(1); });
