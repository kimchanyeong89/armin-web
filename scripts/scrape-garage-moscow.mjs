#!/usr/bin/env node
// Garage Museum of Contemporary Art (Moscow) — full collection scraper.
// Source: museum-OWN Next.js data endpoint (no auth), which cleanly proxies the JSON:API
//   collection backend (the raw api.garagemca.org returns 502 to direct curl — do NOT use it).
//   GET https://garagemca.org/_next/data/{buildId}/en/collection/catalogue/{CODE}.json
//   buildId is read fresh from __NEXT_DATA__ each run (it changes on every site redeploy).
//
// METADATA comes from the DETAIL record:
//   pageProps.initialState.collection.document.{CODE}.data
//   main entity = collectionThing OR collectionMedia (video lives under collectionMedia).
//     attributes: name(title), inv/slug/code(inventory), dateStr/dateFrom/dateTo(date),
//     medium, physicalDescription(dimensions), webUrlCollection(sourceUrl),
//     peopleRoles[] -> individual.{personId}.attributes.name (romanized artist).
//   category = kind slug leaf:  thing.painting -> painting, thing.photography -> photograph,
//     media.video -> video.  Everything else (thing/media installation, sculpture, …) DROPPED.
//   Title/medium/dimensions are RUSSIAN even on /en/ (artist names romanized, kind names EN) —
//     stored source-as-is per the scraping guide.
//
// IMAGE: file.{fileId}.attributes.previewLargeUrl = full-size 1200px-long-edge JPEG on
//   hb.bizmrg.com (verified CT418 = 1200x1614, clean unsigned). The file.attributes.url
//   "original" is a SIGNED .tif S3 link that 403s after expiry — do NOT use it.
//   We prefer the cover file; autocrop white-trim -> webp(2048/q85) -> R2.
//
// ENUMERATION: codes are CT#### (things) + CM#### (media), SEQUENTIAL with sparse 404 gaps
//   (e.g. CT1, CT200 are gaps). 394 total works. SSR listing embeds only 9 IDs and the rest
//   load via the 502-blocked API, so we iterate CT1..CT_MAX + CM1..CM_MAX against the
//   per-artwork _next/data endpoint, skipping {"notFound":true} 404s. Rate-limited.
//
// Usage:
//   node scripts/scrape-garage-moscow.mjs --classify              # dry-run: scope tally, no images
//   node scripts/scrape-garage-moscow.mjs --pilot --limit=20 --no-upload   # 20-rec metadata pilot, no R2
//   node scripts/scrape-garage-moscow.mjs --full                  # full scrape + R2 upload, write collection JSON

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

const SLUG = 'garage-moscow';
const COLLECTION_STEM = `${SLUG}-collection`;
const ORIGIN = 'https://garagemca.org';
const CATALOGUE_HTML = `${ORIGIN}/en/collection/catalogue`;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');

// Code-space bounds (probe: CT419 newest, CM55 seen, 394 total; headroom for fresh acquisitions).
const CT_MAX = 460;
const CM_MAX = 90;
const REQ_DELAY_MS = 900; // ~1 req/sec, polite

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : args.includes('--pilot') ? 'pilot' : 'classify';
const NO_UPLOAD = args.includes('--no-upload');
const limitArg = args.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : (MODE === 'pilot' ? 20 : Infinity);

const s3 = (process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY)
  ? new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
    })
  : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
// titles/medium occasionally carry inline HTML (<i>…</i>) — strip tags + collapse whitespace.
const stripHtml = (s) => (s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

// kind-slug leaf -> ARMIN category. Only these 3 leaves are in-scope; all else DROPPED
// (thing.installation, media.media_installation, thing.sculpture, …).
const KIND_TO_CATEGORY = {
  painting: 'painting',
  photography: 'photograph',
  video: 'video',
};

// ---------- buildId ----------
async function getBuildId() {
  const r = await fetch(CATALOGUE_HTML, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`catalogue HTML HTTP ${r.status}`);
  const html = await r.text();
  const m = html.match(/"buildId":"([^"]+)"/);
  if (!m) throw new Error('buildId not found in __NEXT_DATA__');
  return m[1];
}

// ---------- per-artwork fetch (skip 404 gaps) ----------
async function fetchRecord(buildId, code) {
  const url = `${ORIGIN}/_next/data/${buildId}/en/collection/catalogue/${code}.json`;
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (r.status === 404) return { gap: true };
      if (r.status === 410) return { gap: true };
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      if (j && j.pageProps && j.pageProps.notFound) return { gap: true };
      return { json: j, sourceUrl: `${ORIGIN}/en/collection/catalogue/${code}` };
    } catch (e) {
      if (att === 3) { console.log(`  [warn] ${code}: ${e.message} (skipping after 3 tries)`); return { gap: true }; }
      await sleep(500 * att);
    }
  }
}

// ---------- detail-record -> parsed fields ----------
function parseRecord(code, json, sourceUrl) {
  const doc = json?.pageProps?.initialState?.collection?.document;
  if (!doc) return null;
  const data = doc[code]?.data || Object.values(doc)[0]?.data;
  if (!data) return null;

  // main entity: thing (painting/photo/installation/sculpture) OR media (video/media-installation)
  const things = { ...(data.collectionThing || {}), ...(data.collectionMedia || {}) };
  const entries = Object.values(things);
  if (!entries.length) return null;
  // when multiple sub-things (series), pick the one matching this CODE
  let main = entries.find((v) => {
    const a = v?.attributes || {};
    return a.inv === code || a.slug === code;
  }) || entries[0];
  const attrs = main?.attributes || {};

  // category from kind-slug leaf
  const kindSlugs = Object.keys(data.kind || {});
  const leaf = kindSlugs.length ? kindSlugs[0].split('.').pop() : '';
  const category = KIND_TO_CATEGORY[leaf] || null;

  // artist: author/coauthor makers, romanized, skip nulls. The maker can be an INDIVIDUAL
  // (data.individual) OR a collective/GROUP (data.group, e.g. "Provmyza", "Urban Fauna Lab") —
  // both are sideloaded under different keys, so merge them or group-authored works lose the artist.
  const persons = { ...(data.individual || {}), ...(data.group || {}) };
  const people = (attrs.peopleRoles || [])
    .filter((r) => r && (r.webSection === 'authors' || /author/i.test(r.roleId || '')))
    .map((r) => (persons[r.personId]?.attributes?.name || '').trim())
    .filter(Boolean);
  const artist = [...new Set(people)].join('; ');

  const title = stripHtml(attrs.name);

  // year: prefer numeric dateFrom (may be "1996" or "1996-05-21"), else dateStr, else dateTo.
  const yearFrom = String(attrs.dateFrom || '').match(/\b(1[0-9]{3}|20[0-9]{2})\b/);
  const yearStrM = String(attrs.dateStr || '').match(/\b(1[0-9]{3}|20[0-9]{2})\b/);
  const yearTo = String(attrs.dateTo || '').match(/\b(1[0-9]{3}|20[0-9]{2})\b/);
  const ym = yearFrom || yearStrM || yearTo;
  const year = ym ? parseInt(ym[1], 10) : null;
  const dateStr = (attrs.dateStr || (year != null ? String(year) : '')).trim();

  const medium = stripHtml(attrs.medium);
  const dimensions = (attrs.physicalDescription || '').trim();
  const description = ''; // attrs.description is curator HTML in Russian — left empty (not a metadata field)

  // image: prefer the cover file's full-size 1200px previewLargeUrl
  const files = Object.values(data.file || {});
  let imgUrl = null;
  if (files.length) {
    const cover = files.find((f) => f?.attributes?.cover) || files.find((f) => f?.attributes?.couldBeCover) || files[0];
    imgUrl = cover?.attributes?.previewLargeUrl || cover?.attributes?.previewUrl || null;
  }

  return {
    id: code,
    objectNumber: (attrs.inv || code).trim(),
    title, artist, year, dateStr, medium, dimensions, category, description,
    imgUrl,
    sourceUrl: attrs.webUrlCollection || sourceUrl,
    kindLeaf: leaf,
  };
}

// ---------- crawl the bounded code-space ----------
async function crawl(buildId, { stopEarly = false } = {}) {
  // INTERLEAVE the two prefixes. CT (things) is mostly paintings/installations/objects with
  // sparse in-scope; CM (media) is dense with video. A CT-first scan would crawl all ~460 CT
  // codes before reaching any video, so the pilot's early-stop never fires quickly. Interleaving
  // 1:1 surfaces a painting+photo+video mix within the first dozens of hits.
  const codes = [];
  const max = Math.max(CT_MAX, CM_MAX);
  for (let i = 1; i <= max; i++) {
    if (i <= CT_MAX) codes.push(`CT${i}`);
    if (i <= CM_MAX) codes.push(`CM${i}`);
  }

  const parsed = [];
  let hits = 0, gaps = 0, inScope = 0;
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];
    const res = await fetchRecord(buildId, code);
    await sleep(REQ_DELAY_MS);
    if (res.gap) { gaps++; continue; }
    const p = parseRecord(code, res.json, res.sourceUrl);
    if (p) { parsed.push(p); hits++; if (p.category) inScope++; }
    if (hits % 25 === 0 && hits) console.log(`  …crawled ${i + 1}/${codes.length} (hits ${hits}, in-scope ${inScope}, gaps ${gaps})`);
    if (stopEarly && inScope >= LIMIT) {
      console.log(`  [pilot] reached ${LIMIT} in-scope records — stopping crawl early.`);
      break;
    }
  }
  console.log(`[crawl] done: ${hits} records (${inScope} in-scope), ${gaps} gaps (of ${codes.length} codes probed)`);
  return parsed;
}

// ---------- image: download full-size, autocrop, upload to R2 ----------
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
  const { buffer } = await autocropToWebp(src);
  const hash8 = sha(a.imgUrl).slice(0, 8);
  const key = `artworks/${COLLECTION_STEM}/${a.id}-${hash8}-imageUrl.webp`;
  if (s3 && !NO_UPLOAD) {
    await uploadR2(key, buffer);
    return { imageUrl: `${R2_PUBLIC}/${key}`, srcW: meta.width || null, srcH: meta.height || null };
  }
  // no-upload pilot: prove the image downloads+decodes full-size, but do not push to R2.
  return { imageUrl: null, srcW: meta.width || null, srcH: meta.height || null, skippedUpload: true };
}

// ---------- record assembly (min-4 guard: title/artist/year/category) ----------
function toArtwork(a, imageUrl) {
  if (!a.title || !a.artist || a.year == null || !a.category) return null;
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
    onDisplay: false,
    displayLocation: '',
    sourceUrl: a.sourceUrl,
    metadata: { code: a.id, kind: a.kindLeaf },
    original_imageUrl: a.imgUrl,
  };
}

function writeCollection(artworks, stem) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'Garage Museum of Contemporary Art',
    collection: 'Collection',
    website: 'https://garagemca.org/en/collection/',
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

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const buildId = await getBuildId();
  console.log(`[build] buildId = ${buildId}`);

  const parsed = await crawl(buildId, { stopEarly: MODE === 'pilot' });

  // classification tally
  const tally = {};
  let inScope = 0, outScope = 0, noImg = 0, dropMin4 = 0;
  const outKinds = {};
  for (const p of parsed) {
    if (p.category) { inScope++; tally[p.category] = (tally[p.category] || 0) + 1; if (!p.imgUrl) noImg++; }
    else { outScope++; outKinds[p.kindLeaf || '(none)'] = (outKinds[p.kindLeaf || '(none)'] || 0) + 1; }
  }
  console.log('\n[classify] total records:', parsed.length);
  console.log('[classify] in-scope:', inScope, '| out-of-scope:', outScope, '| in-scope missing image:', noImg);
  console.log('[classify] in-scope breakdown:', tally);
  console.log('[classify] out-of-scope kinds:', outKinds);
  for (const p of parsed) if (p.category && (!p.title || !p.artist || p.year == null)) dropMin4++;
  console.log('[classify] in-scope records that would DROP on min-4 (missing title/artist/year):', dropMin4);

  if (MODE === 'classify') {
    const ex = parsed.filter((p) => p.category && (!p.title || !p.artist || p.year == null)).slice(0, 15);
    console.log('\n[classify] sample in-scope DROPS:');
    for (const p of ex) console.log('   -', p.id, JSON.stringify({ t: p.title, a: p.artist, y: p.year }));
    return;
  }

  // in-scope, with image -> candidates
  let candidates = parsed.filter((p) => p.category && p.imgUrl);
  if (Number.isFinite(LIMIT)) candidates = candidates.slice(0, LIMIT);
  console.log(`\n[${MODE}] image-processing ${candidates.length} candidates${NO_UPLOAD ? ' (NO R2 upload)' : ' -> R2'} …`);

  const artworks = [];
  let done = 0, imgErr = 0;
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
        fs.appendFileSync(path.join(STATE_DIR, `${SLUG}-failed.ndjson`), JSON.stringify({ id: a.id, url: a.imgUrl, err: String(e.message || e) }) + '\n');
        if (imgErr <= 5) console.log(`  img err id=${a.id}: ${e.message}`);
      }
      if (++done % 25 === 0) console.log(`  …${done}/${candidates.length} (ok ${artworks.length}, imgErr ${imgErr})`);
    }
  }));

  artworks.sort((x, y) => {
    const px = x.id.replace(/\d+/, ''), py = y.id.replace(/\d+/, '');
    if (px !== py) return px < py ? -1 : 1;
    return parseInt(x.id.replace(/\D+/g, ''), 10) - parseInt(y.id.replace(/\D+/g, ''), 10);
  });
  // pilot writes to the real collection stem (validate-metadata reads {slug}-collection.json).
  const stem = COLLECTION_STEM;
  writeCollection(artworks, stem);
  console.log(`\n[${MODE}] DONE. collected ${artworks.length} | img errors ${imgErr} | min4-drops ${dropMin4}`);
  console.log(`[${MODE}] total in-scope offered = ${inScope}`);
  if (NO_UPLOAD) console.log('[pilot] NOTE: --no-upload set, imageUrl is null in output (R2 not written).');
}

main().catch((e) => { console.error(e); process.exit(1); });
