#!/usr/bin/env node
// National Gallery of Ireland (Dublin) — full collection scraper.
// Source: museum-OWN Gallery Systems eMuseum, https://onlinecollection.nationalgallery.ie/
//   No machine-readable API (?key=json returns HTML; IIIF paths 404). Method = HTML scrape.
//   No auth, plain GET + normal UA. robots.txt allows /objects/ (Crawl-delay 30 → we throttle).
//
// DISCOVERY: classification facet list pages give exact totals AND object links:
//   /objects/images?filter=classification%3A{Facet}&page=N   (12 objects/page; empty page = stop)
//   Facets in-scope: Paintings (~2,900), Drawings (~6,892), Prints (~3,596).  category := the facet.
//   (Detail pages carry NO clean classification field, so category comes from the facet here.)
//
// DETAIL PARSE  /objects/{id}/{slug}  (class-tagged HTML, no JSON-LD):
//   title  = <title> tag, strip " – Explore the National Gallery…" suffix (h1 absent; the
//            titleField value-span is UNRELIABLE — on drawings it echoes the artist name).
//   artist = peopleField → first <span property="name"> inside the <a> (clean; the trailing
//            <span>, Italian</span><span>, 1571-1610</span> are nationality/dates → excluded).
//   year   = displayDateField property="dateCreated" (e.g. "1602", "c.1792-1794", "1480s").
//   medium = mediumField property="artMedium" ("Oil on canvas").
//   dims   = dimensionPartsField value (nested <div><span>135.5 x 169.5 cm</span></div>).
//   objno  = invnoField value ("L.14702", "NGI.2000").
//   image  = first /internal/media/dispatcher/{mediaId}/full   (864px long edge = MAX tier).
//
// IMAGE CAVEAT (verified live): some media dispatcher IDs 500 on /full|large|preview|medium and
//   only serve thumbnail(327px)/postagestamp(109px). Those are below the value floor → we DROP
//   the record (never ingest a thumbnail). Good media: full=large=medium=864px JPEG ~58KB.
//
// SCOPE (guide Phase B): Paintings = ALL (no cap). Drawings/Prints = value-filter (skip
//   study/sketch/copy/squeeze/after-…/portrait-miniature). 3D/sculpture excluded by facet choice.
//
// RESUMABLE --full: persists scripts/.state/ngi-dublin-processed.json (set of done ids) and
//   appends each finished artwork to scripts/.state/ngi-dublin-artworks.ndjson; on restart it
//   skips processed ids and rebuilds the JSON from the NDJSON. Re-invoke to continue a long run.
//
// Usage:
//   node scripts/scrape-ngi-dublin.mjs --classify                 # discovery tally only (no detail/img)
//   node scripts/scrape-ngi-dublin.mjs --pilot --limit=20 --no-upload   # 20-record metadata pilot, no R2
//   node scripts/scrape-ngi-dublin.mjs --full                     # full resumable scrape + R2 upload

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

const SLUG = 'ngi-dublin';
const COLLECTION_STEM = `${SLUG}-collection`;
const BASE = 'https://onlinecollection.nationalgallery.ie';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const PROCESSED_PATH = path.join(STATE_DIR, `${SLUG}-processed.json`);
const ARTWORKS_NDJSON = path.join(STATE_DIR, `${SLUG}-artworks.ndjson`);
const FAILED_NDJSON = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);

// in-scope classification facets → ARMIN category. (Photographs/Sculpture intentionally omitted.)
const FACETS = [
  { facet: 'Paintings', category: 'painting' },
  { facet: 'Drawings', category: 'drawing' },
  { facet: 'Prints', category: 'print' },
];

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : args.includes('--pilot') ? 'pilot' : 'classify';
const NO_UPLOAD = args.includes('--no-upload');
const LIMIT = (() => { const a = args.find((x) => x.startsWith('--limit=')); return a ? parseInt(a.split('=')[1], 10) : null; })();
const CRAWL_MS = (() => { const a = args.find((x) => x.startsWith('--delay=')); return a ? parseInt(a.split('=')[1], 10) : 800; })();
// pilot-only knob: cap discovery to N list-pages PER FACET so a 20-record metadata pilot doesn't
// have to crawl the whole slow eMuseum (~1100 pages). IGNORED for --full (full run discovers all).
const MAX_PAGES = (() => { const a = args.find((x) => x.startsWith('--max-pages=')); return a ? parseInt(a.split('=')[1], 10) : null; })();

const s3 = (!NO_UPLOAD) ? new S3Client({
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
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16))).trim();
const stripTags = (s) => decodeEntities((s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).trim();

// ---------- fetch layer (retry) ----------
async function getHtml(url) {
  for (let att = 1; att <= 4; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html' } });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) { if (att === 4) throw e; await sleep(700 * att); }
  }
}

// ---------- discovery: object ids per facet ----------
function parseListLinks(html) {
  // href="/objects/{id}/{slug}?ctx=…&idx=…"  — strip query string, de-dupe in order.
  const out = [];
  const seen = new Set();
  const re = /href="\/objects\/(\d+)\/([^"?#]+)/g;
  let m;
  while ((m = re.exec(html))) {
    const id = m[1];
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, slug: decodeEntities(m[2]) });
  }
  return out;
}

async function discoverFacet(facet, category) {
  const items = [];
  let page = 1;
  let total = null;
  while (true) {
    const url = `${BASE}/objects/images?filter=classification%3A${encodeURIComponent(facet)}&page=${page}`;
    const html = await getHtml(url);
    await sleep(CRAWL_MS);
    if (!html) break;
    if (total == null) { const t = html.match(/\bof\s+([\d,]{2,})\b/); total = t ? parseInt(t[1].replace(/,/g, ''), 10) : null; }
    const links = parseListLinks(html);
    if (links.length === 0) break;            // empty page = clean end
    for (const l of links) items.push({ ...l, category });
    if (page % 25 === 0) console.log(`  [discover ${facet}] page ${page} → ${items.length} ids so far (of ~${total})`);
    page++;
    if (MODE !== 'full' && MAX_PAGES && page > MAX_PAGES) break;  // pilot-only discovery cap
    if (page > 5000) break;                   // hard safety bound
  }
  console.log(`[discover] ${facet}: ${items.length} object links (site reported ~${total})`);
  return { items, total };
}

async function discoverAll() {
  const all = [];
  const totals = {};
  for (const { facet, category } of FACETS) {
    const { items, total } = await discoverFacet(facet, category);
    totals[category] = { facetReported: total, linksFound: items.length };
    all.push(...items);
  }
  // de-dupe across facets (an object should appear under one classification, but be safe)
  const seen = new Set();
  const dedup = [];
  for (const it of all) { if (seen.has(it.id)) continue; seen.add(it.id); dedup.push(it); }
  return { items: dedup, totals };
}

// ---------- value filter for non-painting 2D (guide Phase B) ----------
// Paintings: keep ALL. Drawings/Prints: skip low-value studies/copies/squeezes & miniatures.
const SKIP_RE = /\b(study|studies|sketch|sketches|squeeze|estampage|copy after|copy of|after\s+[A-Z]|reproduction|tracing|fragment of|cartoon for)\b/i;
const MINIATURE_RE = /\b(portrait )?miniature\b/i;
function passesValueFilter(category, title, medium) {
  if (category === 'painting') return true;
  const hay = `${title} ${medium}`;
  if (MINIATURE_RE.test(hay)) return false;
  if (SKIP_RE.test(hay)) return false;
  return true;
}

// ---------- detail parse ----------
function fieldValue(html, fieldClass) {
  // <div|span class="detailField {fieldClass}"> … <span ... class="detailFieldValue">VALUE</span> …
  const re = new RegExp(`class="[^"]*\\b${fieldClass}\\b[^"]*"([\\s\\S]*?)(?:<div class="detailField|<span class="detailField toggleField|<div></div>)`, 'i');
  const blk = html.match(re);
  if (!blk) return '';
  const v = blk[1].match(/class="detailFieldValue"[^>]*>([\s\S]*?)<\/span>\s*<\/(?:div|span)>/i)
        || blk[1].match(/class="detailFieldValue"[^>]*>([\s\S]*?)<\/span>/i);
  return v ? stripTags(v[1]) : '';
}

function parseArtist(html) {
  const pe = html.match(/peopleField"([\s\S]*?)<\/div>/i);
  if (!pe) return '';
  // first <a …><span property="name" …>NAME</span></a>  — clean artist, no nationality/dates.
  const a = pe[1].match(/<a\b[^>]*>\s*<span property="name"[^>]*>([\s\S]*?)<\/span>/i)
        || pe[1].match(/<span property="name" itemprop="name">([\s\S]*?)<\/span>/i);
  return a ? stripTags(a[1]) : '';
}

function parseTitle(html, slug) {
  const t = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (t) {
    let title = decodeEntities(t[1]);
    // strip the site suffix variants: " – Explore the National Gallery of Ireland's collection: – National Gallery of Ireland"
    title = title.split(/\s+[–-]\s+Explore the National Gallery/i)[0].trim();
    title = title.replace(/\s+[–-]\s+National Gallery of Ireland\s*$/i, '').trim();
    if (title && !/^explore the national gallery/i.test(title)) return title;
  }
  // fallback: de-slug
  return decodeEntities((slug || '').replace(/-/g, ' ')).replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

function parseYear(dateStr) {
  if (!dateStr) return null;
  const m = dateStr.match(/(\d{3,4})/);          // first 3-4 digit run (handles "c.1792-1794","1480s","1602")
  return m ? parseInt(m[1], 10) : null;
}

function parseMediaId(html) {
  const m = html.match(/\/internal\/media\/dispatcher\/(\d+)\/full/);
  return m ? m[1] : null;
}
const mediaTierUrl = (mid, tier) => `${BASE}/internal/media/dispatcher/${mid}/${tier}`;

function parseDetail(html, item) {
  const title = parseTitle(html, item.slug);
  const artist = parseArtist(html);
  const dateStr = fieldValue(html, 'displayDateField');
  const year = parseYear(dateStr);
  const medium = fieldValue(html, 'mediumField');
  const dimensions = fieldValue(html, 'dimensionPartsField');
  const objno = fieldValue(html, 'invnoField');
  const mediaId = parseMediaId(html);
  return { id: item.id, slug: item.slug, category: item.category, title, artist, dateStr, year, medium, dimensions, objno, mediaId, sourceUrl: `${BASE}/objects/${item.id}/${item.slug}` };
}

// ---------- image: download best tier, autocrop, upload to R2 ----------
// One tier fetch (no inner retry on 500 — a 500 means that tier doesn't exist for this media).
async function fetchTier(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (r.status === 500) return null;                       // tier doesn't exist
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const ct = r.headers.get('content-type') || '';
  if (!ct.startsWith('image/')) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 3000) return null;                      // junk/placeholder
  return buf;
}

// Try /full (864px max), fall back to /preview (500px) when full 500s. Both clear the 400px
// value floor. Returns { buf, srcUrl } or throws (caller drops the record — never a thumbnail).
async function dlBest(mediaId) {
  for (const tier of ['full', 'preview']) {
    const url = mediaTierUrl(mediaId, tier);
    let buf = null;
    for (let att = 1; att <= 2; att++) {
      try { buf = await fetchTier(url); break; }
      catch (e) { if (att === 2) throw e; await sleep(500 * att); }
    }
    if (buf) return { buf, srcUrl: url };
  }
  throw new Error('no full/preview tier (media 500)');
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
  const { buf: src, srcUrl } = await dlBest(a.mediaId);   // /full → /preview fallback
  const meta = await (await import('sharp')).default(src).metadata().catch(() => ({}));
  if (meta.width && Math.max(meta.width, meta.height) < 400) throw new Error(`thumb ${meta.width}x${meta.height}`); // reject thumbnails (value floor)
  const hash8 = sha(srcUrl).slice(0, 8);                  // hash the ACTUAL source tier used
  const key = `artworks/${COLLECTION_STEM}/${a.id}-${hash8}-imageUrl.webp`;
  let imageUrl;
  if (NO_UPLOAD) {
    imageUrl = `${R2_PUBLIC}/${key}`;            // pilot: synthesize key, skip upload
  } else {
    const { buffer } = await autocropToWebp(src); // white-trim + webp(2048/q85)
    await uploadR2(key, buffer);
    imageUrl = `${R2_PUBLIC}/${key}`;
  }
  return { imageUrl, srcUrl, srcW: meta.width || null, srcH: meta.height || null };
}

// ---------- record assembly (min-4 guard) ----------
function toArtwork(a, imageUrl, srcUrl, srcW, srcH) {
  if (!a.title || !a.artist || a.year == null || !a.category) return null; // min-4 → drop
  return {
    id: a.id,
    objectNumber: a.objno || '',
    title: a.title,
    artist: a.artist,                            // kept exactly as source stores it
    date: a.dateStr || String(a.year),
    year: a.year,
    medium: a.medium || '',
    dimensions: a.dimensions || '',
    category: a.category,
    description: '',
    imageUrl,
    thumbnailUrl: srcUrl,
    onDisplay: false,
    displayLocation: '',
    sourceUrl: a.sourceUrl,
    metadata: { emuseum_id: a.id, slug: a.slug, src_w: srcW || null, src_h: srcH || null },
    original_imageUrl: srcUrl,
  };
}

// ---------- state (resumable) ----------
function loadProcessed() {
  try { return new Set(JSON.parse(fs.readFileSync(PROCESSED_PATH, 'utf8'))); } catch { return new Set(); }
}
function saveProcessed(set) { fs.writeFileSync(PROCESSED_PATH, JSON.stringify([...set])); }
function loadNdjsonArtworks() {
  if (!fs.existsSync(ARTWORKS_NDJSON)) return [];
  const out = [];
  for (const line of fs.readFileSync(ARTWORKS_NDJSON, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch {}
  }
  return out;
}

function writeCollection(artworks, stem) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'National Gallery of Ireland',
    collection: 'Collection',
    website: 'https://onlinecollection.nationalgallery.ie/',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'html',
    category_breakdown: cats,
    artworks,
  };
  const out = path.join(REPO, 'public/data', `${stem}.json`);
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
  console.log(`[write] ${out} (${artworks.length} works) breakdown=`, cats);
  return out;
}

// ---------- worker: fetch detail, filter, image, append ----------
async function handleItem(item, processed, appendFn) {
  const html = await getHtml(`${BASE}/objects/${item.id}/${item.slug}`);
  await sleep(CRAWL_MS);
  if (!html) { processed.add(item.id); return { status: 'no-page' }; }
  const a = parseDetail(html, item);
  if (!passesValueFilter(a.category, a.title, a.medium)) { processed.add(item.id); return { status: 'filtered' }; }
  if (!a.title || !a.artist || a.year == null) { processed.add(item.id); return { status: 'min4-drop' }; }
  if (!a.mediaId) { processed.add(item.id); return { status: 'no-image' }; }
  try {
    const { imageUrl, srcUrl, srcW, srcH } = await processImage(a);
    const w = toArtwork(a, imageUrl, srcUrl, srcW, srcH);
    processed.add(item.id);
    if (!w) return { status: 'min4-drop' };
    appendFn(w);
    return { status: 'ok', artwork: w };
  } catch (e) {
    fs.appendFileSync(FAILED_NDJSON, JSON.stringify({ id: item.id, mediaId: a.mediaId, url: a.mediaId ? mediaTierUrl(a.mediaId, 'full') : null, err: String(e.message || e) }) + '\n');
    processed.add(item.id);
    return { status: 'img-err', err: String(e.message || e) };
  }
}

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  console.log(`[ngi-dublin] mode=${MODE} no-upload=${NO_UPLOAD} limit=${LIMIT ?? '∞'} delay=${CRAWL_MS}ms`);

  const { items, totals } = await discoverAll();
  console.log('\n[discover] facet totals:', JSON.stringify(totals));
  console.log(`[discover] unique in-scope objects = ${items.length}`);

  if (MODE === 'classify') {
    const byCat = {};
    for (const it of items) byCat[it.category] = (byCat[it.category] || 0) + 1;
    console.log('\n[classify] in-scope by category:', byCat);
    console.log('[classify] NOTE category comes from the classification facet (reliable);');
    console.log('[classify] paintings kept ALL; drawings/prints value-filtered at detail stage (study/sketch/copy/after/miniature).');
    return;
  }

  // pilot / full
  const processed = MODE === 'full' ? loadProcessed() : new Set();
  let queue = items.filter((it) => !processed.has(it.id));
  if (MODE === 'pilot') {
    // pilot: don't restrict to one facet — sample across paintings+drawings+prints for parser coverage.
    const want = LIMIT || 20;
    const perCat = Math.ceil(want / FACETS.length);
    const picks = [];
    for (const { category } of FACETS) picks.push(...items.filter((i) => i.category === category).slice(0, perCat));
    queue = picks.slice(0, want);
  }
  console.log(`\n[${MODE}] queue = ${queue.length} (already processed ${processed.size})`);

  const collected = MODE === 'full' ? loadNdjsonArtworks() : [];
  const collectedIds = new Set(collected.map((w) => w.id));
  const appendFn = (w) => {
    if (collectedIds.has(w.id)) return;
    collectedIds.add(w.id);
    collected.push(w);
    if (MODE === 'full') fs.appendFileSync(ARTWORKS_NDJSON, JSON.stringify(w) + '\n');
  };

  const stats = { ok: 0, filtered: 0, min4: 0, noImg: 0, noPage: 0, imgErr: 0 };
  let done = 0;
  const limitN = MODE === 'pilot' ? (LIMIT || 20) : Infinity;

  // modest concurrency; respects crawl-delay via per-fetch sleeps inside handleItem.
  const CONC = MODE === 'pilot' ? 2 : 3;
  let idx = 0;
  let stop = false;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (idx < queue.length && !stop) {
      const item = queue[idx++];
      const r = await handleItem(item, processed, appendFn);
      if (r.status === 'ok') stats.ok++;
      else if (r.status === 'filtered') stats.filtered++;
      else if (r.status === 'min4-drop') stats.min4++;
      else if (r.status === 'no-image') stats.noImg++;
      else if (r.status === 'no-page') stats.noPage++;
      else if (r.status === 'img-err') stats.imgErr++;
      if (++done % 50 === 0) {
        if (MODE === 'full') saveProcessed(processed);
        console.log(`  …${done}/${queue.length} | ok ${stats.ok} filtered ${stats.filtered} min4 ${stats.min4} noImg ${stats.noImg} imgErr ${stats.imgErr}`);
      }
      if (collected.length >= limitN) { stop = true; }
    }
  }));

  if (MODE === 'full') saveProcessed(processed);
  collected.sort((x, y) => Number(x.id) - Number(y.id));
  const stem = MODE === 'pilot' ? `${COLLECTION_STEM}-pilot` : COLLECTION_STEM;
  writeCollection(collected, stem);
  console.log(`\n[${MODE}] DONE. collected ${collected.length} | stats=`, stats);
  console.log(`[${MODE}] discovered in-scope = ${items.length} (paintings kept all; drawings/prints value-filtered)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
