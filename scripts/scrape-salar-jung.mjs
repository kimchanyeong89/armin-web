#!/usr/bin/env node
// Salar Jung Museum (Hyderabad) — full collection scraper.
// Source: JATAN national digital repository (museumsofindia.gov.in, Ministry of Culture /
// C-DAC) — the museum's own collections.html links here as its canonical digital catalogue
// (parent-org infrastructure per the museo-botero precedent). Open JSON AJAX API:
//   GET /repository/collection/fetchRecords?collectionType=ObjectType
//        &collectionCategory={cat}&pageNo={n}&museum=sjm_hyd   → {listOfResult[16], resultSize}
// Metadata from the DETAIL page /repository/record/{rid} (th/td table: Title, Accession
// Number, Object Type, Main Material, Main Artist, School, Style, Period/Year, Dimensions,
// Brief/Detailed Description …). displayImage URLs in the list JSON are malformed (port-81
// CDN) — image rebuilt as /repository/file/sjm_hyd/{rid}/{rid}_01_h.jpg (~1294×1800 JPEG),
// with _02_h/_03_h fallback (multi-view records, esp. european painting, may lack _01_h).
//
// SCOPE (9 in-scope ObjectTypes, ~4,750 records):
//   miniature painting 2870 · painting 515 · modern painting 425 · european painting 379 ·
//   "water colour paintin" 68 (sic — facet name truncated at the source)
//                              → painting  (album/book miniatures ARE in scope — Mughal/
//                                           Rajasthani/Deccani paintings on paper, NOT
//                                           portrait-locket miniatures)
//   aquatint 251 · print 52   → print      (colour-gated: colorfulness<20 ⇒ skip B&W repros)
//   drawing 124               → drawing    (always kept, even B&W)
//   photograph 66             → photograph (NEVER colour-gated)
//   Skipped at parse time: ivory/enamel/vellum portrait-locket miniatures (material heuristic).
// Anonymous miniatures have no Main Artist field → artist falls back to the source School/
// Style field as the standard art-historical attribution ("Rajasthani school"); records with
// neither are dropped (min-4, no placeholder fills).
//
// Usage:
//   node scripts/scrape-salar-jung.mjs --probe   # ~20 works end-to-end (meta + R2 + partial JSON)
//   node scripts/scrape-salar-jung.mjs --full    # everything in-scope, resumable
//
// Resume: scripts/.state/salar-jung-progress.json (listed-category cache + per-record outcome;
// "fail" records are retried on re-run, ok/skip are final). Failures also appended to
// scripts/.state/salar-jung-failed.ndjson. Safe to kill and re-run.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { autocropToWebp } from './lib/autocrop.mjs';

// museumsofindia.gov.in serves an incomplete TLS chain (self-signed intermediate) that Node
// rejects while curl (system keychain) accepts. Scoped to this scraper process — repo
// precedent: migrate-all-images-to-r2-v2.cjs, probe-versailles-*.cjs.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const REPO = path.resolve(fileURLToPath(import.meta.url), '../..');
require('dotenv').config({ path: path.join(REPO, '.env.local') });

const SLUG = 'salar-jung';
const COLLECTION_STEM = `${SLUG}-collection`;
const BASE = 'https://museumsofindia.gov.in';
const MUSEUM_ID = 'sjm_hyd';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const PROGRESS_PATH = path.join(STATE_DIR, `${SLUG}-progress.json`);
const FAILED_PATH = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);
const OUT_PATH = path.join(REPO, 'public/data', `${COLLECTION_STEM}.json`);

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : 'probe';
const CONC = 6; // workers; source rps is capped by the global gate (~3.4 rps) regardless, and per-record latency to the India-hosted server is the bottleneck
const CF_THRESHOLD = 20; // Hasler-Süsstrunk colorfulness below this = monochrome print → skip

// ObjectType → armin category (lowercase singular enum).
// Facet names must match the source EXACTLY — note "water colour paintin" (sic, truncated
// in the repository's own facet list; "water colour painting" returns 0 records).
const CATEGORIES = [
  ['miniature painting', 'painting'],
  ['painting', 'painting'],
  ['modern painting', 'painting'],
  ['european painting', 'painting'],
  ['water colour paintin', 'painting'],
  ['aquatint', 'print'],
  ['print', 'print'],
  ['drawing', 'drawing'],
  ['photograph', 'photograph'],
];
// probe: ~20 works spread so every code path runs — school-fallback (miniature), Main Artist
// (modern/european), _02_h image fallback (european), "null"-string fields (water colour),
// colour gate (aquatint), drawing/photograph passthrough.
const PROBE_PLAN = [
  ['miniature painting', 'painting', 5],
  ['painting', 'painting', 2],
  ['modern painting', 'painting', 2],
  ['european painting', 'painting', 4],
  ['water colour paintin', 'painting', 2],
  ['aquatint', 'print', 2],
  ['drawing', 'drawing', 2],
  ['photograph', 'photograph', 1],
];

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ---------- progress state ----------
function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8')); } catch { return { listed: {}, done: {} }; }
}
function saveProgress(p) {
  const tmp = PROGRESS_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(p));
  fs.renameSync(tmp, PROGRESS_PATH);
}
function logFail(rid, stage, err) {
  fs.appendFileSync(FAILED_PATH, JSON.stringify({ rid, stage, err: String(err && err.message || err), ts: new Date().toISOString() }) + '\n');
}

// ---------- fetch layer ----------
// Global politeness gate: every source request waits its turn, ~3.4 rps hard cap across all
// workers (R2 uploads go through the S3 client and are not gated).
const gate = (() => {
  let next = 0;
  return async () => {
    const now = Date.now();
    const at = Math.max(now, next);
    next = at + 290;
    if (at > now) await sleep(at - now);
  };
})();

async function fetchRaw(url, { tries = 3, timeout = 45000 } = {}) {
  for (let i = 1; i <= tries; i++) {
    try {
      await gate();
      const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(timeout) });
      if (r.status === 404) { const e = new Error('HTTP 404'); e.notFound = true; throw e; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r;
    } catch (e) {
      if (e.notFound || i === tries) throw e;
      await sleep(900 * i);
    }
  }
}
const fetchText = async (url, opts) => (await fetchRaw(url, opts)).text();
const fetchJson = async (url, opts) => (await fetchRaw(url, opts)).json();
async function fetchBuf(url, opts) {
  const r = await fetchRaw(url, opts);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 5000) throw new Error(`tiny ${buf.length}b`);
  return buf;
}

// ---------- text cleanup ----------
const decodeEntities = (s) => (s || '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
const stripTags = (s) => decodeEntities((s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
// JATAN fills absent fields with "Not Available" — and some record sets (e.g. the water
// colour batch) carry the literal string "null" — treat both as empty.
const NOT_AVAILABLE = /^(not\s+available|null|n\.?\s?a\.?|none|nil|-+|\?+)$/i;
const clean = (s) => { const v = stripTags(s); return NOT_AVAILABLE.test(v) ? '' : v; };

// SHOUTY ALL-CAPS source titles → smart title case ("LADY WITH A CUP" → "Lady with a Cup").
// Only applied when ≥90% of letters are uppercase; roman-numeral ordinals (II, IV …) kept.
const SMALL_WORDS = new Set(['a', 'an', 'the', 'and', 'or', 'nor', 'of', 'on', 'in', 'at', 'to', 'by', 'for', 'with', 'from', 'as', 'but', 'near', 'upon']);
function smartTitleCase(s) {
  const letters = s.replace(/[^A-Za-z]/g, '');
  if (!letters || letters.replace(/[^A-Z]/g, '').length / letters.length < 0.9) return s; // not SHOUTY
  const words = s.toLowerCase().split(/\s+/);
  return words.map((w, i) => {
    const core = w.replace(/[^a-z]/g, '');
    if (/^[ivx]+$/.test(core) && core !== 'i' && core.length <= 4) return w.toUpperCase(); // II, IV, VI …
    if (i > 0 && i < words.length - 1 && SMALL_WORDS.has(core)) return w;
    return w.replace(/[a-z]/, (c) => c.toUpperCase()); // first letter (skips leading punctuation)
  }).join(' ');
}
const titleCaseWords = (s) => s.toLowerCase().replace(/(^|[\s(])([a-z])/g, (m, p, c) => p + c.toUpperCase());

// ---------- year parsing ----------
// Formats seen live: "1800 A.D" · "1820 AD" · "1973" · "19TH OR 20TH CENTURY" · "19th Century"
// · "LATE 19THC" · "20 THC" (abbreviated century!) · "1675-1700 A.D." · "1310 A.H." (Hijri)
function parseYear(raw) {
  if (!raw) return null;
  const t = raw.toUpperCase();
  let m = t.match(/(\d{3,4})\s*A\.?\s*H\b/); // Hijri → Gregorian
  if (m) { const y = Math.round(+m[1] * 0.970224 + 621.57); return y >= 800 && y <= 2026 ? y : null; }
  m = t.match(/\b(\d{3,4})\b/); // explicit year (range → first/earliest)
  if (m && +m[1] >= 800 && +m[1] <= 2026) return +m[1];
  m = t.match(/(\d{1,2})\s*(?:TH|ST|ND|RD)?\s*(?:OR\s+\d{1,2}\s*(?:TH|ST|ND|RD)?\s*)?C(?:ENTURY)?\b/); // earliest century, "19THC"/"20 THC" included
  if (m && +m[1] >= 8 && +m[1] <= 21) {
    let y = (+m[1] - 1) * 100 + 1; // earliest estimate
    if (/\bLATE\b/.test(t)) y += 70; else if (/\bMID\b/.test(t)) y += 40;
    return y;
  }
  return null;
}

// ---------- monochrome-print gate (Hasler-Süsstrunk colorfulness, from curate-grayscale-prints.mjs) ----------
async function colorfulness(buf) {
  const { data } = await sharp(buf, { limitInputPixels: false }).resize(80, 80, { fit: 'inside' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const rg = [], yb = [];
  for (let i = 0; i < data.length; i += 3) { const R = data[i], G = data[i + 1], B = data[i + 2]; rg.push(R - G); yb.push(0.5 * (R + G) - B); }
  const m = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const sd = (a) => { const mu = m(a); return Math.sqrt(m(a.map((v) => (v - mu) ** 2))); };
  return Math.sqrt(sd(rg) ** 2 + sd(yb) ** 2) + 0.3 * Math.sqrt(m(rg) ** 2 + m(yb) ** 2);
}

// ---------- detail page → fields ----------
function parseDetail(html) {
  const fields = {};
  for (const m of html.matchAll(/<th[^>]*>(.*?)<\/th>\s*<td[^>]*>(.*?)<\/td>/gs)) {
    const k = stripTags(m[1]);
    if (k) fields[k] = m[2]; // raw; cleaned per-field below
  }
  return fields;
}

// fields → artwork (or { skip } / null on min-4 failure)
function buildArtwork(rid, armincat, fields) {
  const title = smartTitleCase(clean(fields['Title']));
  const material = clean(fields['Main Material']);
  const school = clean(fields['School']);
  const style = clean(fields['Style']);

  // portrait-locket miniatures (ivory/enamel/vellum supports) are out of scope — paper album miniatures stay
  if (armincat === 'painting' && /\b(ivory|enamel|vellum)\b/i.test(material)) return { skip: 'locket-miniature' };

  // artist: named Main Artist (raw, as source gives it) → School/Style attribution (standard
  // art-historical credit for anonymous miniatures) → drop (no placeholder fills)
  let artist = clean(fields['Main Artist']);
  let artistSource = 'main-artist';
  if (!artist && school) { artist = /school$/i.test(school) ? titleCaseWords(school) : `${titleCaseWords(school)} school`; artistSource = 'school'; }
  if (!artist && style) { artist = /school$/i.test(style) ? titleCaseWords(style) : `${titleCaseWords(style)} school`; artistSource = 'style'; }

  const dateRaw = clean(fields['Period / Year of Work']);
  const year = parseYear(dateRaw);
  // short blurb first (Brief), long curatorial text only as fallback
  const description = clean(fields['Brief Description']) || clean(fields['Detailed Description']);

  if (!title || !artist || year == null) return null; // min-4 drop (title/artist/year; category always set) — no placeholder fills

  const metadata = {};
  const metaMap = { objectType: 'Object Type', school: 'School', style: 'Style', provenance: 'Provenance', originPlace: 'Origin Place', country: 'Country', artistBio: "Artist's Life Date / Bio Data", artistNationality: "Artist's Nationality", title2: 'Title2' };
  for (const [k, label] of Object.entries(metaMap)) { const v = clean(fields[label]); if (v) metadata[k] = k === 'title2' ? smartTitleCase(v) : v; }
  metadata.artistSource = artistSource;
  metadata.recordIdentifier = rid;

  const gallery = clean(fields['Gallery Name']);
  return {
    artwork: {
      id: `${SLUG}-${rid.replace(/^sjm_hyd-/, '')}`, // globally unique: salar-jung-ACQ-61-20-91
      objectNumber: clean(fields['Accession Number']) || rid.replace(/^sjm_hyd-/, ''),
      title,
      artist,
      date: dateRaw,
      year,
      medium: clean(fields['Medium']) || material, // "Medium" (e.g. Oil on Canvas) beats generic Main Material
      dimensions: clean(fields['Dimensions']).replace(/\s+,/g, ','),
      category: armincat,
      description,
      imageUrl: '', // set after R2 upload
      thumbnailUrl: '',
      onDisplay: !!gallery && !/store/i.test(gallery), // "… Store-2" = storage, not a gallery
      displayLocation: gallery,
      sourceUrl: `${BASE}/repository/record/${rid}`,
      metadata,
      original_imageUrl: '',
    },
  };
}

// ---------- image: download → (print gate) → webp → R2 ----------
async function uploadR2(key, buffer) {
  for (let att = 1; att <= 4; att++) {
    try {
      await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buffer, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000' }));
      return;
    } catch (e) { if (att === 4) throw e; await sleep(500 * att); }
  }
}

async function processRecord(rid, armincat) {
  const html = await fetchText(`${BASE}/repository/record/${rid}`);
  const built = buildArtwork(rid, armincat, parseDetail(html));
  if (!built) return { s: 'skip:min4' };
  if (built.skip) return { s: `skip:${built.skip}` };
  const a = built.artwork;

  // high-res image: most records have _01_h (~1294×1800), but multi-view records (esp.
  // european painting) sometimes start at _02_h → fallback chain. Missing views 404 cleanly.
  let buf = null, imgUrl = null;
  for (const suffix of ['_01_h', '_02_h', '_03_h']) {
    const u = `${BASE}/repository/file/${MUSEUM_ID}/${rid}/${rid}${suffix}.jpg`;
    try { buf = await fetchBuf(u, { timeout: 90000 }); imgUrl = u; break; }
    catch (e) { if (!e.notFound) throw e; }
  }
  if (!buf) return { s: 'skip:img-404' };

  const meta = await sharp(buf).metadata().catch(() => ({}));
  if (!meta.width || Math.max(meta.width, meta.height) < 500) return { s: 'skip:img-small' };

  if (armincat === 'print') { // B&W reproductive prints out; drawings/photographs NEVER gated
    const cf = await colorfulness(buf);
    if (cf < CF_THRESHOLD) return { s: 'skip:grayscale-print', cf: Math.round(cf * 10) / 10 };
  }

  const { buffer } = await autocropToWebp(buf); // default: pure webp 2048/q85, no trim
  const key = `artworks/${COLLECTION_STEM}/${a.id}-${sha(imgUrl).slice(0, 8)}-imageUrl.webp`;
  await uploadR2(key, buffer);

  a.imageUrl = `${R2_PUBLIC}/${key}`;
  a.thumbnailUrl = `${BASE}/repository/file/${MUSEUM_ID}/${rid}/${rid}_01_l.jpg`;
  a.original_imageUrl = imgUrl;
  return { s: 'ok', a };
}

// ---------- category listing (resultSize-driven, cached for --full resume) ----------
async function listCategory(cat) {
  const rids = [];
  const seen = new Set();
  let pages = 2;
  let pageErrs = 0;
  for (let p = 1; p <= pages; p++) {
    let d;
    try {
      d = await fetchJson(`${BASE}/repository/collection/fetchRecords?collectionType=ObjectType&collectionCategory=${encodeURIComponent(cat)}&pageNo=${p}&museum=${MUSEUM_ID}`);
    } catch (e) {
      // flaky API: individual pages 404/5xx — skip the page, give up the category after 5 misses
      pageErrs++;
      console.log(`[list] ${cat} p${p}: ${e.message} → skip page (${pageErrs})`);
      if (p === 1 || pageErrs >= 5) break;
      await sleep(800);
      continue;
    }
    const list = d.listOfResult || [];
    if (p === 1) pages = Math.ceil((d.resultSize || 0) / 16) + 1;
    if (!list.length) break;
    for (const r of list) if (r.recordIdentifier && !seen.has(r.recordIdentifier)) { seen.add(r.recordIdentifier); rids.push(r.recordIdentifier); }
    await sleep(300);
  }
  return rids;
}

// ---------- output ----------
function writeCollection(progress) {
  const artworks = Object.values(progress.done).filter((d) => d.s === 'ok' && d.a).map((d) => d.a);
  const order = { painting: 0, drawing: 1, print: 2, photograph: 3 };
  artworks.sort((x, y) => (order[x.category] - order[y.category]) || x.id.localeCompare(y.id));
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'Salar Jung Museum',
    collection: 'Collection',
    website: `${BASE}/repository/collection/ObjectType?museum=${MUSEUM_ID}`,
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'json-api',
    category_breakdown: cats,
    artworks,
  };
  fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2));
  console.log(`[write] ${OUT_PATH} (${artworks.length} works) breakdown=`, cats);
  return artworks;
}

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const progress = loadProgress();
  const t0 = Date.now();

  // 1) build work queue
  const queue = []; // { rid, armincat }
  const queued = new Set();
  const cats = MODE === 'probe' ? PROBE_PLAN : CATEGORIES;
  for (const [cat, armincat, probeN] of cats) {
    let rids;
    if (MODE === 'probe') {
      // probe: page 1 only, first N rids — do NOT persist to the listed cache (it must hold complete listings only)
      const d = await fetchJson(`${BASE}/repository/collection/fetchRecords?collectionType=ObjectType&collectionCategory=${encodeURIComponent(cat)}&pageNo=1&museum=${MUSEUM_ID}`);
      rids = (d.listOfResult || []).map((r) => r.recordIdentifier).filter(Boolean).slice(0, probeN);
    } else if (progress.listed[cat]) {
      rids = progress.listed[cat].rids;
    } else {
      process.stdout.write(`[list] ${cat} … `);
      rids = await listCategory(cat);
      console.log(`${rids.length} records`);
      progress.listed[cat] = { total: rids.length, rids };
      saveProgress(progress);
    }
    for (const rid of rids) {
      if (queued.has(rid)) continue;
      queued.add(rid);
      const prev = progress.done[rid];
      if (prev && prev.s !== 'fail') continue; // ok/skip are final; fail retries
      queue.push({ rid, armincat });
    }
  }
  const already = Object.values(progress.done).filter((d) => d.s === 'ok').length;
  console.log(`[${MODE}] queue ${queue.length} records (done-ok already: ${already})`);

  // 2) process queue (CONC workers, ~3-4 source rps total)
  let idx = 0, ok = 0, skip = 0, fail = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (idx < queue.length) {
      const { rid, armincat } = queue[idx++];
      try {
        const res = await processRecord(rid, armincat);
        progress.done[rid] = res;
        if (res.s === 'ok') ok++; else { skip++; if (skip <= 8 || skip % 50 === 0) console.log(`  [${res.s}] ${rid}${res.cf != null ? ` cf=${res.cf}` : ''}`); }
      } catch (e) {
        progress.done[rid] = { s: 'fail', err: String(e.message || e) };
        logFail(rid, 'process', e);
        fail++;
        if (fail <= 8) console.log(`  [fail] ${rid}: ${e.message}`);
      }
      const n = ok + skip + fail;
      if (n % 25 === 0) saveProgress(progress);
      if (n % 100 === 0) {
        const rate = n / ((Date.now() - t0) / 60000);
        console.log(`  …${n}/${queue.length} (ok ${ok}, skip ${skip}, fail ${fail}) ${rate.toFixed(0)}/min ETA ${((queue.length - n) / rate).toFixed(0)}min`);
      }
      await sleep(150);
    }
  }));
  saveProgress(progress);

  // 3) assemble collection JSON from all ok records
  const artworks = writeCollection(progress);

  // 4) quality summary
  const yearMiss = artworks.filter((a) => a.year == null).length;
  const srcCnt = {};
  for (const a of artworks) { const s = a.metadata.artistSource; srcCnt[s] = (srcCnt[s] || 0) + 1; }
  const skipCnt = {};
  for (const d of Object.values(progress.done)) if (d.s.startsWith('skip:')) skipCnt[d.s] = (skipCnt[d.s] || 0) + 1;
  console.log(`\n[${MODE}] DONE in ${((Date.now() - t0) / 60000).toFixed(1)}min — this run: ok ${ok}, skip ${skip}, fail ${fail}`);
  console.log(`[quality] total ok ${artworks.length} | year missing ${yearMiss} (${(yearMiss / (artworks.length || 1) * 100).toFixed(1)}%) | artist source:`, srcCnt);
  console.log('[skips]', skipCnt);
  if (MODE === 'probe') {
    console.log('\n[probe] sample records:');
    for (const a of artworks.slice(0, 20)) console.log(`  ${a.id} | ${a.category} | "${a.title}" | ${a.artist} | ${a.date || '-'} (${a.year ?? 'null'}) | ${a.medium || '-'} | ${a.imageUrl.slice(-50)}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
