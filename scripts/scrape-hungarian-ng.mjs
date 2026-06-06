#!/usr/bin/env node
// Hungarian National Gallery / Magyar Nemzeti Galéria (Budapest) — full collection scraper.
// Source: museum-OWN WordPress site en.mng.hu (Bedrock/Sage "szepmu" theme), behind Cloudflare.
//   The `artwork` custom-post-type is NOT on the WP REST API (locked by iThemes Security: 401/404).
//   It IS exposed via the front-end admin-ajax filter + server-rendered detail pages. No auth/nonce.
//   Cloudflare 403s a default UA → we send a normal Safari UA (verified Phase A live).
//
// TWO-STAGE (verified Phase A live):
//   1) ENUMERATE in-scope object ids per artwork_type via admin-ajax `post_filter`:
//        POST https://en.mng.hu/wp/wp-admin/admin-ajax.php  (Referer https://en.mng.hu/artworks/)
//        action=post_filter & post_type=artwork & load_type=button & list_mode=grid &
//        filter_object[artwork_type][]={typeSlug} &
//        filter_object[per_page]=20 & filter_object[offset]=N*20 & filter_object[current_page]=N+1
//      → rendered HTML grid (20 cards/page, each <a href="/artworks/{id}/">) + the response carries
//        data-results-number="{total}" and data-max-pages="{pages}". Pagination lives INSIDE
//        filter_object (offset/current_page); the top-level current_post field is ignored (the JS
//        bundle's loadMorePosts/paginationPosts bump filter_object.offset/.current_page — confirmed
//        in assets/js/dest/bundle.js). We stop at data-max-pages. CATEGORY := the type slug (reliable;
//        no guessing). EXACT in-scope counts (live): painting 9369, drawing 3857, print 832,
//        photograph 1013, collage 13 → 15,084. OUT of scope: sculpture 3034, medal 3122.
//   2) PARSE each detail page https://en.mng.hu/artworks/{id}/ (147KB server-rendered HTML):
//        metadata table  <tr><th>LABEL</th><td>VALUE</td></tr>:
//          Date            → date string ("mid-19th century", "1873", "ca. 1950–1970")
//          Object type     → (sanity-cross-check vs enumerated category)
//          Medium, technique → medium ("oil on canvas")
//          Dimensions      → dims ("52.5 x 44.7 cm")
//          Inventory number → objectNumber ("31.B")
//        artist  = <p class="author"><span class="author__name"><a>NAME</a></span>  (clean name;
//                  the sibling <span class="author__bio">city, 1803 – city, 1887</span> dates are EXCLUDED)
//        title   = og:title / <title>, strip the " - Hungarian National Gallery" suffix
//        image   = og:image (full-res, e.g. .../233398.jpg → 1028x1200; verified NOT a thumbnail).
//                  og:image filename = accession number.
//
// SCOPE (guide Phase B): painting = ALL (no cap). drawing/print/photograph/collage = value-filter
//   (skip study/sketch/copy after/squeeze/fragment). Portrait miniatures → run remove-miniatures at
//   registration. Sculpture/medal/3D excluded by not enumerating those type slugs.
//
// EN-metadata caveat (probe): a few EN detail pages leave Medium/Inventory blank even when
//   Object type+Dimensions+Artist+Date are present. min-4 (title/artist/year/category) still holds;
//   medium/dimensions may be "" on those records (HU site carries Technika but we use the museum's
//   own EN site for consistency — still museum-OWN, no aggregator).
//
// RESUMABLE --full: persists scripts/.state/hungarian-ng-processed.json (done ids) + appends each
//   finished artwork to scripts/.state/hungarian-ng-artworks.ndjson; on restart it skips processed
//   ids and rebuilds the JSON from the NDJSON. Re-invoke to continue a long run (~15k details).
//
// Usage:
//   node scripts/scrape-hungarian-ng.mjs --classify                  # enumerate ids per type → scope tally (no detail/img)
//   node scripts/scrape-hungarian-ng.mjs --pilot --limit=20 --no-upload   # ~20-record metadata pilot, no R2
//   node scripts/scrape-hungarian-ng.mjs --full                      # full resumable scrape + R2 upload

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

const SLUG = 'hungarian-ng';
const COLLECTION_STEM = `${SLUG}-collection`;
const BASE = 'https://en.mng.hu';
const AJAX = `${BASE}/wp/wp-admin/admin-ajax.php`;
const DETAIL = (id) => `${BASE}/artworks/${id}/`;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const PROCESSED_PATH = path.join(STATE_DIR, `${SLUG}-processed.json`);
const ARTWORKS_NDJSON = path.join(STATE_DIR, `${SLUG}-artworks.ndjson`);
const FAILED_NDJSON = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);

// in-scope artwork_type slugs → ARMIN category. Sculpture/medal intentionally omitted (3D).
const TYPES = [
  { slug: 'painting', category: 'painting' },
  { slug: 'drawing', category: 'drawing' },
  { slug: 'print', category: 'print' },
  { slug: 'photograph', category: 'photograph' },
  { slug: 'collage', category: 'mixed_media_2d' },
];
const PER_PAGE = 20;

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : args.includes('--pilot') ? 'pilot' : 'classify';
const NO_UPLOAD = args.includes('--no-upload');
const LIMIT = (() => { const a = args.find((x) => x.startsWith('--limit=')); return a ? parseInt(a.split('=')[1], 10) : null; })();
const CRAWL_MS = (() => { const a = args.find((x) => x.startsWith('--delay=')); return a ? parseInt(a.split('=')[1], 10) : 800; })();
// pilot-only knob: cap enumeration to N grid-pages PER TYPE so a 20-record pilot doesn't crawl all
// 469 painting pages. IGNORED for --full (full run enumerates every page up to data-max-pages).
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
      if (r.status === 301 || r.status === 302) return null; // sparse id space → dead/redirected slot, skip
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) { if (att === 4) throw e; await sleep(700 * att); }
  }
}

// admin-ajax post_filter for one type+page → rendered grid HTML (or throws after retries).
async function postFilter(typeSlug, pageIdx /* 0-based */) {
  const body = new URLSearchParams();
  body.append('action', 'post_filter');
  body.append('post_type', 'artwork');
  body.append('load_type', 'button');
  body.append('current_post', '0');
  body.append('list_mode', 'grid');
  body.append('filter_object[artwork_type][]', typeSlug);
  body.append('filter_object[per_page]', String(PER_PAGE));
  body.append('filter_object[offset]', String(pageIdx * PER_PAGE));
  body.append('filter_object[current_page]', String(pageIdx + 1));
  for (let att = 1; att <= 4; att++) {
    try {
      const r = await fetch(AJAX, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Referer': `${BASE}/artworks/`, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
        body: body.toString(),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) { if (att === 4) throw e; await sleep(700 * att); }
  }
}

// ---------- enumeration (ids + category per type) ----------
function parseGridIds(html) {
  // <a ... href="/artworks/{id}/"> — collect unique numeric ids in document order.
  const out = [];
  const seen = new Set();
  const re = /\/artworks\/(\d+)\//g;
  let m;
  while ((m = re.exec(html))) { const id = m[1]; if (!seen.has(id)) { seen.add(id); out.push(id); } }
  return out;
}
const readResultsNumber = (html) => { const m = html.match(/data-results-number="(\d+)"/); return m ? parseInt(m[1], 10) : null; };
const readMaxPages = (html) => { const m = html.match(/data-max-pages="(\d+)"/); return m ? parseInt(m[1], 10) : null; };

async function enumerateType(typeSlug, category) {
  const ids = [];
  const seen = new Set();
  let pageIdx = 0;
  let reported = null, maxPages = null;
  while (true) {
    const html = await postFilter(typeSlug, pageIdx);
    await sleep(CRAWL_MS);
    if (reported == null) { reported = readResultsNumber(html); maxPages = readMaxPages(html); }
    const pageIds = parseGridIds(html);
    if (pageIds.length === 0) break;                 // empty page = clean end
    let added = 0;
    for (const id of pageIds) if (!seen.has(id)) { seen.add(id); ids.push({ id, category, typeSlug }); added++; }
    if ((pageIdx + 1) % 25 === 0) console.log(`  [enum ${typeSlug}] page ${pageIdx + 1}/${maxPages ?? '?'} → ${ids.length} ids (site reports ${reported})`);
    pageIdx++;
    if (maxPages && pageIdx >= maxPages) break;       // reached last page
    if (MODE !== 'full' && MAX_PAGES && pageIdx >= MAX_PAGES) break; // pilot-only enumeration cap
    if (pageIdx > 6000) break;                        // hard safety bound
  }
  console.log(`[enum] ${typeSlug}: ${ids.length} ids (site reported ${reported}, ${maxPages} pages)`);
  return { ids, reported };
}

async function enumerateAll() {
  const all = [];
  const totals = {};
  for (const { slug, category } of TYPES) {
    const { ids, reported } = await enumerateType(slug, category);
    totals[slug] = { category, reported, found: ids.length };
    all.push(...ids);
  }
  // de-dupe across types (an object should carry one artwork_type, but be safe — keep first seen).
  const seen = new Set();
  const dedup = [];
  for (const it of all) { if (seen.has(it.id)) continue; seen.add(it.id); dedup.push(it); }
  return { items: dedup, totals };
}

// ---------- value filter for non-painting 2D (guide Phase B) ----------
// Paintings: keep ALL. Others: skip low-value studies/copies/squeezes/fragments. (Miniatures are
// handled post-scrape by remove-miniatures.mjs at registration.)
const SKIP_RE = /\b(study|studies|sketch|sketches|squeeze|estampage|copy after|copy of|after\s+[A-Z]|reproduction|tracing|fragment of|cartoon for)\b/i;
function passesValueFilter(category, title, medium) {
  if (category === 'painting') return true;
  const hay = `${title} ${medium}`;
  if (SKIP_RE.test(hay)) return false;
  return true;
}

// ---------- detail parse ----------
// metadata table row: <tr> <th>LABEL</th> <td>VALUE</td> </tr>  (non-greedy, label-exact)
function tableValue(html, label) {
  const re = new RegExp(`<th>\\s*${label.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*</th>\\s*<td>([\\s\\S]*?)</td>`, 'i');
  const m = html.match(re);
  return m ? stripTags(m[1]) : '';
}

function parseArtist(html) {
  // <p class="author"> <span class="author__name"> <a ...>NAME</a> </span> <span class="author__bio">dates</span>
  // Take ALL author__name spans (multi-artist works repeat the block); EXCLUDE author__bio dates.
  const td = html.match(/<th>\s*Artist\s*<\/th>\s*<td>([\s\S]*?)<\/td>/i);
  const scope = td ? td[1] : html;
  const names = [];
  const re = /class="author__name"[^>]*>([\s\S]*?)<\/span>/gi;
  let m;
  while ((m = re.exec(scope))) { const n = stripTags(m[1]); if (n) names.push(n); }
  return [...new Set(names)].join('; ');
}

function parseTitle(html, id) {
  // Prefer og:title (clean, single line), strip the museum suffix. Fall back to <title>.
  let raw = '';
  const og = html.match(/property="og:title"\s+content="([^"]*)"/i);
  if (og) raw = decodeEntities(og[1]);
  if (!raw) { const t = html.match(/<title>([\s\S]*?)<\/title>/i); if (t) raw = decodeEntities(t[1]); }
  if (!raw) return '';
  // suffix appears as " - Hungarian National Gallery" (og) or " – Hungarian National Gallery" (<title>)
  raw = raw.replace(/\s*[–-]\s*Hungarian National Gallery\s*$/i, '').trim();
  return raw;
}

function parseYear(dateStr) {
  if (!dateStr) return null;
  const m = dateStr.match(/(\d{3,4})/);   // first 3-4 digit run ("ca. 1950–1970"→1950, "1873", "mid-19th"→null)
  return m ? parseInt(m[1], 10) : null;
}

function parseImage(html) {
  const og = html.match(/property="og:image"\s+content="([^"]*)"/i);
  let url = og ? decodeEntities(og[1]) : null;
  if (url && /placeholder|default|no-image|logo/i.test(url)) url = null; // guard against placeholder slots
  return url;
}

function parseDetail(html, item) {
  const title = parseTitle(html, item.id);
  const artist = parseArtist(html);
  const dateStr = tableValue(html, 'Date');
  const year = parseYear(dateStr);
  const medium = tableValue(html, 'Medium, technique');
  const dimensions = tableValue(html, 'Dimensions');
  const objno = tableValue(html, 'Inventory number');
  const imgUrl = parseImage(html);
  return { id: item.id, category: item.category, title, artist, dateStr, year, medium, dimensions, objno, imgUrl, sourceUrl: DETAIL(item.id) };
}

// ---------- image: download full-size og:image, autocrop, upload to R2 ----------
async function dl(url) {
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const ct = r.headers.get('content-type') || '';
      if (!ct.startsWith('image/')) throw new Error(`not-image ${ct}`);
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
  const src = await dl(a.imgUrl);                       // full-size jpeg from museum CDN (og:image)
  const meta = await (await import('sharp')).default(src).metadata().catch(() => ({}));
  if (meta.width && Math.max(meta.width, meta.height) < 600) throw new Error(`thumb ${meta.width}x${meta.height}`); // reject thumbnails
  const hash8 = sha(a.imgUrl).slice(0, 8);
  const key = `artworks/${COLLECTION_STEM}/${a.id}-${hash8}-imageUrl.webp`;
  let imageUrl;
  if (NO_UPLOAD) {
    imageUrl = `${R2_PUBLIC}/${key}`;                   // pilot: synthesize key, skip upload
  } else {
    const { buffer } = await autocropToWebp(src);       // pure webp(2048/q85) re-encode (trim OFF by default)
    await uploadR2(key, buffer);
    imageUrl = `${R2_PUBLIC}/${key}`;
  }
  return { imageUrl, srcW: meta.width || null, srcH: meta.height || null };
}

// ---------- record assembly (min-4 guard) ----------
function toArtwork(a, imageUrl, srcW, srcH) {
  if (!a.title || !a.artist || a.year == null || !a.category) return null; // min-4 → drop
  return {
    id: a.id,
    objectNumber: a.objno || '',
    title: a.title,
    artist: a.artist,                                   // kept exactly as source stores it
    date: a.dateStr || String(a.year),
    year: a.year,
    medium: a.medium || '',
    dimensions: a.dimensions || '',
    category: a.category,
    description: '',
    imageUrl,
    thumbnailUrl: a.imgUrl,
    onDisplay: false,
    displayLocation: '',
    sourceUrl: a.sourceUrl,
    metadata: { mng_id: a.id, accession: a.objno || '', src_w: srcW || null, src_h: srcH || null },
    original_imageUrl: a.imgUrl,
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
    museum: 'Hungarian National Gallery',
    collection: 'Collection',
    website: 'https://en.mng.hu/artworks/',
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
  const html = await getHtml(DETAIL(item.id));
  await sleep(CRAWL_MS);
  if (!html) { processed.add(item.id); return { status: 'no-page' }; }
  const a = parseDetail(html, item);
  if (!passesValueFilter(a.category, a.title, a.medium)) { processed.add(item.id); return { status: 'filtered' }; }
  if (!a.title || !a.artist || a.year == null) { processed.add(item.id); return { status: 'min4-drop' }; }
  if (!a.imgUrl) { processed.add(item.id); return { status: 'no-image' }; }
  try {
    const { imageUrl, srcW, srcH } = await processImage(a);
    const w = toArtwork(a, imageUrl, srcW, srcH);
    processed.add(item.id);
    if (!w) return { status: 'min4-drop' };
    appendFn(w);
    return { status: 'ok', artwork: w };
  } catch (e) {
    fs.appendFileSync(FAILED_NDJSON, JSON.stringify({ id: item.id, url: a.imgUrl, err: String(e.message || e) }) + '\n');
    processed.add(item.id);
    return { status: 'img-err', err: String(e.message || e) };
  }
}

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  console.log(`[hungarian-ng] mode=${MODE} no-upload=${NO_UPLOAD} limit=${LIMIT ?? '∞'} delay=${CRAWL_MS}ms`);

  const { items, totals } = await enumerateAll();
  console.log('\n[enum] type totals:', JSON.stringify(totals));
  console.log(`[enum] unique in-scope objects = ${items.length}`);

  if (MODE === 'classify') {
    const byCat = {};
    for (const it of items) byCat[it.category] = (byCat[it.category] || 0) + 1;
    console.log('\n[classify] in-scope by category:', byCat);
    console.log('[classify] category comes from the artwork_type filter slug (reliable; no guessing).');
    console.log('[classify] paintings kept ALL; drawing/print/photograph/collage value-filtered at detail stage');
    console.log('[classify] (study/sketch/copy after/squeeze/fragment). Portrait miniatures → remove-miniatures at registration.');
    return;
  }

  // pilot / full
  const processed = MODE === 'full' ? loadProcessed() : new Set();
  let queue = items.filter((it) => !processed.has(it.id));
  if (MODE === 'pilot') {
    // pilot: sample across all types for parser coverage (not just paintings).
    const want = LIMIT || 20;
    const perType = Math.ceil(want / TYPES.length);
    const picks = [];
    for (const { category } of TYPES) picks.push(...items.filter((i) => i.category === category).slice(0, perType));
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
  const CONC = MODE === 'pilot' ? 2 : 3;
  let idx = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (idx < queue.length) {
      const item = queue[idx++];
      const r = await handleItem(item, processed, appendFn);
      if (r.status === 'ok') stats.ok++;
      else if (r.status === 'filtered') stats.filtered++;
      else if (r.status === 'min4-drop') stats.min4++;
      else if (r.status === 'no-image') stats.noImg++;
      else if (r.status === 'no-page') stats.noPage++;
      else if (r.status === 'img-err') stats.imgErr++;
      if (++done % 50 === 0) {
        console.log(`  …${done}/${queue.length} (ok ${stats.ok}, filt ${stats.filtered}, min4 ${stats.min4}, noImg ${stats.noImg}, imgErr ${stats.imgErr})`);
        if (MODE === 'full') saveProcessed(processed);
      }
    }
  }));
  if (MODE === 'full') saveProcessed(processed);

  collected.sort((x, y) => Number(x.id) - Number(y.id));
  const stem = MODE === 'pilot' ? `${COLLECTION_STEM}-pilot` : COLLECTION_STEM;
  writeCollection(collected, stem);
  console.log(`\n[${MODE}] DONE. collected ${collected.length} |`, stats);
  console.log(`[${MODE}] total in-scope enumerated = ${items.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
