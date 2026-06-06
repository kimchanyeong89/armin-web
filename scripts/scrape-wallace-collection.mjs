#!/usr/bin/env node
// The Wallace Collection (London) scraper — Axiell eMuseumPlus.
// See scripts/SOURCE_RESEARCH_wallace-collection.md.
//
// Strategy (self-site only, no third-party aggregators):
//   1. Discovery: objectId list of the catalogued on-view holdings comes from the
//      prior room-display crawl (public/data/wallace-collection.json) filtered to
//      accession prefixes P / M / L (paintings + miniatures = flat visual art).
//      This is only the index of WHICH self-site objects to fetch.
//   2. For each objectId: fetch the LIVE detail page fresh via the stable deep-link
//        ?service=ExternalInterface&module=collection&objectId={ID}&viewType=detailView
//      and parse ALL fields from <li class="List{Field}"> rows (title, artist, year,
//      medium, dimensions, accession, location, place). Category from FRESH accession
//      prefix. Records that are not P/M/L on the fresh page are dropped (scope guard).
//   3. Download fresh hi-res image from
//        ?service=ImageAsset&module=collection&objectId={ID}&resolution=superImageResolution
//      → sharp webp q85 (≤2048) → R2 (resumable via HeadObject).
//
// Usage:  node scripts/scrape-wallace-collection.mjs [--limit=N] [--concurrency=4]

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
const LIMIT       = args.limit ? Number(args.limit) : null;
const CONCURRENCY = Number(args.concurrency || 4);
const STEM        = LIMIT ? 'wallace-collection-pilot-collection' : 'wallace-collection-collection';
const OUT_JSON    = `public/data/${STEM}.json`;
const REPO_ROOT   = path.resolve(fileURLToPath(import.meta.url), '../..');
const UA          = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BASE        = 'https://wallacelive.wallacecollection.org';
const detailUrlOf = id => `${BASE}/eMP/eMuseumPlus?service=ExternalInterface&module=collection&objectId=${id}&viewType=detailView`;
const imageUrlOf  = id => `${BASE}/eMP/eMuseumPlus?service=ImageAsset&module=collection&objectId=${id}&resolution=superImageResolution`;

// R2 — re-encode webp to the canonical key path for this collection.
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = ms => new Promise(r => setTimeout(r, ms));
const hash8 = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 8);

function dec(s) {
  return (s || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ');
}
const strip = s => dec((s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

async function fetchHtml(url, attempt = 1) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if ((res.status === 429 || res.status >= 500) && attempt <= 4) { await sleep(800 * 2 ** (attempt - 1)); return fetchHtml(url, attempt + 1); }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  } catch (e) {
    if (attempt <= 4) { await sleep(800 * 2 ** (attempt - 1)); return fetchHtml(url, attempt + 1); }
    throw e;
  }
}

// Pull the raw inner HTML of a <li class="List{Field}..."> row.
function liRaw(html, field) {
  const m = html.match(new RegExp(`<li class="List${field}[^"]*">([\\s\\S]*?)</li>`, 'i'));
  return m ? m[1] : null;
}

// Strip a leading label like "Date:" / "Medium:" / "Inv:" / "Location:" / "Image size:".
function unlabel(v) { return (v || '').replace(/^[A-Za-z][A-Za-z ]*:\s*/, '').trim(); }

// Artist: prefer the catalogued reference-link name(s); prepend a leading qualifier
// (e.g. "Circle of") if present; drop life-dates and trailing "Attributed to" etc.
function parseArtist(html) {
  const raw = liRaw(html, 'Artist');
  if (!raw) return 'Anonymous';
  const names = [...raw.matchAll(/<span class="tspReferenceLink">([\s\S]*?)<\/span>/g)].map(m => strip(m[1])).filter(Boolean);
  // leading qualifier: a tspValue that appears BEFORE the first reference link (e.g. "Circle of", "Studio of", "After", "Follower of")
  let qualifier = '';
  const firstLink = raw.indexOf('tspReferenceLink');
  const head = firstLink >= 0 ? raw.slice(0, firstLink) : raw;
  const qm = head.match(/<span class="tspValue">([\s\S]*?)<\/span>/);
  if (qm) { const q = strip(qm[1]); if (/^(circle of|studio of|workshop of|after|follower of|manner of|attributed to|school of|style of|imitator of|in the style of)$/i.test(q)) qualifier = q; }
  if (names.length) {
    const joined = names.join('; ');
    return qualifier ? `${qualifier} ${joined}` : joined;
  }
  // No reference link → anonymous / un-linked maker text. Use plain text minus life-dates.
  const txt = strip(raw).replace(/\(\s*[\d–−\- ]*\d{3,4}\s*\)/g, '').replace(/,?\s*(attributed to|perhaps|probably)\s*$/i, '').trim();
  if (!txt || /^(artist\s+unknown|unknown|anonymous|unidentified|n\/?a)$/i.test(txt)) return 'Anonymous';
  return txt;
}

// Year from a date string: handle "1864", "about 1837", "ca. 1826", "1835 - 1840",
// "184[6]" (bracketed uncertain digit), "1780s" / "late 1780s" (decade),
// "early 18th century", "mid-17th century". Returns earliest plausible start year.
function parseYear(dateStr) {
  if (!dateStr) return null;
  let s = dateStr.toLowerCase().replace(/[\[\]]/g, '');               // "184[6]" → "1846"
  const explicit = s.match(/\b(1[0-9]{3}|20[0-2][0-9])\b/);           // a real 4-digit year (also matches the "178" of "1780s" below via decade rule first)
  const decade = s.match(/\b(1[0-9]{2}0|20[0-2]0)s\b/);               // "1780s" → 1780
  if (decade) return Number(decade[1]);
  if (explicit) return Number(explicit[1]);
  const cm = s.match(/\b(\d{1,2})(?:st|nd|rd|th)\s+century\b/);       // "18th century"
  if (cm) {
    const c = Number(cm[1]);
    let base = (c - 1) * 100;                                         // 18th century → 1700
    if (/\bearly\b/.test(s)) base += 5;
    else if (/\bmid|middle\b/.test(s)) base += 40;
    else if (/\blate\b/.test(s)) base += 75;
    return base;
  }
  return null;
}

// A *primary* flat-art medium: the medium string must START with (or be entirely) a
// 2-D technique, so "Gold, enamel and gouache, chased" (a gold box) is NOT admitted
// while "Enamel on copper" / "Watercolour on ivory" / "Oil on canvas" are.
function flatMediumCategory(medium) {
  const m = (medium || '').toLowerCase().trim();
  if (!m) return null;
  if (/^oil\b/.test(m)) return 'painting';
  if (/^(water-?colour|gouache|bodycolour|painted on (ivory|vellum|card|paper)|enamel on copper)\b/.test(m)) return 'miniature';
  if (/^(pastel|chalk|pencil|ink|crayon|charcoal|red chalk|black chalk)\b/.test(m)) return 'drawing';
  if (/^tempera\b/.test(m)) return 'painting';
  return null;
}

// Category from the fresh accession prefix (authoritative at Wallace) refined by medium;
// for accessions without the P/M/L prefix (e.g. recent acquisitions "2007.x"), fall back
// to a STRICT primary-medium test so genuine miniatures/paintings are still captured.
function categoryFor(accession, medium) {
  const pm = (accession || '').trim().toUpperCase().match(/^([A-Z]+)/);
  const pfx = pm ? pm[1] : '';
  const med = (medium || '').toLowerCase();
  if (pfx === 'P') {
    if (/^(water-?colour|gouache|chalk|pastel|pencil|ink|crayon|charcoal)/.test(med.trim()) && !/oil/.test(med)) return 'drawing';
    return 'painting';
  }
  if (pfx === 'M') return 'miniature';
  if (pfx === 'L') return 'painting'; // single loan = watercolour portrait, catalogued as a picture
  return flatMediumCategory(medium); // no flat-art prefix → admit only by primary 2-D medium
}

async function r2Exists(key) { try { await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key })); return true; } catch { return false; } }
async function r2Upload(key, buf) {
  await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buf, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000' }));
}
async function downloadImage(url, attempt = 1) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
    if ((res.status === 429 || res.status >= 500) && attempt <= 4) { await sleep(800 * 2 ** (attempt - 1)); return downloadImage(url, attempt + 1); }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ct = res.headers.get('content-type') || '';
    const buf = Buffer.from(await res.arrayBuffer());
    if (!/image\//.test(ct)) throw new Error(`not-image ct=${ct}`);
    if (buf.length < 2048) throw new Error(`tiny: ${buf.length}B`);
    return buf;
  } catch (e) {
    if (attempt <= 4 && !/not-image|tiny/.test(e.message)) { await sleep(800 * 2 ** (attempt - 1)); return downloadImage(url, attempt + 1); }
    throw e;
  }
}

async function main() {
  console.log(`[wallace] mode=${LIMIT ? `pilot(${LIMIT})` : 'full'}  concurrency=${CONCURRENCY}`);

  // 1. Discovery list (P/M/L objectIds) from the prior room-display crawl.
  const prior = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'public/data/wallace-collection.json'), 'utf8'));
  const all = [];
  (prior.rooms || []).forEach(r => (r.artworks || []).forEach(a => all.push(a)));
  // Discovery uses cached fields ONLY to decide which objectIds are worth fetching.
  // Include: P/M/L accession prefix (paintings/miniatures/loan) OR a cached medium that
  // looks like primary flat art (catches recent acquisitions like "2007.x" with no prefix).
  // The fresh detail page re-decides scope authoritatively, so over-inclusion here is safe.
  const CACHE_FLAT = /^(oil|water-?colour|gouache|bodycolour|painted on (ivory|vellum|card|paper)|enamel on copper|pastel|chalk|tempera)/i;
  const seen = new Set();
  let ids = [];
  for (const a of all) {
    const id = String(a.collectionId || '').trim();
    if (!id || seen.has(id)) continue;
    const pm = (a.accessionNumber || '').trim().toUpperCase().match(/^([A-Z]+)/);
    const pfx = pm ? pm[1] : '';
    const flatByPrefix = pfx === 'P' || pfx === 'M' || pfx === 'L';
    const flatByMedium = CACHE_FLAT.test((a.medium || '').trim());
    if (flatByPrefix || flatByMedium) { seen.add(id); ids.push(id); }
  }
  console.log(`[wallace] discovery: ${ids.length} candidate objectIds to fetch fresh`);
  if (LIMIT) ids = ids.slice(0, Math.ceil(LIMIT * 1.25)); // overshoot a bit; some may drop

  const artworks = [];
  const failed = [];
  const skipped = [];
  let done = 0;

  async function processOne(id) {
    let html;
    try { html = await fetchHtml(detailUrlOf(id)); }
    catch (e) { failed.push({ id, reason: `detail: ${e.message}` }); done++; return; }

    const title = strip(liRaw(html, 'Titlepic') || liRaw(html, 'Title') || '');
    if (!title) { failed.push({ id, reason: 'no-title' }); done++; return; }

    const artist     = parseArtist(html);
    const dateStr    = unlabel(strip(liRaw(html, 'Datesall') || ''));
    const year       = parseYear(dateStr);
    const medium     = unlabel(strip(liRaw(html, 'Material') || ''));
    const dimensions = unlabel(strip(liRaw(html, 'Dimensions') || ''));
    const accession  = unlabel(strip(liRaw(html, 'Museumno') || ''));
    const location   = unlabel(strip(liRaw(html, 'Location') || ''));
    const place      = strip(liRaw(html, 'Placeartist') || '');

    const category = categoryFor(accession, medium);
    if (!category) { skipped.push({ id, accession, reason: 'out-of-scope-prefix' }); done++; return; }
    if (year == null) { failed.push({ id, accession, reason: `no-year (date="${dateStr}")` }); done++; return; }

    const origImg = imageUrlOf(id);
    const key = `artworks/${STEM}/${id}-${hash8(origImg)}-imageUrl.webp`;
    try {
      if (!await r2Exists(key)) {
        const buf = await downloadImage(origImg);
        const webp = await sharp(buf, { limitInputPixels: false })
          .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 85 }).toBuffer();
        await r2Upload(key, webp);
      }
      artworks.push({
        id: `wallace-${id}`,
        objectNumber: accession || `wallace-${id}`,
        title,
        artist,
        date: dateStr || (year != null ? String(year) : null),
        year,
        medium,
        dimensions,
        category,
        description: '',
        imageUrl: `${R2_PUBLIC}/${key}`,
        thumbnailUrl: `${BASE}/eMP/eMuseumPlus?service=ImageAsset&module=collection&objectId=${id}&resolution=mediumImageResolution`,
        onDisplay: !!location,
        displayLocation: location,
        sourceUrl: detailUrlOf(id),
        metadata: { emuseumObjectId: id, placeOfOrigin: place, dateText: dateStr },
        original_imageUrl: origImg,
      });
    } catch (e) {
      failed.push({ id, accession, imageUrl: origImg, reason: `image: ${e.message}` });
    } finally {
      done++;
      if (done % 25 === 0 || done === ids.length) {
        console.log(`[wallace] ${done}/${ids.length}  ok=${artworks.length}  skip=${skipped.length}  fail=${failed.length}`);
      }
    }
  }

  const queue = [...ids];
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      if (LIMIT && artworks.length >= LIMIT) return;
      const id = queue.shift(); if (!id) return;
      await processOne(id);
      await sleep(40);
    }
  }));

  const finalArtworks = LIMIT ? artworks.slice(0, LIMIT) : artworks;

  const out = {
    museum: 'The Wallace Collection',
    collection: LIMIT ? `Pilot ${finalArtworks.length} items` : 'Paintings & Miniatures',
    website: 'https://wallacelive.wallacecollection.org',
    source: 'wallacelive.wallacecollection.org eMuseumPlus — per-object detailView (ExternalInterface) + ImageAsset',
    scraped_date: '2026-05-27',
    total_count: finalArtworks.length,
    source_type: 'emuseumplus-html',
    artworks: finalArtworks,
  };
  fs.writeFileSync(path.join(REPO_ROOT, OUT_JSON), JSON.stringify(out, null, 2));
  console.log(`\n[wallace] wrote ${OUT_JSON} (${finalArtworks.length} artworks)`);

  if (failed.length) {
    const fp = path.join(REPO_ROOT, `scripts/.state/${STEM}-failed.ndjson`);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, failed.map(f => JSON.stringify(f)).join('\n'));
    console.log(`[wallace] failed log: ${fp} (${failed.length})`);
  }

  const cov = k => finalArtworks.filter(a => a[k] && (typeof a[k] === 'string' ? a[k].length : true)).length;
  console.log(`\n=== Coverage on ${finalArtworks.length} kept ===`);
  console.log(`  title ${cov('title')}  artist ${cov('artist')}  year ${finalArtworks.filter(a => a.year != null).length}  medium ${cov('medium')}  dim ${cov('dimensions')}  category ${cov('category')}`);
  const catDist = {}; finalArtworks.forEach(a => { catDist[a.category] = (catDist[a.category] || 0) + 1; });
  console.log(`  cat dist: ${JSON.stringify(catDist)}`);
  const anon = finalArtworks.filter(a => /^anonymous$/i.test(a.artist)).length;
  console.log(`  anonymous artist: ${anon}/${finalArtworks.length}`);
}

main().catch(e => { console.error(e); process.exit(1); });
