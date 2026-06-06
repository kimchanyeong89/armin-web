#!/usr/bin/env node
// Ashmolean Museum (Oxford) collection scraper.
// Platform: Oxford GLAM Digital "Online Collections" SPA (collections.ashmolean.org).
//   API base : https://prd-online.glamdigital.io/v2   (museum token "ash", no key)
//   Search   : GET /search/ash/catalogue?q=(webCategory.keyword:paintings)&from&size  → list (irn + multimedia summary)
//   Full rec : GET /item/ash-object-{irn}/full                                        → all metadata fields
//   Image    : https://dams.ashmus.ox.ac.uk/iiif/image/{resourceSpaceId}/full/max/0/default.jpg  (IIIF level0)
//
// Scope: flat visual art. webCategory totals = paintings 3742 / drawings 29736 / prints 131203.
//   Cap policy (COLLECTION_SCRAPING_GUIDE Phase C "수집 범위 정책"):
//   - PAINTINGS: collect ALL (no cap), image-bearing + published.  (~2947 imaged)
//   - DRAWINGS / PRINTS: HUGE categories (25k / 110k imaged) with no usable curatorial value flag
//     besides on-display (highlight/masterpiece facets return 0; `quality` is a photo-quality tag,
//     ~90% "Record shot", so it can't thin sensibly). Per the guide's HUGE-category rule, collect
//     the ON-DISPLAY subset only (onDisplayFilter.keyword:"Objects on display"): drawings 48 / prints 16.
//   All images pass a 400px long-edge gate (IIIF delivers ~1000px via full/max). See SOURCE_RESEARCH.
//
// Usage:  node scripts/scrape-ashmolean.mjs [--limit=N] [--concurrency=N]

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
const LIMIT       = args.limit ? Number(args.limit) : null;          // pilot: stop after N kept (testing only)
const CONCURRENCY = Number(args.concurrency || 4);
const MIN_EDGE    = 400;                                             // image-quality gate: long edge >= 400px
const STEM        = LIMIT ? 'ashmolean-pilot-collection' : 'ashmolean-collection';
const OUT_JSON    = `public/data/${STEM}.json`;
const REPO_ROOT   = path.resolve(fileURLToPath(import.meta.url), '../..');
const UA          = 'Mozilla/5.0 (compatible; armin-museum-research/1.0)';

const API   = 'https://prd-online.glamdigital.io/v2';
const IIIF  = 'https://dams.ashmus.ox.ac.uk/iiif/image';   // {rsId}/full/max/0/default.jpg
const SRCBASE = 'https://collections.ashmolean.org/object'; // {irn}

const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const hash8 = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 8);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// webCategory → our enum (flat visual art only)
const CAT_MAP = {
  paintings: 'painting',
  drawings: 'drawing',
  prints: 'print',
  photographs: 'photograph',
};

const REST_HEADERS = { 'User-Agent': UA, Accept: 'application/json', Origin: 'https://www.ashmolean.org', Referer: 'https://www.ashmolean.org/' };

async function fetchJson(url, attempt = 1) {
  let res;
  try { res = await fetch(url, { headers: REST_HEADERS }); }
  catch (e) { if (attempt <= 4) { await sleep(800 * 2 ** (attempt - 1)); return fetchJson(url, attempt + 1); } throw e; }
  if ((res.status === 429 || res.status >= 500) && attempt <= 4) { await sleep(800 * 2 ** (attempt - 1)); return fetchJson(url, attempt + 1); }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function r2Exists(key) { try { await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key })); return true; } catch { return false; } }
async function r2Upload(key, buf) {
  await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buf, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000' }));
}

// Known DAMS "no image"/error placeholders accumulate here once detected (hash of original bytes).
const PLACEHOLDER_SHA = new Set();
async function downloadImage(url, attempt = 1) {
  let res;
  try { res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' }); }
  catch (e) { if (attempt <= 4) { await sleep(800 * 2 ** (attempt - 1)); return downloadImage(url, attempt + 1); } throw e; }
  if ((res.status === 429 || res.status >= 500) && attempt <= 4) { await sleep(800 * 2 ** (attempt - 1)); return downloadImage(url, attempt + 1); }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ct = res.headers.get('content-type') || '';
  if (!ct.startsWith('image/')) throw new Error(`not-image: ${ct}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 2048) throw new Error(`tiny: ${buf.length}B`);
  if (PLACEHOLDER_SHA.has(crypto.createHash('sha256').update(buf).digest('hex'))) throw new Error('placeholder');
  return buf;
}

// ---- field extraction from /item/{id}/full ----------------------------------
function pickTitle(full) {
  if (full.header && String(full.header).trim()) return String(full.header).trim();
  const t = (full.objectTitle || []).find(x => x.title && String(x.title).trim());
  return t ? String(t.title).trim() : '';
}
function pickArtist(full) {
  const persons = full.persons || [];
  const makers = persons.filter(p => /artist|maker/i.test(p.roleCategory || p.role || ''));
  const pool = makers.length ? makers : persons;
  const names = pool.map(p => (p.displayName || '').trim()).filter(Boolean);
  // de-dupe preserving order
  const seen = new Set(); const uniq = [];
  for (const n of names) { const k = n.toLowerCase(); if (!seen.has(k)) { seen.add(k); uniq.push(n); } }
  return uniq.join('; ');
}
function pickYear(full) {
  const dp = (full.datePeriod || [])[0] || {};
  // dp.from/to may be a short signed year for BCE works (e.g. "-30" = 30 BCE), so allow 1–4 digits.
  for (const v of [dp.from, dp.to]) {
    if (v != null) { const m = String(v).match(/^-?\d{1,4}$/); if (m) return Number(m[0]); }
  }
  // dp.preview is human text ("30 BCE - 30 CE", "1810"); take its first year, honouring BCE.
  if (dp.preview) {
    const p = String(dp.preview);
    const m = p.match(/(\d{1,4})\s*BCE?\b/i) || p.match(/\b(\d{3,4})\b/);
    if (m) return /BCE\b/i.test(p.slice(m.index)) ? -Number(m[1]) : Number(m[1]);
  }
  // dp.century is like "early 19th century (1801 - 1900)" — take the parenthetical start year, not "19".
  if (dp.century) { const m = String(dp.century).match(/\((\d{3,4})/); if (m) return Number(m[1]); }
  // Fallback: the date text line of the subheader ("Artist\n<date>\nAccessionNo"). Skip the
  // accession line (digits glued to letters/dots, e.g. "WA1939.52", "EA1965.67") so we never
  // mistake an inventory number for a creation year. Catch decades like "1870s" too.
  for (const line of String(full.subheader || '').split('\n')) {
    if (/[A-Za-z]\d|\d[.]/.test(line)) continue;          // looks like an accession number → skip
    const m = line.match(/\b(\d{3,4})(?=s?\b)/);
    if (m) return Number(m[1]);
  }
  return null;
}
function pickDate(full) {
  const dp = (full.datePeriod || [])[0] || {};
  return dp.preview || (dp.from ? String(dp.from) : '') || '';
}
function pickMedium(full) {
  const arr = (full.materialAndProcess || []).map(m => (m.display || m.previewTxt || '').trim()).filter(Boolean);
  const seen = new Set(); const uniq = [];
  for (const m of arr) { const k = m.toLowerCase(); if (!seen.has(k)) { seen.add(k); uniq.push(m); } }
  return uniq.join('; ');
}
function pickDimensions(full) {
  // dimensionsVirtualField is a multi-line string; keep object line(s), drop the "frame ..." line.
  const raw = (full.dimensionsVirtualField || '').trim();
  if (!raw) return '';
  const lines = raw.split('\n').map(s => s.trim()).filter(Boolean);
  const obj = lines.filter(l => !/^frame\b/i.test(l) && !/^mount\b/i.test(l));
  return (obj.length ? obj : lines).join(' × ').replace(/\s+/g, ' ').trim();
}
function pickObjectNumber(full, irn) {
  const on = (full.objectNumbers || [])[0] || {};
  return on.displayAccNo || on.NumberVrt || full.objectNumberSorting1 || irn;
}

// Page through ONE search query (no cap), collecting image-bearing + published candidates.
// Stable sort by the unique key `irn` — _score has ties, which makes `from` paging skip/repeat
// docs. irn asc gives monotonic, non-overlapping pages.
async function listQuery(label, lucene, seenIrn, candidates) {
  const PAGE = 100;
  let from = 0, total = null, scanned = 0, before = candidates.length;
  const q = encodeURIComponent(lucene);
  while (true) {
    const url = `${API}/search/ash/catalogue?q=${q}&from=${from}&size=${PAGE}&sortBy=irn&sortDirection=asc`;
    let data;
    try { data = await fetchJson(url); }
    catch (e) {
      console.warn(`[ashmolean] ${label} search from=${from} err: ${e.message}`);
      if (candidates.length === before) throw new Error(`${label} listing failed at start: ${e.message}`);
      break;
    }
    if (total == null) { total = data.total; console.log(`[ashmolean] ${label} total=${total}`); }
    const results = data.results || [];
    if (!results.length) break;
    for (const r of results) {
      scanned++;
      const it = r.item || {};
      if (!it.irn || seenIrn.has(it.irn)) continue;
      const mm = (it.multimedia || []).find(m => m && m.resourceSpaceId && String(m.resourceSpaceId).trim() && m.isPublished === 'Yes');
      if (!mm) continue;
      seenIrn.add(it.irn);
      candidates.push({ irn: it.irn, id: it.id, rsId: String(mm.resourceSpaceId).trim(), recordTitle: it.recordTitle || '' });
    }
    if (from % 1000 === 0) console.log(`[ashmolean] ${label} listing: scanned=${scanned}/${total}  imaged-candidates=${candidates.length - before}`);
    from += PAGE;
    if (from >= total) break;
    await sleep(120);
  }
  console.log(`[ashmolean] ${label} done: ${candidates.length - before} imaged+published candidates (scanned ${scanned}/${total})`);
}

async function main() {
  console.log(`[ashmolean] mode=${LIMIT ? `pilot(${LIMIT})` : 'full (paintings:all + drawings/prints:on-display)'}  concurrency=${CONCURRENCY}`);

  // 1. Build candidate list. PAINTINGS: all image-bearing+published. DRAWINGS/PRINTS: on-display only.
  const candidates = [];   // { irn, id, rsId, recordTitle }
  const seenIrn = new Set();   // de-dupe across queries + paging
  const QUERIES = [
    ['paintings', '(webCategory.keyword:paintings)'],
    ['drawings(on-display)', '(webCategory.keyword:drawings) AND (onDisplayFilter.keyword:"Objects on display")'],
    ['prints(on-display)', '(webCategory.keyword:prints) AND (onDisplayFilter.keyword:"Objects on display")'],
  ];
  for (const [label, lucene] of QUERIES) {
    await listQuery(label, lucene, seenIrn, candidates);
    if (LIMIT && candidates.length >= LIMIT) break;
  }
  const WANT = LIMIT || candidates.length;   // no cap: keep every candidate that passes detail+image gates
  console.log(`[ashmolean] listing done: ${candidates.length} total imaged candidates`);

  // 2. For each candidate: fetch full record (detail-page completeness), upload image, build entry.
  const artworks = [];
  const failed = [];
  let done = 0;

  async function processOne(c) {
    if (artworks.length >= WANT) return;
    const fullUrl = `${API}/item/${c.id}/full`;
    let full;
    try { full = await fetchJson(fullUrl); }
    catch (e) { failed.push({ irn: c.irn, reason: `full: ${e.message}` }); done++; return; }

    const category = CAT_MAP[(full.webCategory || '').toLowerCase().trim()];
    if (!category) { failed.push({ irn: c.irn, reason: `cat: ${full.webCategory}` }); done++; return; }

    const title = pickTitle(full);
    if (!title) { failed.push({ irn: c.irn, reason: 'no-title' }); done++; return; }

    let artist = pickArtist(full);
    if (!artist) artist = 'Anonymous';   // genuine: site lists no person for the work
    const year = pickYear(full);
    if (year == null) { failed.push({ irn: c.irn, reason: 'no-year' }); done++; return; }   // 4-must: drop dateless records
    const medium = pickMedium(full);
    const dimensions = pickDimensions(full);

    const imageUrl = `${IIIF}/${c.rsId}/full/max/0/default.jpg`;
    const key = `artworks/${STEM}/${c.irn}-${hash8(imageUrl)}-imageUrl.webp`;
    try {
      if (!await r2Exists(key)) {   // resumable: skip re-download if R2 already has this image
        const buf = await downloadImage(imageUrl);
        const img = sharp(buf, { limitInputPixels: false });
        const meta = await img.metadata();
        if (Math.max(meta.width || 0, meta.height || 0) < MIN_EDGE) throw new Error(`small: ${meta.width}x${meta.height}`);
        const webp = await img
          .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 85 }).toBuffer();
        await r2Upload(key, webp);
      }
      if (artworks.length >= WANT) return;  // re-check after async work
      artworks.push({
        id: c.irn,
        objectNumber: pickObjectNumber(full, c.irn),
        title,
        artist,
        date: pickDate(full) || (year != null ? String(year) : null),
        year,
        medium,
        dimensions,
        category,
        description: (full.creditLine || '').trim(),
        imageUrl: `${R2_PUBLIC}/${key}`,
        thumbnailUrl: `${IIIF}/${c.rsId}/full/max/0/default.jpg`,
        onDisplay: !!(full.currentLocationDisplay && !/not on display/i.test(full.currentLocationDisplay)),
        displayLocation: full.currentLocationDisplay && !/not on display/i.test(full.currentLocationDisplay) ? full.currentLocationDisplay : '',
        sourceUrl: full.referenceURL || `${SRCBASE}/${c.irn}`,
        metadata: {
          ashIrn: c.irn,
          resourceSpaceId: c.rsId,
          department: full.department || '',
          webCategory: full.webCategory || '',
          objectName: (full.objectNames || [])[0]?.objectName || '',
          provenance: (full.geographicalProvenance || []).map(g => g.continent || g.country || g.preview).filter(Boolean).join(', '),
          iiifManifest: `https://dams.ashmus.ox.ac.uk/iiif/${c.rsId}/manifest`,
        },
        original_imageUrl: imageUrl,
      });
    } catch (e) {
      failed.push({ irn: c.irn, imageUrl, reason: e.message });
    } finally {
      done++;
      if (done % 50 === 0 || done === candidates.length) {
        console.log(`[ashmolean] ${done}/${candidates.length}  kept=${artworks.length}  fail=${failed.length}`);
      }
    }
  }

  const queue = [...candidates];
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      if (artworks.length >= WANT) return;
      const c = queue.shift(); if (!c) return;
      await processOne(c);
    }
  }));

  const finalArtworks = artworks.slice(0, WANT);
  const catDistFinal = {};
  finalArtworks.forEach(a => { catDistFinal[a.category] = (catDistFinal[a.category] || 0) + 1; });

  // 3. Write JSON
  const out = {
    museum: 'Ashmolean Museum',
    collection: LIMIT ? `Pilot ${finalArtworks.length}` : 'Paintings (all) + on-display drawings & prints',
    website: 'https://collections.ashmolean.org',
    source: 'GLAM Digital Online Collections API (prd-online.glamdigital.io/v2 search + /item/full) + DAMS IIIF images (dams.ashmus.ox.ac.uk)',
    scraped_date: '2026-06-03',
    total_count: finalArtworks.length,
    source_type: 'glamdigital-api+iiif',
    reason: `Ashmolean in-scope flat art: paintings 3742 / drawings 29736 / prints 131203 (photographs 0). Cap policy: PAINTINGS collected in full (all image-bearing + published, ${catDistFinal.painting || 0} kept). DRAWINGS & PRINTS are huge categories (25k / 110k imaged) with no usable curatorial value flag (no highlight/masterpiece facet; the only photo-quality tag is ~90% "Record shot") — per guide HUGE-category rule, only the ON-DISPLAY subset was collected (onDisplayFilter="Objects on display": drawings 48 / prints 16 on the source). Excluded: the ~25k stored drawings and ~110k stored prints not on gallery display, plus any image failing the 400px long-edge / placeholder / broken gate. Images delivered via IIIF full/max (~1000px long edge).`,
    artworks: finalArtworks,
  };
  const outPath = path.join(REPO_ROOT, OUT_JSON);
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`\n[ashmolean] wrote ${outPath} (${finalArtworks.length} artworks)`);

  if (failed.length) {
    const failPath = path.join(REPO_ROOT, `scripts/.state/${STEM}-failed.ndjson`);
    fs.mkdirSync(path.dirname(failPath), { recursive: true });
    fs.writeFileSync(failPath, failed.map(f => JSON.stringify(f)).join('\n'));
    console.log(`[ashmolean] failed log: ${failPath} (${failed.length} items)`);
  }

  // 4. Coverage
  const cov = k => finalArtworks.filter(a => a[k] && (typeof a[k] === 'string' ? a[k].length : true)).length;
  const n = finalArtworks.length || 1;
  console.log(`\n=== Coverage on ${finalArtworks.length} kept ===`);
  console.log(`  title:      ${cov('title')}/${finalArtworks.length}`);
  console.log(`  artist:     ${cov('artist')}/${finalArtworks.length}  (Anonymous: ${finalArtworks.filter(a => a.artist === 'Anonymous').length})`);
  console.log(`  year:       ${finalArtworks.filter(a => a.year != null).length}/${finalArtworks.length}`);
  console.log(`  medium:     ${cov('medium')}/${finalArtworks.length}`);
  console.log(`  dimensions: ${cov('dimensions')}/${finalArtworks.length}`);
  console.log(`  category:   ${cov('category')}/${finalArtworks.length}`);
  console.log(`  cat dist:   ${JSON.stringify(catDistFinal)}`);
}

main().catch(e => { console.error(e); process.exit(1); });
