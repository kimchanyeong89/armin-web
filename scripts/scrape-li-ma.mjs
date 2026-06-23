#!/usr/bin/env node
// LIMA (Living Media Art, Amsterdam) — media-art / video collection scraper.
//
// SOURCE (museum-OWN infra): Strapi REST API behind the Gatsby catalogue.
//   GET https://li-ma.nl/strapi/api/artworks?filters[titleOrder][$startsWith]=&sort=random:asc
//        &randomSort=true&pagination[page]=N&pagination[pageSize]=20
//   → { data:[{ id, attributes:{ title, type, year, length, description, country,
//                                 artistName, artistNameOrder, titleOrder,
//                                 stillUrl, artworkUrl, keywords } } ],
//       meta:{ pagination:{ page, pageSize, pageCount, total } } }
//   total = 3,021 video/media works (152 pages). Each record carries a per-work STILL on
//   LIMA's OWN CDN: stillUrl = https://media.li-ma.nl/view/{stillId}.jpg  (typ. 736×552,
//   openly served, no auth/watermark). artworkUrl/artistUrl point off-site to mediakunst.net
//   (a Dutch-collections aggregator) — we never use those; the still + metadata come straight
//   from LIMA's Strapi + media CDN.
//
// SCOPE: all works are moving-image (type ∈ video|installation|channel|…) → category "video"
//   (guide §1: video = 비디오·필름·무빙이미지). We collect the openly-served STILL frame as the
//   artwork image (the task's "per-work still ≥600px" requirement). Stills with width <600px
//   (a few legacy 120×90 thumbs) are gated out.
//
// ⚠️ RATE-LIMIT (verified Phase A): the Strapi API sits behind a WAF that (a) only honours the
//   EXACT frontend query signature above, and (b) throttles rapid clients to HTTP 403/500.
//   Plain node-fetch is blocked outright. The ONLY reliable path is to drive the museum's own
//   page in a real browser (Playwright + system Chrome) and issue the fetch from the same-origin
//   page context, pacing requests slowly with backoff + page re-navigation on throttle. A 180s
//   rest fully resets the limiter (organic load recovers 200 + full data). So the scraper is
//   deliberately SLOW and POLITE. Because randomSort returns overlapping pages, we accumulate by
//   UNIQUE id until coverage reaches `total` or stalls (no new ids for STALL_LIMIT pages).
//
// Output: public/data/li-ma-collection.json (canonical schema). ids prefixed "li-ma-".
//   R2 key: artworks/li-ma-collection/{id}-{hash8}-imageUrl.webp
//
// Usage:
//   node scripts/scrape-li-ma.mjs --probe   # ~15 works end-to-end (fetch → still → R2 → JSON pilot)
//   node scripts/scrape-li-ma.mjs --full    # all in-scope, resumable (checkpointed page cursor + seen ids)

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const REPO = path.resolve(fileURLToPath(import.meta.url), '../..');
require('dotenv').config({ path: path.join(REPO, '.env.local') });

const SLUG = 'li-ma';
const COLLECTION_STEM = `${SLUG}-collection`;
const CATALOGUE_URL = 'https://li-ma.nl/catalogue/artworks/';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const PAGE_SIZE = 20;
const MIN_W = 600;            // still width gate (task requirement)
const PAGE_DELAY_MS = 7000;   // polite spacing between sanctioned page fetches
const STALL_LIMIT = 25;       // consecutive pages with 0 new ids → assume coverage exhausted

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : 'probe';
const PROBE_TARGET = 15;

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
  .replace(/&hellip;/g, '…').replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).trim();

// ---------- browser-driven page fetch (the only path the WAF allows) ----------
// Returns a function fetchPage(n) → { data, meta } | { fail, status } using the live page's
// same-origin fetch with the EXACT sanctioned signature. On throttle the caller re-navigates.
async function makeBrowser() {
  const pw = await import('playwright');
  const chromium = pw.chromium || (pw.default && pw.default.chromium);
  const browser = await chromium.launch({ headless: true, executablePath: CHROME });
  const page = await browser.newPage({ userAgent: UA });
  return { browser, page };
}

async function navCatalogue(page) {
  // (re)establishes the WAF-allowed session; the organic load itself issues a sanctioned request.
  await page.goto(CATALOGUE_URL, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(2500);
}

function sigPath(p) {
  return `/strapi/api/artworks?filters[titleOrder][$startsWith]=&sort=random:asc&randomSort=true&pagination[page]=${p}&pagination[pageSize]=${PAGE_SIZE}`;
}

// Fetch one page from inside the page context; one attempt.
async function fetchPageOnce(page, p) {
  return await page.evaluate(async (q) => {
    try {
      const r = await fetch(q, { headers: { Accept: 'application/json' } });
      if (!r.ok) return { fail: true, status: r.status };
      const j = await r.json();
      return { data: j.data || [], meta: j.meta };
    } catch (e) { return { fail: true, status: String(e).slice(0, 60) }; }
  }, sigPath(p));
}

// Fetch a page with throttle recovery. The WAF resets only after a QUIET rest (any request,
// including a re-nav, restarts the cooldown clock — verified Phase A: 180s of silence recovers).
// So on throttle we (a) rest SILENTLY with growing backoff, and (b) re-navigate only ONCE near
// the end to refresh the session, not on every attempt.
async function fetchPage(page, p, tries = 6) {
  const BACKOFFS = [45000, 75000, 120000, 150000, 180000, 200000]; // quiet rests (ms)
  for (let att = 0; att < tries; att++) {
    const res = await fetchPageOnce(page, p);
    if (!res.fail) return res;
    const backoff = BACKOFFS[Math.min(att, BACKOFFS.length - 1)];
    const reNav = att === tries - 2; // single refresh near the end
    console.log(`    page ${p} throttled (${res.status}); quiet rest ${Math.round(backoff / 1000)}s${reNav ? ' + re-nav' : ''} (attempt ${att + 1}/${tries})`);
    await sleep(backoff);
    if (reNav) await navCatalogue(page);
  }
  return { fail: true, status: 'exhausted' };
}

// ---------- record → ARMIN artwork (pre-image) ----------
function parseRecord(rec) {
  const a = rec.attributes || rec;
  const title = decodeEntities(a.title);
  const artist = decodeEntities(a.artistName);
  const yearMatch = String(a.year ?? '').match(/\d{4}/);
  const year = yearMatch ? parseInt(yearMatch[0], 10) : null;
  const still = a.stillUrl || null;
  return {
    rawId: String(rec.id),
    id: `li-ma-${rec.id}`,
    title,
    artist,
    year,
    dateStr: a.year != null ? String(a.year) : '',
    type: (a.type || '').toLowerCase(),
    length: a.length || '',
    country: a.country || '',
    description: decodeEntities(a.description),
    still,
    artworkUrl: a.artworkUrl || '',
    category: 'video',                 // all moving-image
  };
}

// ---------- image: download still, verify ≥600px, webp, upload to R2 ----------
async function dl(url) {
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'armin-museum-research/1.0' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 3000) throw new Error(`tiny ${buf.length}b`);
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
  if (!a.still) throw new Error('no still');
  const src = await dl(a.still);
  const sharp = (await import('sharp')).default;
  const meta = await sharp(src).metadata().catch(() => ({}));
  if (meta.width && meta.width < MIN_W) throw new Error(`small still ${meta.width}x${meta.height}`);
  const buffer = await sharp(src).resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 85 }).toBuffer();
  const hash8 = sha(a.still).slice(0, 8);
  const key = `artworks/${COLLECTION_STEM}/${a.id}-${hash8}-imageUrl.webp`;
  await uploadR2(key, buffer);
  return { imageUrl: `${R2_PUBLIC}/${key}`, srcW: meta.width || null, srcH: meta.height || null };
}

// ---------- record assembly (min-4 guard) ----------
function toArtwork(a, imageUrl) {
  if (!a.title || !a.artist || a.year == null || !a.category) return null;
  return {
    id: a.id,
    objectNumber: a.rawId,
    title: a.title,
    artist: a.artist,
    date: a.dateStr || (a.year != null ? String(a.year) : ''),
    year: a.year,
    medium: a.length ? `single-channel video, ${a.length}` : 'single-channel video',
    dimensions: a.length || '',
    category: a.category,
    description: a.description || '',
    imageUrl,
    thumbnailUrl: a.still,
    onDisplay: false,
    displayLocation: '',
    sourceUrl: CATALOGUE_URL,
    metadata: { lima_id: a.rawId, type: a.type, length: a.length, country: a.country, artworkUrl: a.artworkUrl },
    original_imageUrl: a.still,
  };
}

function writeCollection(artworks, stem, totalSeen) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const types = {};
  for (const w of artworks) types[w.metadata.type] = (types[w.metadata.type] || 0) + 1;
  const payload = {
    museum: 'LIMA',
    collection: 'Media Art Collection',
    website: 'https://li-ma.nl/catalogue/artworks/',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'api',
    category_breakdown: cats,
    type_breakdown: types,
    artworks,
  };
  const out = path.join(REPO, 'public/data', `${stem}.json`);
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
  console.log(`[write] ${out} (${artworks.length} works, distinct seen=${totalSeen}) cats=`, cats, 'types=', types);
  return out;
}

// ---------- harvest unique records by paging the randomSorted API ----------
async function harvest(page, want /* number, or Infinity for full */) {
  const seen = new Map();    // rawId → parsed record
  let total = null;
  let p = 0;
  let stall = 0;
  const ckptPath = path.join(STATE_DIR, `${SLUG}-progress.json`);

  // quiet gap after the session-establishing nav so page-0 fetch isn't back-to-back with it
  await sleep(PAGE_DELAY_MS);

  while (true) {
    const res = await fetchPage(page, p);
    if (res.fail) { console.log(`  [stop] page ${p} unrecoverable (${res.status}); harvested ${seen.size} so far`); break; }
    total = res.meta?.pagination?.total ?? total;
    let added = 0;
    for (const rec of res.data) {
      const r = parseRecord(rec);
      if (!seen.has(r.rawId)) { seen.set(r.rawId, r); added++; }
    }
    stall = added === 0 ? stall + 1 : 0;
    if ((p % 10 === 0) || added === 0) {
      console.log(`  page ${p}: +${added} new (total unique ${seen.size}${total ? '/' + total : ''}, stall ${stall})`);
    }
    // checkpoint
    try { fs.writeFileSync(ckptPath, JSON.stringify({ page: p, unique: seen.size, total, ts: Date.now() })); } catch {}

    // stop conditions
    if (want !== Infinity && seen.size >= want) break;
    if (total && seen.size >= total) { console.log(`  [done] reached total ${total}`); break; }
    if (stall >= STALL_LIMIT) { console.log(`  [done] coverage stalled (${STALL_LIMIT} pages, ${seen.size}${total ? '/' + total : ''}); stopping`); break; }
    p++;
    // guard against runaway: randomSort means we may need >pageCount passes; cap at 4× pageCount
    if (total && p > Math.ceil(total / PAGE_SIZE) * 4) { console.log('  [done] page cap reached'); break; }
    await sleep(PAGE_DELAY_MS);
  }
  return { records: [...seen.values()], total };
}

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const { browser, page } = await makeBrowser();
  try {
    console.log(`[${MODE}] establishing WAF-allowed session …`);
    await navCatalogue(page);

    const want = MODE === 'probe' ? PROBE_TARGET * 3 : Infinity; // over-fetch in probe (some stills <600 / fail)
    console.log(`[${MODE}] harvesting records (want ${want === Infinity ? 'ALL' : want}) …`);
    const { records, total } = await harvest(page, want);
    console.log(`[${MODE}] harvested ${records.length} unique records (api total=${total})`);

    // candidates with a still + passing min-4
    let candidates = records.filter((r) => r.still && r.title && r.artist && r.year != null);
    if (MODE === 'probe') candidates = candidates.slice(0, PROBE_TARGET + 6); // a few spare for <600 gating
    console.log(`[${MODE}] image-processing ${candidates.length} candidates → R2 …`);

    const artworks = [];
    let done = 0, imgErr = 0, smallGate = 0;
    const CONC = MODE === 'probe' ? 3 : 5;
    let idx = 0;
    const target = MODE === 'probe' ? PROBE_TARGET : Infinity;
    await Promise.all(Array.from({ length: CONC }, async () => {
      while (idx < candidates.length && artworks.length < target) {
        const a = candidates[idx++];
        try {
          const { imageUrl } = await processImage(a);
          const w = toArtwork(a, imageUrl);
          if (w) artworks.push(w);
        } catch (e) {
          if (/small still/.test(String(e.message))) smallGate++;
          else {
            imgErr++;
            fs.appendFileSync(path.join(STATE_DIR, `${SLUG}-failed.ndjson`), JSON.stringify({ id: a.id, url: a.still, err: String(e.message || e) }) + '\n');
            if (imgErr <= 5) console.log(`  img err id=${a.id}: ${e.message}`);
          }
        }
        if (++done % 50 === 0) console.log(`  …${done}/${candidates.length} (ok ${artworks.length}, <600 ${smallGate}, err ${imgErr})`);
      }
    }));

    artworks.sort((x, y) => Number(x.metadata.lima_id) - Number(y.metadata.lima_id));
    const stem = MODE === 'probe' ? `${COLLECTION_STEM}-probe` : COLLECTION_STEM;
    writeCollection(artworks, stem, records.length);
    console.log(`\n[${MODE}] DONE. collected ${artworks.length} | <600 gated ${smallGate} | img errors ${imgErr}`);
    console.log(`[${MODE}] api total in-scope = ${total}`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
