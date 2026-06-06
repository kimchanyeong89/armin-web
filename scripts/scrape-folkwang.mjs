#!/usr/bin/env node
// Museum Folkwang (Essen) collection scraper — eMuseumPlus 5.5 (Zetcom, sammlung-online.museum-folkwang.de).
//
// The online catalogue is a stateful Tapestry portal with NO API/IIIF and NO objectIds in result lists,
// BUT each artwork has a stateless permalink:
//   ?service=ExternalInterface&module=collection&objectId={N}&viewType=detailView&lang=en
// objectIds are sparse but dense within bands across 1..~135000. We brute-force scan that range.
//
// Per object:
//   1. fetch detail page (stateless) → parse fields (non-greedy) + artist (from artist_list block, NOT the title self-link)
//   2. cheap placeholder pre-check: the detail <img> is the 340x340 / 5721B / sha 980202fd... "no image" card → skip
//   3. follow the $TspImage popup (window.open) → larger image token (up to ~768px) → download
//   4. backstop placeholder check on downloaded popup image (768x768 / 14413B "No image" gray)
//   5. resize→webp(2048,q85)→R2 (skip upload if key exists)
//
// Scope = flat visual art only (photograph/painting/print/drawing). Collection is huge (33,435) →
// two-phase: (A) scan range collecting in-scope metadata only (no image), (B) prioritise
// (painting > drawing > print > photograph) up to CAP and download images for the selected set.
//
// Usage:  node scripts/scrape-folkwang.mjs [--limit=N] [--cap=1500] [--maxid=135000] [--concurrency=6] [--pilot]

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config({ path: path.resolve(fileURLToPath(import.meta.url), '../../.env.local') });

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const PILOT       = !!args.pilot || !!args.limit;
const LIMIT       = args.limit ? Number(args.limit) : null;          // pilot: process only first N in-scope objects
const CAP         = args.cap ? Number(args.cap) : 1500;              // full: max records to keep
// scan ceiling. Default 16000 = the proven-dense low band (Photography throughout + Painting ~8k +
// Print ~10k + Drawing), which holds far more than the cap. Raise with --maxid only if a band runs short.
const MAX_ID      = args.maxid ? Number(args.maxid) : 16000;
const START_ID    = args.startid ? Number(args.startid) : 200; // ids 1-199 are sparse/empty — skip them
// --ranges=a-b,c-d visits only those objectId ranges (used for a targeted painting/print top-up pass).
// --append merges new records into an existing folkwang-collection.json instead of overwriting it.
const RANGES      = args.ranges ? String(args.ranges).split(',').map(r => r.split('-').map(Number)) : null;
const APPEND      = !!args.append;
// The eMuseumPlus backend (zem-emp-lbaas-01.os.stoney-cloud.com) is single-threaded and throttles hard
// under concurrency: 6 workers pushed per-request latency from ~0.7s to 24-34s. Keep it gentle.
const CONCURRENCY = Number(args.concurrency || 2);
const REQ_DELAY   = Number(args.delay || 250);   // ms politeness pause after each object
const STEM        = PILOT ? 'folkwang-pilot-collection' : 'folkwang-collection';
const OUT_JSON    = `public/data/${STEM}.json`;
const REPO_ROOT   = path.resolve(fileURLToPath(import.meta.url), '../..');
const STATE_DIR   = path.join(REPO_ROOT, 'scripts/.state');
const UA          = 'Mozilla/5.0 (compatible; armin-museum-research/1.0)';
const BASE        = 'https://sammlung-online.museum-folkwang.de';

const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// classification (English, lang=en) → our category. Anything not here is out of scope (3D/object/bound).
const CAT_MAP = {
  photography: 'photograph',
  fotografie: 'photograph',
  fotodokument: 'photograph',
  fotonegativ: 'photograph',
  photonegativ: 'photograph',
  painting: 'painting',
  malerei: 'painting',
  print: 'print',
  druckgrafik: 'print',
  printmaking: 'print',
  poster: 'print',
  plakat: 'print',
  drawing: 'drawing',
  zeichnung: 'drawing',
  collage: 'drawing',
};
function mapCategory(cls) {
  if (!cls) return null;
  const c = cls.toLowerCase().trim();
  // exact first
  if (CAT_MAP[c]) return CAT_MAP[c];
  // first token (values like "Fotografie, Fotodokument", "Photography, ...")
  const first = c.split(/[,/;]/)[0].trim();
  if (CAT_MAP[first]) return CAT_MAP[first];
  // substring fallback for compound classifications
  for (const k of Object.keys(CAT_MAP)) if (c.includes(k)) return CAT_MAP[k];
  return null;
}
// Placeholder signatures (confirmed by probing). Detail small card: 340x340 / 5721B / sha 980202fd...
const PH_SMALL_LEN = 5721;
const PH_SMALL_SHA = '980202fd7f6ef41e';           // sha256 prefix
// Popup "No image" gray card: 768x768 / 14413B
const PH_POPUP_LEN = 14413;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const hash8 = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 8);
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

function dec(s) {
  return (s || '').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
                  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
                  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
                  .replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
                  .replace(/&#8224;|&dagger;/g, '†');
}

async function fetchHtml(url, jar, attempt = 1) {
  const headers = { 'User-Agent': UA };
  if (jar && jar.cookie) headers['Cookie'] = jar.cookie;
  let res;
  try {
    res = await fetch(url, { headers, redirect: 'follow' });
  } catch (e) {
    if (attempt <= 3) { await sleep(500 * 2 ** (attempt - 1)); return fetchHtml(url, jar, attempt + 1); }
    throw e;
  }
  if ((res.status === 429 || res.status >= 500) && attempt <= 4) {
    await sleep(800 * 2 ** (attempt - 1)); return fetchHtml(url, jar, attempt + 1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  // capture session cookie for the popup follow within the same logical session
  if (jar) {
    const sc = res.headers.get('set-cookie');
    if (sc) jar.cookie = sc.split(';')[0];
  }
  return res.text();
}

// Pull a single tspValue for an Obj_* field key (non-greedy; value is the immediate tspValue span)
function field(html, key) {
  // <li class="control">KEY (label): <span> <span class="tspValue">VALUE</span>
  const re = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^<]*</?[^>]*>[\\s\\S]{0,40}?<span class="tspValue">([\\s\\S]*?)<\\/span>');
  let m = html.match(re);
  if (!m) {
    const re2 = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]{0,120}?<span class="tspValue">([\\s\\S]*?)<\\/span>');
    m = html.match(re2);
  }
  return m ? dec(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim() : '';
}

function parseDetail(html) {
  if (!html.includes('Obj_Title1_S')) return null; // invalid objectId / no record
  const out = {};
  out.title = field(html, 'Obj_Title1_S');
  out.dating = field(html, 'Obj_Dating_S');
  out.classification = field(html, 'Obj_Classification_S');
  out.dimensions = field(html, 'Obj_Crate_S');
  out.medium = field(html, 'Obj_Material_S') || field(html, 'Obj_Technique_S');
  out.objectNumber = field(html, 'Obj_IdentNr_S');
  out.creditline = field(html, 'Obj_Creditline_S');
  out.rights = field(html, 'Obj_Rights_S');
  out.ownership = field(html, 'Obj_Ownership_S');

  // year: prefer 4-digit from Dating; else Jahr von
  let year = null;
  const yd = (out.dating || '').match(/\b(1[0-9]{3}|20[0-9]{2})\b/);
  if (yd) year = Number(yd[0]);
  if (year == null) {
    const jv = field(html, 'Jahr von');
    const ym = (jv || '').match(/\b(1[0-9]{3}|20[0-9]{2})\b/);
    if (ym) year = Number(ym[0]);
  }
  out.year = year;

  // ARTIST: from the artist_list inline block ONLY (the first tspTitleLink elsewhere is the title self-link).
  let artist = '';
  const artistLinks = [...html.matchAll(/artist_list\.\$TspTitleLink\.link[^>]*>[\s\S]*?<span class="tspTitleLink">([^<]+)<\/span>/g)]
    .map(m => dec(m[1]).trim())
    .filter(Boolean)
    // the catalogue records genuinely-unattributed makers as "Anonym"/"unbekannt" — normalise to Anonymous
    .map(a => /^(anonym|anonymous|unbekannt|ohne k[üu]nstler)$/i.test(a) ? 'Anonymous' : a);
  if (artistLinks.length) artist = [...new Set(artistLinks)].join('; ');
  out.artist = artist;

  // artist life-dates (first match) — for metadata
  const life = html.match(/<span class="tspValue">(\s*\*[^<]*)<\/span>/);
  out.artistLife = life ? dec(life[1]).replace(/\s+/g, ' ').trim() : '';

  // detail (small) image token — used for cheap placeholder pre-check
  const smallM = html.match(/<img[^>]*src="(\/eMP\/eMuseumPlus\?service=DynamicAsset[^"]*image%2Fjpeg[^"]*)"/);
  out.smallImg = smallM ? dec(smallM[1]) : '';

  // $TspImage popup path (window.open) — yields the larger image
  const popM = html.match(/window\.open\('([^']*TspImage\.link[^']*)'/);
  out.popupPath = popM ? dec(popM[1]) : '';

  return out;
}

async function downloadImage(url, jar, attempt = 1) {
  const headers = { 'User-Agent': UA };
  if (jar && jar.cookie) headers['Cookie'] = jar.cookie;
  let res;
  try { res = await fetch(url, { headers, redirect: 'follow' }); }
  catch (e) { if (attempt <= 4) { await sleep(600 * 2 ** (attempt - 1)); return downloadImage(url, jar, attempt + 1); } throw e; }
  if ((res.status === 429 || res.status >= 500) && attempt <= 4) { await sleep(800 * 2 ** (attempt - 1)); return downloadImage(url, jar, attempt + 1); }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024) throw new Error(`tiny: ${buf.length}B`);
  return buf;
}

async function r2Exists(key) {
  try { await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key })); return true; }
  catch { return false; }
}
async function r2Upload(key, buf) {
  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET, Key: key, Body: buf,
    ContentType: 'image/webp', CacheControl: 'public, max-age=31536000',
  }));
}

// process ONE objectId end-to-end: fetch detail → in-scope? → popup → image → R2 → record.
// returns {status:'kept'|'skip'|'fail', artwork?, reason?}
async function processObject(oid) {
  const jar = {};
  let html;
  try {
    html = await fetchHtml(`${BASE}/eMP/eMuseumPlus?service=ExternalInterface&module=collection&objectId=${oid}&viewType=detailView&lang=en`, jar);
  } catch (e) { return { status: 'fail', reason: `detail: ${e.message}` }; }
  const meta = parseDetail(html);
  if (!meta) return { status: 'skip', reason: 'invalid-id' };
  if (!meta.title) return { status: 'skip', reason: 'no-title' };
  const category = mapCategory(meta.classification);
  if (!category) return { status: 'skip', reason: `out-of-scope:${meta.classification}` };
  if (!meta.smallImg) return { status: 'skip', reason: 'no-image' };
  meta.category = category;

  // Resolve the larger image via the $TspImage popup (same session). Retry once with a fresh session
  // if the positional popup token is stale.
  let popupPath = meta.popupPath;
  let imgUrl = '';
  for (let tryN = 0; tryN < 2 && !imgUrl; tryN++) {
    if (!popupPath) {
      const fj = {};
      let dh;
      try { dh = await fetchHtml(`${BASE}/eMP/eMuseumPlus?service=ExternalInterface&module=collection&objectId=${oid}&viewType=detailView&lang=en`, fj); }
      catch { continue; }
      const m2 = parseDetail(dh); if (!m2) continue;
      popupPath = m2.popupPath; jar.cookie = fj.cookie;
      if (!popupPath) { imgUrl = m2.smallImg ? `${BASE}${m2.smallImg}` : ''; break; } // no popup → small (still ≥240px)
    }
    try {
      const popHtml = await fetchHtml(`${BASE}${popupPath}`, jar);
      const pm = popHtml.match(/(\/eMP\/eMuseumPlus\?service=DynamicAsset[^"]*image%2Fjpeg[^"]*)/);
      if (pm) imgUrl = `${BASE}${dec(pm[1])}`; else popupPath = '';
    } catch { popupPath = ''; }
  }
  if (!imgUrl) return { status: 'fail', reason: 'no-image-url' };

  const key = `artworks/${STEM}/folkwang-${oid}-${hash8(imgUrl)}-imageUrl.webp`;
  try {
    if (!(await r2Exists(key))) {
      const buf = await downloadImage(imgUrl, jar);
      // placeholder backstops: detail "no image" card (340x340/5721B) or popup gray (768x768/14413B)
      if (buf.length === PH_POPUP_LEN) return { status: 'skip', reason: 'placeholder-popup' };
      if (buf.length === PH_SMALL_LEN && sha(buf).startsWith(PH_SMALL_SHA)) return { status: 'skip', reason: 'placeholder-small' };
      const md = await sharp(buf, { limitInputPixels: false }).metadata();
      if ((md.width || 0) < 200 || (md.height || 0) < 200) return { status: 'skip', reason: `too-small ${md.width}x${md.height}` };
      const webp = await sharp(buf, { limitInputPixels: false })
                     .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
                     .webp({ quality: 85 }).toBuffer();
      await r2Upload(key, webp);
    }
  } catch (e) { return { status: 'fail', reason: `image: ${e.message}` }; }

  const sourceUrl = `${BASE}/eMP/eMuseumPlus?service=ExternalInterface&module=collection&objectId=${oid}&viewType=detailView`;
  return {
    status: 'kept',
    artwork: {
      id: `folkwang-${oid}`,
      objectNumber: meta.objectNumber || `folkwang-${oid}`,
      title: meta.title,
      artist: meta.artist || 'Anonymous',
      date: meta.dating || (meta.year ? String(meta.year) : null),
      year: meta.year,
      medium: meta.medium || '',
      dimensions: meta.dimensions || '',
      category: meta.category,
      description: '',
      imageUrl: `${R2_PUBLIC}/${key}`,
      thumbnailUrl: meta.smallImg ? `${BASE}${meta.smallImg}` : '',
      onDisplay: false,
      displayLocation: '',
      sourceUrl,
      metadata: {
        objectId: oid,
        classification: meta.classification,
        creditline: meta.creditline,
        rights: meta.rights,
        ownership: meta.ownership,
        artistLife: meta.artistLife,
      },
      original_imageUrl: imgUrl,
    },
  };
}

// Build the objectId visit order.
// The server is slow and serialises requests, so we cannot afford to wander sparse high-id regions
// (round-robin across [20k,62k,100k] starting points wasted ~99% of requests on empty sub-ranges).
// The low band (1..~16000) is proven ~84% dense and already spans every in-scope category
// (Photography throughout, Painting ~8k, Print ~10k+, Drawing) — more than enough to fill a 1500 cap.
// We traverse it sequentially; --maxid lets us extend if a band runs short.
function buildVisitOrder() {
  const order = [];
  if (RANGES) {
    for (const [a, b] of RANGES) for (let i = a; i <= b; i++) order.push(i);
  } else {
    for (let i = START_ID; i <= MAX_ID; i++) order.push(i);
  }
  return order;
}

async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  console.log(`[folkwang] mode=${PILOT ? `pilot(limit=${LIMIT || 'n/a'})` : `full(cap=${CAP})`} conc=${CONCURRENCY}`);

  const TARGET = LIMIT || CAP;
  const visitOrder = buildVisitOrder();   // sequential 1..MAX_ID (dense low band) or --ranges
  const ckptPath = path.join(REPO_ROOT, OUT_JSON);

  const artworks = [];
  const seen = new Set();   // objectIds already collected (skip in --append / dedupe)
  if (APPEND && fs.existsSync(ckptPath)) {
    const prev = JSON.parse(fs.readFileSync(ckptPath, 'utf8')).artworks || [];
    for (const a of prev) { artworks.push(a); seen.add(a.metadata?.objectId); }
    console.log(`[folkwang] append mode: loaded ${artworks.length} existing records`);
  }
  const failed = [];
  let idx = 0, scanned = 0, kept = 0, skipped = 0, stop = false;

  const writeCheckpoint = () => {
    const sorted = [...artworks].sort((a, b) => a.metadata.objectId - b.metadata.objectId);
    fs.writeFileSync(ckptPath, JSON.stringify({
      museum: 'Museum Folkwang',
      collection: PILOT ? `Pilot ${sorted.length} items` : 'Flat visual art — paintings, drawings, prints & photographs (capped subset of 33,435)',
      website: 'https://www.museum-folkwang.de/en/collection',
      source: 'sammlung-online.museum-folkwang.de eMuseumPlus 5.5 — stateless objectId detail pages + TspImage popup image',
      scraped_date: '2026-05-27',
      total_count: sorted.length,
      source_type: 'emuseumplus-html',
      artworks: sorted,
    }, null, 2));
  };

  const preloaded = artworks.length;   // in append mode, count these toward the cap
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (!stop) {
      const oid = visitOrder[idx++];
      if (oid === undefined) return;
      if (seen.has(oid)) { continue; }   // already collected (append/dedupe)
      const r = await processObject(oid);
      scanned++;
      if (r.status === 'kept') { artworks.push(r.artwork); seen.add(oid); kept++; }
      else if (r.status === 'fail') { failed.push({ oid, reason: r.reason }); }
      else { skipped++; }
      if (preloaded + kept >= TARGET) { stop = true; }
      if (scanned % 50 === 0 || (r.status === 'kept' && kept % 50 === 0)) {
        console.log(`[folkwang] scanned=${scanned} kept=${kept}/${TARGET} skipped=${skipped} fail=${failed.length} (id=${oid})`);
        if (kept > 0 && kept % 100 === 0) writeCheckpoint();
      }
      if (REQ_DELAY) await sleep(REQ_DELAY);   // keep the fragile backend happy
    }
  }));

  // ---------- write ----------
  artworks.sort((a, b) => a.metadata.objectId - b.metadata.objectId);
  const out = {
    museum: 'Museum Folkwang',
    collection: PILOT ? `Pilot ${artworks.length} items` : 'Flat visual art — paintings, drawings, prints & photographs (capped)',
    website: 'https://www.museum-folkwang.de/en/collection',
    source: 'sammlung-online.museum-folkwang.de eMuseumPlus 5.5 — stateless objectId detail pages + TspImage popup image',
    scraped_date: '2026-05-27',
    total_count: artworks.length,
    source_type: 'emuseumplus-html',
    artworks,
  };
  fs.writeFileSync(path.join(REPO_ROOT, OUT_JSON), JSON.stringify(out, null, 2));
  console.log(`\n[folkwang] wrote ${OUT_JSON} (${artworks.length} artworks)`);

  if (failed.length) {
    const failPath = path.join(STATE_DIR, `${STEM}-failed.ndjson`);
    fs.writeFileSync(failPath, failed.map(f => JSON.stringify(f)).join('\n'));
    console.log(`[folkwang] failed log: ${failPath} (${failed.length})`);
  }

  const cov = k => artworks.filter(a => a[k] && (typeof a[k] === 'string' ? a[k].length : true)).length;
  console.log(`\n=== Coverage on ${artworks.length} kept ===`);
  console.log(`  title:      ${cov('title')}/${artworks.length}`);
  console.log(`  artist:     ${cov('artist')}/${artworks.length}`);
  console.log(`  year:       ${artworks.filter(a => a.year != null).length}/${artworks.length}`);
  console.log(`  medium:     ${cov('medium')}/${artworks.length}`);
  console.log(`  dimensions: ${cov('dimensions')}/${artworks.length}`);
  const catDist = {};
  artworks.forEach(a => { catDist[a.category] = (catDist[a.category] || 0) + 1; });
  console.log(`  cat dist:   ${JSON.stringify(catDist)}`);
}

main().catch(e => { console.error(e); process.exit(1); });
