#!/usr/bin/env node
// Hirshhorn Museum and Sculpture Garden (Washington DC) — collection scraper.
// Source: Smithsonian Open Access (museum-OWN, CC0). Unit code HMSG.
//   PRIMARY  = key-free AWS S3 open-data dump (line-delimited EDAN JSON), 256 hash shards:
//              https://smithsonian-open-access.s3-us-west-2.amazonaws.com/metadata/edan/hmsg/{00..ff}.txt
//   (The api.si.edu REST endpoint serves the SAME records but needs a free api.data.gov key;
//    DEMO_KEY is hard rate-limited and there is no SI_API_KEY in .env.local, so we use the dump.
//    Set SI_API_KEY in .env.local + run with --api to switch to the REST path if ever preferred.)
//
// Metadata comes from the DETAIL record (EDAN `content`):
//   title                                   → r.title
//   artist  freetext.name[]  label Artist|Attributed to|Formerly attributed to  (RAW, source format)
//   date    freetext.date[0].content "(c. 1880-1882)"  (+ indexedStructured.date "1880s" fallback)
//   medium/dimensions  freetext.physicalDescription[]  {label:Medium}{label:Dimensions}
//   objectNumber       freetext.identifier[]  {label:Accession Number}
//   id                 descriptiveNonRepeating.record_ID  (stable, e.g. "hmsg_83.10"; NOT prefixed here)
//   sourceUrl          descriptiveNonRepeating.guid (ark URL)
// Full image = built from media[0].idsId via the Smithsonian IIIF Image API:
//   https://ids.si.edu/ids/iiif/{idsId}/full/2048,/0/default.jpg  (full-size, capped at native res).
//   ⚠️ The `resources[] "High-resolution JPEG"` download URL (ids/download?id=...jpg) is WAF-blocked
//   for automated clients (returns a 245-byte "Request Rejected" HTML stub / 307) AND is sometimes
//   lower-res than IIIF — so we use IIIF first, then media.content (deliveryService), then download.jpg.
//
// SCOPE (objectType label, singular):
//   Painting              → painting   (collect ALL, no cap)
//   Drawing               → drawing    (value-filtered)
//   Print, Print/portfolio→ print      (value-filtered)
//   Photograph            → photograph (value-filtered)
//   EXCLUDED: Sculpture, Sculpture/relief, Mech Repro, and any other 3D/object type.
// Value filter (non-paintings only): skip when the PRIMARY title is a study/sketch/copy/reproduction;
//   skip portrait miniatures (medium ivory|enamel|vellum + longest side ≤14cm). (None present, but guarded.)
//
// Usage:
//   node scripts/scrape-hirshhorn.mjs --classify        # dry-run: full scope tally (no images)
//   node scripts/scrape-hirshhorn.mjs --pilot --no-r2   # build ~20 in-scope, NO R2 upload, write pilot JSON
//   node scripts/scrape-hirshhorn.mjs --pilot           # ~100 in-scope + R2 upload, write pilot JSON
//   node scripts/scrape-hirshhorn.mjs --full            # full scrape + R2 upload, write collection JSON

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

const SLUG = 'hirshhorn';
const COLLECTION_STEM = `${SLUG}-collection`;
const S3_BASE = 'https://smithsonian-open-access.s3-us-west-2.amazonaws.com/metadata/edan/hmsg';
const API_BASE = 'https://api.si.edu/openaccess/api/v1.0';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : args.includes('--pilot') ? 'pilot' : 'classify';
const NO_R2 = args.includes('--no-r2');
const USE_API = args.includes('--api');
const PILOT_TARGET = NO_R2 ? 20 : 100;

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ---------- fetch layer ----------
async function fetchText(url) {
  for (let att = 1; att <= 4; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (r.status === 404) return '';                      // shard may not exist
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) { if (att === 4) throw e; await sleep(400 * att); }
  }
}

// PRIMARY: pull all 256 hash shards 00..ff (line-delimited EDAN JSON). Returns array of EDAN rows.
async function fetchAllFromS3() {
  const rows = [];
  let shardsWithData = 0;
  for (let i = 0; i < 256; i++) {
    const h = i.toString(16).padStart(2, '0');
    const txt = await fetchText(`${S3_BASE}/${h}.txt`);
    await sleep(60);
    if (!txt) continue;
    let n = 0;
    for (const line of txt.split('\n')) {
      const s = line.trim();
      if (!s) continue;
      try { rows.push(JSON.parse(s)); n++; } catch { /* skip unparseable line */ }
    }
    if (n) shardsWithData++;
    if ((i + 1) % 64 === 0) console.log(`  …shards ${i + 1}/256 (rows so far ${rows.length})`);
  }
  console.log(`[fetch] S3 dump: ${rows.length} HMSG records from ${shardsWithData} non-empty shards`);
  return rows;
}

// OPTIONAL: api.si.edu REST path (needs SI_API_KEY). Paginates start/rows.
async function fetchAllFromAPI() {
  const key = process.env.SI_API_KEY;
  if (!key) throw new Error('--api requires SI_API_KEY in .env.local (free at https://api.data.gov/signup)');
  const rows = [];
  const ROWS = 100;
  let start = 0, totalReported = null;
  while (true) {
    const url = `${API_BASE}/search?q=${encodeURIComponent('unit_code:HMSG')}&start=${start}&rows=${ROWS}&api_key=${key}`;
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!r.ok) throw new Error(`API HTTP ${r.status} @ start=${start}`);
    const j = await r.json();
    const resp = j.response || {};
    if (totalReported == null) { totalReported = resp.rowCount || 0; console.log(`[fetch] API rowCount=${totalReported}`); }
    const batch = resp.rows || [];
    if (!batch.length) break;
    rows.push(...batch);
    start += ROWS;
    if (start >= (totalReported || 0)) break;
    await sleep(300);
  }
  console.log(`[fetch] API: ${rows.length} HMSG records`);
  return rows;
}

// ---------- scope classifier (EDAN objectType label) ----------
// painting | drawing | print | photograph  (in-scope) or null (sculpture/3D/other).
function classifyType(objType) {
  const t = (objType || '').trim().toLowerCase();
  if (!t) return null;
  if (t === 'painting' || t.startsWith('painting/')) return 'painting';
  if (t === 'drawing' || t.startsWith('drawing/')) return 'drawing';
  if (t === 'print' || t.startsWith('print/') || t.startsWith('print ')) return 'print';
  if (t === 'photograph' || t.startsWith('photograph/')) return 'photograph';
  return null; // Sculpture, Sculpture/relief, Mech Repro, etc. → out of scope
}

// Value filter for NON-paintings: skip studies/sketches/copies + portrait miniatures.
// Returns a reason string to skip, or null to keep. Paintings are NEVER filtered.
function valueSkipReason(category, title, medium, dimensions) {
  if (category === 'painting') return null;
  // primary title segment = before the first "/" or "Verso" (double-sided works keep their recto work)
  const primary = String(title || '').split(/\s*\/\s*|\bverso\b/i)[0];
  if (/\b(study|sketch|copy|reproduction|preparatory|squeeze|rubbing|proof)\b/i.test(primary)) return 'study/sketch/copy';
  // portrait miniature: ivory/enamel/vellum (paint-led) + longest dim ≤ 14cm (none in HMSG, but guard)
  const med = String(medium || '').toLowerCase();
  if (/\b(ivory|enamel|vellum)\b/.test(med) && !/vellum\s+paper/.test(med)) {
    const cms = [...String(dimensions || '').matchAll(/([\d.]+)\s*(?:x|×|by)?\s*[\d.]*\s*cm/gi)].flatMap(m => [parseFloat(m[1])]);
    const nums = [...String(dimensions || '').matchAll(/([\d.]+)\s*cm/gi)].map(m => parseFloat(m[1]));
    const longest = Math.max(0, ...cms, ...nums);
    if (longest > 0 && longest <= 14) return 'portrait-miniature';
  }
  return null;
}

const yearFrom = (s) => { const m = String(s || '').match(/\b(1[0-9]{3}|20[0-9]{2})\b/); return m ? parseInt(m[1], 10) : null; };

// ---------- detail-record → ARMIN artwork ----------
function parseRecord(row) {
  const c = row.content || {};
  const ft = c.freetext || {};
  const dnr = c.descriptiveNonRepeating || {};
  const ix = c.indexedStructured || {};

  const objType = (ft.objectType && ft.objectType[0] && ft.objectType[0].content) || '';
  const category = classifyType(objType);

  // artist: keep ALL name entries labelled Artist / Attributed to / Formerly attributed to (source raw)
  const names = (ft.name || []).filter(Boolean);
  const artistEntries = names.filter((n) => /^(artist|attributed to|formerly attributed to|maker|designer|after)/i.test(n.label || ''));
  const picked = artistEntries.length ? artistEntries : names; // fall back to any named role
  const artist = picked.map((n) => String(n.content || '').trim()).filter(Boolean).join('; ');

  const title = String(row.title || '').trim();

  const dateStr = (ft.date && ft.date[0] && String(ft.date[0].content || '').trim()) || '';
  const ixDate = (ix.date && ix.date[0]) || '';
  const year = yearFrom(dateStr) ?? yearFrom(ixDate);

  let medium = '', dimensions = '';
  for (const pd of (ft.physicalDescription || [])) {
    if (pd.label === 'Medium' && !medium) medium = String(pd.content || '').trim();
    else if (pd.label === 'Dimensions' && !dimensions) dimensions = String(pd.content || '').trim();
  }

  let objectNumber = '';
  for (const idd of (ft.identifier || [])) {
    if (idd.label === 'Accession Number') { objectNumber = String(idd.content || '').trim(); break; }
  }

  const id = String(dnr.record_ID || row.id || '').trim();
  const sourceUrl = String(dnr.guid || '').trim() || (id ? `https://www.si.edu/object/${id.replace(/_/g, ':')}` : '');

  // image: build an ordered candidate list (IIIF full/2048 → deliveryService → download.jpg).
  // IIIF is the only consistently-unblocked, true-full-size endpoint; the others are fallbacks.
  const media = (dnr.online_media && dnr.online_media.media) || [];
  let imgCandidates = [], thumbUrl = null, srcW = null, srcH = null;
  if (media.length) {
    const m0 = media[0];
    thumbUrl = m0.thumbnail || m0.content || null;
    const idsId = m0.idsId || '';
    const resources = m0.resources || [];
    const hires = resources.find((r) => r.label === 'High-resolution JPEG' && r.url);
    if (hires) { srcW = hires.width || null; srcH = hires.height || null; }
    if (idsId) imgCandidates.push(`https://ids.si.edu/ids/iiif/${encodeURIComponent(idsId)}/full/2048,/0/default.jpg`);
    if (m0.content && !/_thumb\b/i.test(m0.content)) imgCandidates.push(m0.content); // deliveryService (scalable)
    if (hires) imgCandidates.push(hires.url);                                        // download.jpg (often WAF-blocked)
  }
  const imgUrl = imgCandidates[0] || null; // primary; processImage tries the rest on failure

  const skipReason = category ? valueSkipReason(category, title, medium, dimensions) : null;
  return { id, objectNumber, title, artist, year, dateStr, medium, dimensions, category, objType, imgUrl, imgCandidates, thumbUrl, srcW, srcH, sourceUrl, skipReason };
}

// ---------- image: download full-size, (no-trim) webp, upload to R2 ----------
// IDS host (ids.si.edu) has an IP-rate WAF that, once tripped, returns a 245-byte "Request Rejected"
// HTML stub (HTTP 200) for EVERY path until a cooldown. We pace gently + back off long on a WAF hit.
async function dl(url) {
  for (let att = 1; att <= 5; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const ct = r.headers.get('content-type') || '';
      const buf = Buffer.from(await r.arrayBuffer());
      if (ct.includes('text/html') || buf.slice(0, 64).toString('latin1').includes('Request Rejected')) {
        await sleep(4000 * att);                       // WAF cooldown grows: 4s,8s,12s,16s
        throw new Error('WAF-rejected (html stub)');
      }
      if (buf.length < 5000) throw new Error(`tiny ${buf.length}b`);
      return buf;
    } catch (e) { if (att === 5) throw e; await sleep(600 * att); }
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
  // try each candidate (IIIF → deliveryService → download.jpg) until one yields a real image.
  const sharp = (await import('sharp')).default;
  let src = null, usedUrl = null, lastErr = null;
  for (const url of (a.imgCandidates && a.imgCandidates.length ? a.imgCandidates : [a.imgUrl])) {
    if (!url) continue;
    try { src = await dl(url); usedUrl = url; break; } catch (e) { lastErr = e; }
  }
  if (!src) throw lastErr || new Error('no image candidate fetched');
  // NB: do NOT reject on small width — IIIF serves each work's native MAX res (some are <1024px,
  // capped at source). Only sanity-reject a clearly degenerate file.
  const meta = await sharp(src).metadata().catch(() => ({}));
  if (meta.width && Math.max(meta.width, meta.height) < 300) throw new Error(`too small ${meta.width}x${meta.height}`);
  const { buffer } = await autocropToWebp(src);            // autocrop OFF → pure webp(2048/q85)
  const hash8 = sha(usedUrl).slice(0, 8);
  const key = `artworks/${COLLECTION_STEM}/${a.id}-${hash8}-imageUrl.webp`;
  await uploadR2(key, buffer);
  return { imageUrl: `${R2_PUBLIC}/${key}`, usedUrl, srcW: meta.width || a.srcW || null, srcH: meta.height || a.srcH || null };
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
    medium: a.medium || '',
    dimensions: a.dimensions || '',
    category: a.category,
    description: '',
    imageUrl,
    thumbnailUrl: a.thumbUrl || '',
    onDisplay: false,
    displayLocation: '',
    sourceUrl: a.sourceUrl,
    metadata: { unit_code: 'HMSG', record_ID: a.id, object_type: a.objType, license: 'CC0' },
    original_imageUrl: a.imgUrl,
  };
}

function writeCollection(artworks, stem) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'Hirshhorn Museum and Sculpture Garden',
    collection: 'Open Access Collection',
    website: 'https://hirshhorn.si.edu/collection/',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'api',
    license: 'CC0',
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
  const rows = USE_API ? await fetchAllFromAPI() : await fetchAllFromS3();
  const parsed = rows.map(parseRecord);

  // classification tally (full corpus)
  const tally = {}; const typeTally = {};
  let inScope = 0, outScope = 0, noImg = 0, valueSkip = 0, dropMin4 = 0;
  for (const p of parsed) {
    typeTally[p.objType || '(none)'] = (typeTally[p.objType || '(none)'] || 0) + 1;
    if (!p.category) { outScope++; continue; }
    if (p.skipReason) { valueSkip++; continue; }
    inScope++;
    tally[p.category] = (tally[p.category] || 0) + 1;
    if (!p.imgUrl) noImg++;
    if (!p.title || !p.artist || p.year == null) dropMin4++;
  }
  console.log('\n[classify] total parsed:', parsed.length);
  console.log('[classify] objectType vocab:', typeTally);
  console.log('[classify] in-scope (kept):', inScope, '| out-of-scope (3D/other):', outScope, '| value-skipped:', valueSkip, '| in-scope missing image:', noImg);
  console.log('[classify] in-scope breakdown:', tally);
  console.log('[classify] in-scope that would DROP on min-4 (missing title/artist/year):', dropMin4);

  if (MODE === 'classify') {
    const ex = parsed.filter((p) => !p.category).slice(0, 12);
    console.log('\n[classify] sample EXCLUDED (objectType | title):');
    for (const p of ex) console.log('   -', JSON.stringify(p.objType), '|', p.title.slice(0, 50));
    const vs = parsed.filter((p) => p.category && p.skipReason).slice(0, 12);
    console.log('\n[classify] sample VALUE-SKIPPED:');
    for (const p of vs) console.log('   -', p.skipReason, '|', p.category, '|', p.title.slice(0, 50));
    return;
  }

  // in-scope, kept, with image → candidates
  let candidates = parsed.filter((p) => p.category && !p.skipReason && p.imgUrl);
  candidates.sort((x, y) => String(x.id).localeCompare(String(y.id)));
  if (MODE === 'pilot') candidates = candidates.slice(0, PILOT_TARGET);
  console.log(`\n[${MODE}] image-processing ${candidates.length} candidates${NO_R2 ? ' (NO R2 — metadata-only)' : ' → R2'} …`);

  const artworks = [];
  let done = 0, imgErr = 0;

  if (NO_R2) {
    // metadata-only pilot: validate parsing + min-4 without touching R2/images
    for (const a of candidates) {
      const w = toArtwork(a, a.imgUrl); // use source url as stand-in imageUrl for the pilot file
      if (w) artworks.push(w); else dropMin4++;
    }
  } else {
    // gentle pacing: 2 workers + a small stagger per fetch, to stay under the IDS WAF rate limit.
    const CONC = 2;
    let idx = 0;
    await Promise.all(Array.from({ length: CONC }, async () => {
      while (idx < candidates.length) {
        const a = candidates[idx++];
        await sleep(350);
        try {
          const { imageUrl, usedUrl } = await processImage(a);
          a.imgUrl = usedUrl || a.imgUrl;             // original_imageUrl = the URL that actually worked
          const w = toArtwork(a, imageUrl);
          if (w) artworks.push(w); else dropMin4++;
        } catch (e) {
          imgErr++;
          fs.appendFileSync(path.join(STATE_DIR, `${SLUG}-failed.ndjson`), JSON.stringify({ id: a.id, url: a.imgUrl, err: String(e.message || e) }) + '\n');
          if (imgErr <= 5) console.log(`  img err id=${a.id}: ${e.message}`);
        }
        if (++done % 50 === 0) console.log(`  …${done}/${candidates.length} (ok ${artworks.length}, imgErr ${imgErr})`);
      }
    }));
  }

  artworks.sort((x, y) => String(x.id).localeCompare(String(y.id)));
  const stem = MODE === 'pilot' ? `${COLLECTION_STEM}-pilot` : COLLECTION_STEM;
  writeCollection(artworks, stem);
  console.log(`\n[${MODE}] DONE. collected ${artworks.length} | img errors ${imgErr} | min4-drops ${dropMin4}`);
  console.log(`[${MODE}] total in-scope offered = ${inScope}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
