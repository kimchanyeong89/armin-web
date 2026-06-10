#!/usr/bin/env node
// Vietnam National Fine Arts Museum (Bảo tàng Mỹ thuật Việt Nam, Hanoi) — collection scraper.
// Probe: scripts/.state/b4-probes/vnfam-hanoi.json
//
// SOURCES (both museum-own, keys public in the vnfam.vn JS bundle — allowed per task rules):
//   1. Algolia catalogue index (the SPA's search backend) — ONE query returns all 281 records:
//      POST https://XENWTU7FRZ-dsn.algolia.net/1/indexes/production_artifact/query
//      → objectID, name_vi/name_en, authorNames, category_en/category_vi (medium),
//        image (full-res CloudFront URL), imageDimensions, code (inventory no), publishedLanguages.
//   2. GraphQL detail backend (what the SPA's artifact DETAIL page calls — detail-page
//      completeness rule): POST https://api.imuseum.vn/graphql, X-Api-Key from bundle,
//      artifact(_id) → date, dimensions, description (Algolia has none of these).
//      Records published only in "vi" REFUSE Accept-Language:en ("You are not allowed to get
//      artifact") → retry with Accept-Language:vi (verified live).
//
// SCOPE (281 total): flat art only, classified by the museum's own category_en/category_vi.
//   painting  = Oil/Sơn dầu, Lacquer/Sơn mài, Silk/Lụa, Gouache/Bột màu, Watercolour/Màu nước,
//               Sculpture painting/Sơn khắc (carved-lacquer PANEL — flat signature technique)
//   print     = Woodcut/Khắc gỗ, Zinc engraving/Khắc kẽm, Etching, Plastercut/Khắc thạch cao,
//               Unique print/In độc bản, Paper/Giấy (= Đông Hồ & Hàng Trống folk woodblock
//               prints + posters — verified by titles: Rooster and hen, Master toad, …)
//   drawing   = Ink/Mực;  mixed_media_2d = Mixed media/Tổng hợp
//   EXCLUDED  = Copper/Đồng (bronze statues), Wood/Gỗ, Ceramic/Gốm, Plaster/Thạch cao,
//               Metal, Textile/Vải, Composite, Lacquered wood (lacquered OBJECTS), stoneware.
//   B&W reproductive prints skipped at download (Hasler-Süsstrunk colorfulness < 20, prints
//   only — drawings always kept; no photographs in this corpus). Min-4 drops (no year/artist
//   on the museum site — verified the detail pages show nothing either) are skipped, never
//   backfilled. Long side < 400px skipped (low-quality digitisation).
//
// IMAGES: record.image is a full-res original on the museum's CloudFront CDN
//   (d1fbzwhbgcf4vf.cloudfront.net/<sha256>.jpeg; the SPA appends "/800x,q50" for thumbs,
//   bare URL = original, verified to 6360px). → autocropToWebp (no trim) → R2.
//
// sourceUrl: https://vnfam.vn/artifact/{objectID} (EN route, verified to render).
//   vi-only records get the site's vi-locale URL /hiện-vật/{objectID} — note: the museum's
//   OWN router currently 404s direct loads of the unicode route (their bug), but it is the
//   record's canonical address and the only locale the record is published in.
//
// Usage:
//   node scripts/scrape-vnfam-hanoi.mjs --probe   # first ~20 in-scope works end-to-end → *-probe.json
//   node scripts/scrape-vnfam-hanoi.mjs --full    # everything in-scope, resumable
//
// Resume (--full): terminal outcomes (ok/skip) append to scripts/.state/vnfam-hanoi-results.ndjson
//   and are replayed on re-run; hard failures → vnfam-hanoi-failed.ndjson (retried next run);
//   counters → vnfam-hanoi-progress.json. Corpus is 281 records (~200 in-scope) — far below
//   the 25k cap, so no prioritisation/size-cap logic is needed.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { autocropToWebp } from './lib/autocrop.mjs';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const REPO = path.resolve(fileURLToPath(import.meta.url), '../..');
require('dotenv').config({ path: path.join(REPO, '.env.local') });

const SLUG = 'vnfam-hanoi';
const COLLECTION_STEM = `${SLUG}-collection`;
const UA = 'armin-museum-research/1.0';
const ALGOLIA_URL = 'https://XENWTU7FRZ-dsn.algolia.net/1/indexes/production_artifact/query';
const ALGOLIA_HEADERS = {
  'Content-Type': 'application/json',
  'X-Algolia-Application-Id': 'XENWTU7FRZ',
  'X-Algolia-API-Key': 'ec760b87bbaef3aa98907f586a6924bb',   // anonymous search key from page bundle
  'User-Agent': UA,
};
const GRAPHQL_URL = 'https://api.imuseum.vn/graphql';
const GRAPHQL_KEY = '842b2156-21ed-4755-9737-b5b87f2e7e7d';   // public key from page bundle
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const DATA_DIR = path.join(REPO, 'public/data');

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : 'probe';
const PROBE_TARGET = 20;
const MIN_LONG_SIDE = 400;     // guide value-filter quality floor
const CF_TH = 20;              // B&W print colorfulness threshold
const CONC = 3;
const GAP_MS = 290;            // global politeness gap (~3.4 rps across all hosts)

const RESULTS_PATH = path.join(STATE_DIR, `${SLUG}-results.ndjson`);
const PROGRESS_PATH = path.join(STATE_DIR, `${SLUG}-progress.json`);
const FAILED_PATH = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);
const OUT_PATH = path.join(DATA_DIR, MODE === 'probe' ? `${COLLECTION_STEM}-probe.json` : `${COLLECTION_STEM}.json`);

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const stripTags = (s) => (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// global politeness gap (Algolia + GraphQL + CloudFront all behind one ~3.4 rps gate)
let nextSlot = 0;
async function politeGap() {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + GAP_MS;
  if (wait) await sleep(wait);
}

// ---------- source 1: Algolia catalogue (single query, 281 records) ----------
async function fetchCatalogue() {
  for (let att = 1; att <= 3; att++) {
    try {
      await politeGap();
      const r = await fetch(ALGOLIA_URL, {
        method: 'POST', headers: ALGOLIA_HEADERS,
        body: JSON.stringify({ query: '', hitsPerPage: 1000, attributesToRetrieve: ['*'] }),
      });
      if (!r.ok) throw new Error(`Algolia HTTP ${r.status}`);
      const j = await r.json();
      console.log(`[algolia] nbHits=${j.nbHits} hits=${j.hits.length}`);
      // deterministic order for resume/output (Algolia ranking order can shift)
      return j.hits.sort((a, b) => a.objectID.localeCompare(b.objectID));
    } catch (e) { if (att === 3) throw e; await sleep(1000 * att); }
  }
}

// ---------- source 2: GraphQL detail (date/dimensions/description) ----------
const DETAIL_QUERY = 'query($id:String!){ artifact(_id:$id){ _id name date dimensions description authors{name} category{name} } }';
async function gqlDetail(objectID, lang) {
  for (let att = 1; att <= 3; att++) {
    try {
      await politeGap();
      const r = await fetch(GRAPHQL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept-Language': lang, 'X-Api-Key': GRAPHQL_KEY, 'User-Agent': UA },
        body: JSON.stringify({ query: DETAIL_QUERY, variables: { id: objectID } }),
      });
      if (!r.ok) throw new Error(`GraphQL HTTP ${r.status}`);
      const j = await r.json();
      return (j.data && j.data.artifact) || null;   // null = not published in this language
    } catch (e) { if (att === 3) throw e; await sleep(800 * att); }
  }
}
// EN first; vi-only records refuse EN → retry vi (verified live)
async function fetchDetail(hit) {
  const langs = (hit.publishedLanguages || []).includes('en') ? ['en', 'vi'] : ['vi'];
  for (const lang of langs) {
    const d = await gqlDetail(hit.objectID, lang);
    if (d) return { detail: d, lang };
  }
  return { detail: null, lang: null };
}

// ---------- scope classifier (museum's own category_en/category_vi) ----------
function classify(catEn, catVi) {
  const en = (catEn || '').trim().toLowerCase().normalize('NFC');
  const vi = (catVi || '').trim().toLowerCase().normalize('NFC');
  if (!en && !vi) return null;
  const has = (s, words) => words.some((w) => s.includes(w));
  // prints first ("silkscreen" must not fall into painting's "silk")
  if (has(en, ['woodcut', 'engraving', 'etching', 'lithograph', 'silkscreen', 'screen print', 'unique print', 'plastercut'])
    || has(vi, ['khắc gỗ', 'khắc kẽm', 'khắc thạch cao', 'in độc bản'])) return 'print';
  if (en === 'paper' || vi === 'giấy') return 'print';            // Đông Hồ/Hàng Trống folk woodblocks + posters
  if (has(en, ['sculpture painting']) || has(vi, ['sơn khắc'])) return 'painting';   // carved-lacquer panel (flat)
  if (has(en, ['lacquered wood', 'coated with lacquer']) || has(vi, ['gỗ phủ sơn', 'gỗ sơn'])) return null;  // lacquered 3D object
  if (has(en, ['oil', 'lacquer', 'silk', 'gouache', 'watercolour', 'watercolor', 'acrylic', 'tempera'])
    || has(vi, ['sơn dầu', 'sơn mài', 'lụa', 'bột màu', 'màu nước'])) return 'painting';
  if (en === 'ink' || vi === 'mực') return 'drawing';
  if (has(en, ['mixed media']) || has(vi, ['tổng hợp'])) return 'mixed_media_2d';
  return null;   // Copper/Wood/Ceramic/Plaster/Metal/Textile/Composite/stoneware/unknown → out of scope
}

// ---------- year parser ("1943", "1939-1944", "Thế kỷ 18", "XVI century") ----------
function yearOf(s) {
  if (!s) return null;
  const str = String(s);
  let m = str.match(/\d{4}/);
  if (m) return parseInt(m[0], 10);
  m = str.match(/(?:thế kỷ|century)[^\dIVXivx]*(\d{1,2})/i) || str.match(/(\d{1,2})(?:st|nd|rd|th)?\s*century/i);
  if (m) return (parseInt(m[1], 10) - 1) * 100 + 1;               // earliest year of the century
  m = str.match(/(?:thế kỷ|century)\s*([IVX]{1,6})/i) || str.match(/\b([IVX]{2,6})\b\s*century/i);
  if (m) {
    const map = { i: 1, v: 5, x: 10 }; const r = m[1].toLowerCase(); let v = 0;
    for (let i = 0; i < r.length; i++) { const c = map[r[i]], n = map[r[i + 1]] || 0; v += c < n ? -c : c; }
    return (v - 1) * 100 + 1;
  }
  return null;
}

// ---------- B&W reproductive-print gate (prints only; computed BEFORE upload) ----------
async function colorfulness(buf) {
  const { data } = await sharp(buf, { limitInputPixels: false })
    .resize(80, 80, { fit: 'inside' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const rg = [], yb = [];
  for (let i = 0; i < data.length; i += 3) { const R = data[i], G = data[i + 1], B = data[i + 2]; rg.push(R - G); yb.push(0.5 * (R + G) - B); }
  const m = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const sd = (a) => { const mu = m(a); return Math.sqrt(m(a.map((v) => (v - mu) ** 2))); };
  return Math.sqrt(sd(rg) ** 2 + sd(yb) ** 2) + 0.3 * Math.sqrt(m(rg) ** 2 + m(yb) ** 2);
}

// ---------- image: download full-res original → webp → R2 ----------
async function dl(url) {
  for (let att = 1; att <= 3; att++) {
    try {
      await politeGap();
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 5000) throw new Error(`tiny ${buf.length}b`);
      return buf;
    } catch (e) { if (att === 3) throw e; await sleep(700 * att); }
  }
}

async function uploadR2(key, buffer) {
  for (let att = 1; att <= 4; att++) {
    try {
      await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buffer, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000' }));
      return;
    } catch (e) { if (att === 4) throw e; await sleep(400 * att); }
  }
}

// Returns { imageUrl } | { skip: reason }. Throws on hard failure (→ failed.ndjson).
async function processImage(srcUrl, category, id) {
  const src = await dl(srcUrl);
  const meta = await sharp(src).metadata().catch(() => ({}));
  if (!meta.width || Math.max(meta.width, meta.height) < MIN_LONG_SIDE) return { skip: `image too small ${meta.width}x${meta.height}` };
  if (category === 'print') {
    const cf = await colorfulness(src);
    if (cf < CF_TH) return { skip: `monochrome print (cf=${cf.toFixed(1)})` };
  }
  const { buffer } = await autocropToWebp(src);          // pure webp 2048/q85 (trim opt-in, off)
  const key = `artworks/${COLLECTION_STEM}/${id}-${sha(srcUrl).slice(0, 8)}-imageUrl.webp`;
  await uploadR2(key, buffer);
  return { imageUrl: `${R2_PUBLIC}/${key}` };
}

// ---------- record assembly ----------
function toArtwork(hit, detail, lang, category, year, imageUrl) {
  const enPublished = (hit.publishedLanguages || []).includes('en');
  const title = ((enPublished && (hit.name_en || (lang === 'en' && detail && detail.name))) || hit.name_vi || hit.name || '').trim();
  let artist = (hit.authorNames || '').trim();
  if (!artist && detail && detail.authors) artist = detail.authors.map((a) => a.name).filter(Boolean).join('; ');
  return {
    id: `${SLUG}-${hit.objectID}`,
    objectNumber: String(hit.code ?? '').trim(),
    title,
    artist,
    date: ((detail && detail.date) || '').trim(),
    year,
    medium: ((hit.category_en || '').trim() || (detail && detail.category && detail.category.name) || '').trim(),
    dimensions: ((detail && detail.dimensions) || '').trim(),
    category,
    description: stripTags(detail && detail.description),
    imageUrl,
    onDisplay: false,
    displayLocation: '',
    sourceUrl: enPublished
      ? `https://vnfam.vn/artifact/${hit.objectID}`
      : `https://vnfam.vn/${encodeURIComponent('hiện-vật')}/${hit.objectID}`,
    metadata: { name_vi: hit.name_vi || '', category_vi: (hit.category_vi || '').trim(), publishedLanguages: hit.publishedLanguages || [], detailLang: lang },
    original_imageUrl: hit.image,
  };
}

function writeCollection(artworks, inScopeByCat) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'Vietnam National Fine Arts Museum',
    collection: 'Collection',
    website: 'https://vnfam.vn',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'algolia+graphql',
    category_breakdown: cats,
    scope_note: `Catalogue of 281 published artifacts; in-scope flat art ${JSON.stringify(inScopeByCat)}. Excluded: bronze/wood/ceramic/plaster/metal/textile/composite sculpture and lacquered 3D objects; B&W reproductive prints (colorfulness<20); records the museum site itself publishes without year or artist (min-4); images with long side <400px.`,
    artworks,
  };
  fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2));
  console.log(`[write] ${OUT_PATH} (${artworks.length} works) breakdown=`, cats);
}

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const t0 = Date.now();

  // resume state (full mode only): replay terminal outcomes
  const done = new Set();
  const byId = new Map();
  if (MODE === 'full' && fs.existsSync(RESULTS_PATH)) {
    for (const line of fs.readFileSync(RESULTS_PATH, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line);
        done.add(r.id);
        if (r.st === 'ok' && r.w) byId.set(r.w.id, r.w);
      } catch { /* tolerate torn last line */ }
    }
    console.log(`[resume] replayed ${done.size} done records, ${byId.size} collected works`);
  }

  const hits = await fetchCatalogue();
  const inScope = [];
  const inScopeByCat = {};
  let outOfScope = 0;
  for (const h of hits) {
    const category = classify(h.category_en, h.category_vi);
    if (!category) { outOfScope++; continue; }
    inScope.push({ hit: h, category });
    inScopeByCat[category] = (inScopeByCat[category] || 0) + 1;
  }
  console.log(`[scope] total ${hits.length} | in-scope ${inScope.length} ${JSON.stringify(inScopeByCat)} | out-of-scope (3D/decorative) ${outOfScope}`);

  const queue = inScope.filter(({ hit }) => !done.has(hit.objectID));
  console.log(`[${MODE}] ${queue.length} to process | target ${MODE === 'probe' ? PROBE_TARGET : 'all'}`);

  const tally = { collected: 0, skip: {}, failed: 0, processed: 0 };
  const skipNote = (why) => { tally.skip[why.split(' (')[0]] = (tally.skip[why.split(' (')[0]] || 0) + 1; };
  const recordResult = (obj) => { if (MODE === 'full') fs.appendFileSync(RESULTS_PATH, JSON.stringify(obj) + '\n'); };
  const saveProgress = () => {
    if (MODE !== 'full') return;
    fs.writeFileSync(PROGRESS_PATH, JSON.stringify({
      slug: SLUG, corpus: hits.length, inScope: inScope.length, doneRecords: done.size,
      collected: byId.size, tallyThisRun: tally, updated: new Date().toISOString(),
    }, null, 2));
  };

  let qi = 0, stop = false;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (!stop && qi < queue.length) {
      const { hit, category } = queue[qi++];
      try {
        const { detail, lang } = await fetchDetail(hit);
        const year = yearOf(detail && detail.date);
        const w = toArtwork(hit, detail, lang, category, year, null);
        let why = null;
        if (!hit.image) why = 'no image';
        else if (!w.title) why = 'no title';
        else if (!w.artist) why = 'no artist (site limit)';
        else if (year == null) why = 'no year (site limit)';
        else {
          const long = hit.imageDimensions ? Math.max(hit.imageDimensions.width, hit.imageDimensions.height) : 0;
          if (long && long < MIN_LONG_SIDE) why = `image too small ${hit.imageDimensions.width}x${hit.imageDimensions.height}`;
        }
        if (why) {
          recordResult({ id: hit.objectID, st: 'skip', why });
          done.add(hit.objectID); skipNote(why);
        } else {
          const img = await processImage(hit.image, category, w.id);
          if (img.skip) {
            recordResult({ id: hit.objectID, st: 'skip', why: img.skip });
            done.add(hit.objectID); skipNote(img.skip);
          } else {
            w.imageUrl = img.imageUrl;
            byId.set(w.id, w);
            recordResult({ id: hit.objectID, st: 'ok', w });
            done.add(hit.objectID); tally.collected++;
            if (MODE === 'probe' && tally.collected >= PROBE_TARGET) stop = true;
          }
        }
      } catch (e) {
        tally.failed++;
        fs.appendFileSync(FAILED_PATH, JSON.stringify({ id: hit.objectID, err: String(e.message || e), at: new Date().toISOString() }) + '\n');
        if (tally.failed <= 8) console.log(`  [fail] ${hit.objectID}: ${e.message}`);
      }
      tally.processed++;
      if (tally.processed % 25 === 0) {
        console.log(`  …${tally.processed}/${queue.length} | collected ${byId.size} | failed ${tally.failed}`);
        saveProgress();
      }
    }
  }));

  const works = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  writeCollection(works, inScopeByCat);
  saveProgress();
  const mins = ((Date.now() - t0) / 60000).toFixed(1);
  console.log(`\n[${MODE}] DONE in ${mins} min. processed ${tally.processed} | collected ${works.length} | failed ${tally.failed}`);
  console.log(`[${MODE}] skip tally:`, tally.skip);
  console.log(`[${MODE}] 전체 in-scope ${inScope.length} / 수집 ${works.length} (corpus ${hits.length})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
