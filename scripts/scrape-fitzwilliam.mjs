#!/usr/bin/env node
// Fitzwilliam Museum (Cambridge) collection scraper.
//
// Source (museum-owned, CC0): the Fitzwilliam's own version-controlled data dump on GitHub
//   github.com/FitzwilliamMuseum/fitz-collection-raw-data
//   - csv/objects.csv.gz       → master table, used to FILTER candidates to flat visual art + image
//   - json/objects-json/object-{id}.json → full CIIM JSON-API record (title/maker/year/medium/dims/category)
// Images (museum-owned IIIF): api.fitz.ms/data-distributor/iiif/... (full-res master via object manifestURI),
//   with data.fitzmuseum.cam.ac.uk/imagestore (multimedia[].original) as lower-res fallback.
// The live JSON API (data.fitzmuseum.cam.ac.uk/api/v1) is auth-gated; the GitHub dump is the open equivalent.
//
// Scope: department "Paintings, Drawings and Prints" only; primaryCategory mapped to flat-art enum.
// 4-MUST: title + artist (genuine "Anonymous" only when unrecorded) + real CREATION year + category.
//   Records without a real creation year are DROPPED (acquisition year is NOT creation date).
//
// Cap policy (COLLECTION_SCRAPING_GUIDE Phase C "수집 범위 정책"): NO artificial cap.
//   - paintings  : collect ALL.
//   - miniatures : Fitzwilliam's portrait miniatures are a world-flagship collection
//                  ("one of the finest in any country", rivalled only by the V&A) → KEEP ALL
//                  (the policy's "exclude decorative portrait miniature UNLESS flagship" carve-out).
//   - drawings / prints / photographs : value filter = IMAGE-QUALITY GATE only.
//       The source carries NO on-display / highlight / masterpiece flag, and NO object-type
//       study/proof/copy label distinct from the subject title (a title that mentions "study"
//       is the subject, not the source labelling the object as a subordinate study). So per
//       policy we keep every flat work whose master image passes the gate (long-edge ≥ MIN_EDGE,
//       not a placeholder/broken). The huge print category is kept in full for the same reason
//       (no value flag exists to thin it sensibly; arbitrary top-N is forbidden).
//
// Resumable: R2 HeadObject-skips images already uploaded by the prior run, so re-runs only
//   download NEW objects.
//
// Usage:  node scripts/scrape-fitzwilliam.mjs [--limit=N] [--concurrency=8] [--cap=N] [--min-edge=400]

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
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
const LIMIT       = args.limit ? Number(args.limit) : null;   // pilot
const CAP         = args.cap ? Number(args.cap) : null;       // no artificial cap (collect all)
const MIN_EDGE    = Number(args['min-edge'] || 400);         // image-quality gate: reject long-edge < this
const CONCURRENCY = Number(args.concurrency || 8);
const STEM        = args.limit ? 'fitzwilliam-pilot-collection' : 'fitzwilliam-collection';
const OUT_JSON    = `public/data/${STEM}.json`;
const REPO_ROOT   = path.resolve(fileURLToPath(import.meta.url), '../..');
const UA          = 'Mozilla/5.0 (compatible; armin-museum-research/1.0)';

const GH_RAW      = 'https://raw.githubusercontent.com/FitzwilliamMuseum/fitz-collection-raw-data/main';
const OBJ_JSON    = id => `${GH_RAW}/json/objects-json/${id}.json`;            // id like "object-1002"
const OBJECTS_CSV = `${GH_RAW}/csv/objects.csv.gz`;
const SITE        = 'https://data.fitzmuseum.cam.ac.uk';

const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

// primaryCategory (fine) → our flat-art enum. Anything not here is out of scope.
const CATMAP = {
  'painting': 'painting', 'painting (image-making)': 'painting', 'oil on millboard': 'painting', 'oil painting': 'painting',
  'miniature (painting)': 'miniature',
  'drawing': 'drawing', 'pastel (crayon)': 'drawing', 'silhouette': 'drawing',
  'print': 'print',
  'photograph': 'photograph', 'photographic print': 'photograph',
  'collage': 'mixed_media_2d',
};
// process order: prefer paintings / most-complete first
const PRIORITY = ['painting', 'miniature', 'photograph', 'drawing', 'print', 'mixed_media_2d'];

const sleep = ms => new Promise(r => setTimeout(r, ms));
const hash8 = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 8);
function dec(s) {
  return (s || '').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
                  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
                  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
                  .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, ' ').trim();
}
const arr0 = x => { while (Array.isArray(x) && x.length) x = x[0]; return (x && typeof x === 'object') ? null : x; };

async function fetchBuf(url, attempt = 1) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
    if ((res.status === 429 || res.status === 503) && attempt <= 4) { await sleep(800 * 2 ** (attempt - 1)); return fetchBuf(url, attempt + 1); }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } catch (e) {
    if (attempt <= 4) { await sleep(800 * 2 ** (attempt - 1)); return fetchBuf(url, attempt + 1); }
    throw e;
  }
}
async function fetchJson(url, attempt = 1) {
  const buf = await fetchBuf(url, attempt);
  return JSON.parse(buf.toString('utf-8'));
}

// ---- per-object metadata extraction (detail-page completeness) ----
function pickTitle(d) {
  const ts = (d.title || []).map(t => arr0(t.value)).filter(Boolean).map(dec).filter(Boolean);
  return ts.length ? ts.join('; ') : null;
}
function pickMaker(d) {
  const creation = (d.lifecycle && d.lifecycle.creation) || {};
  let m = creation.maker && creation.maker.maker;
  if (Array.isArray(m)) m = m[0];
  let name = m ? arr0(m.summary_title) : null;
  // also collect any additional makers
  const extra = [];
  const mk = creation.maker;
  if (mk && Array.isArray(mk.maker)) for (const mm of mk.maker) { const n = arr0(mm.summary_title); if (n) extra.push(dec(n)); }
  let all = name ? [dec(name)] : [];
  for (const e of extra) if (!all.includes(e)) all.push(e);
  let out = all.join('; ').trim();
  if (!out || /^(unknown|unidentified|anonymous|not recorded|none)$/i.test(out)) return null; // → Anonymous downstream
  return out;
}
function pickYear(d) {
  const dates = ((d.lifecycle && d.lifecycle.creation && d.lifecycle.creation.date) || []);
  const cand = [];
  for (const e of (Array.isArray(dates) ? dates : [])) {
    if (!e || typeof e !== 'object') continue;
    for (const p of [['from', 'earliest'], ['earliest'], ['from', 'value'], ['value']]) {
      let cur = e;
      for (const k of p) cur = (cur && typeof cur === 'object') ? cur[k] : undefined;
      const v = arr0(cur);
      if (v != null) {
        const s = String(v).trim();
        const m = s.match(/^(-?\d{1,4})/);
        if (m) { cand.push(Number(m[1])); break; }
      }
    }
  }
  return cand.length ? Math.min(...cand) : null;
}
function pickDateStr(d) {
  const dates = ((d.lifecycle && d.lifecycle.creation && d.lifecycle.creation.date) || []);
  for (const e of (Array.isArray(dates) ? dates : [])) {
    const fe = arr0(e?.from?.earliest), te = arr0(e?.to?.latest);
    const ev = arr0(e?.value), ee = arr0(e?.earliest), el = arr0(e?.latest);
    if (fe && te && fe !== te) return `${fe} - ${te}`;
    if (ev) return String(ev);
    if (ee && el && ee !== el) return `${ee} - ${el}`;
    if (ee) return String(ee);
  }
  return null;
}
function pickCategoryRaw(d) {
  const sources = [d.summary, d.name, d.categories];
  for (const src of sources) {
    for (const s of (src || [])) {
      const v = arr0(s.summary_title);
      if (v) return String(v).toLowerCase().trim();
    }
  }
  return null;
}
function pickMedium(d) {
  const tech = (d.techniques || []).map(t => arr0(t.summary_title)).filter(Boolean).map(dec);
  const mats = [];
  for (const c of (d.component || [])) for (const m of (c.materials || [])) { const v = arr0(m.summary_title); if (v) mats.push(dec(v)); }
  // de-dupe, drop bare "drawing (image-making)"/"painting (image-making)" if it's the only token (uninformative)
  const merged = [...new Set([...tech, ...mats])].filter(Boolean);
  return merged.join('; ');
}
function pickDimensions(d) {
  const ms = d.measurements;
  const dims = (ms && Array.isArray(ms.dimensions)) ? ms.dimensions : [];
  const parts = [];
  for (const x of dims) {
    const dim = arr0(x.dimension), val = arr0(x.value), u = arr0(x.units);
    if (dim && val) parts.push(`${dim} ${val}${u ? ' ' + u : ''}`);
  }
  return parts.join(' × ');
}
function pickAccession(d) {
  for (const i of (d.identifier || [])) {
    const t = arr0(i.type);
    if (t === 'accession number') { const v = arr0(i.accession_number) || arr0(i.value); if (v) return String(v); }
  }
  return null;
}
function pickDescription(d) {
  for (const n of (d.note || [])) {
    const t = (arr0(n.type) || '').toLowerCase();
    if (/description|content/.test(t)) { const v = arr0(n.value); if (v) return dec(v); }
  }
  // fall back to any note
  for (const n of (d.note || [])) { const v = arr0(n.value); if (v) return dec(v); }
  return '';
}
function pickFallbackImage(d) {
  const mm = (d.multimedia || [])[0];
  if (!mm) return null;
  for (const variant of ['original', 'large', 'mid', 'preview']) {
    if (mm[variant] && mm[variant].location) { const loc = arr0(mm[variant].location); if (loc) return loc; }
  }
  return null;
}

// Resolve a full-res IIIF image URL from the object's manifestURI (if any).
async function resolveIiifImage(d) {
  let man = arr0(d.manifestURI);
  if (!man) return null;
  try {
    const m = await fetchJson(man);
    const cv = m?.sequences?.[0]?.canvases?.[0];
    const res = cv?.images?.[0]?.resource;
    const svc = res?.service?.['@id'] || res?.service?.id;
    if (svc) return `${svc}/full/full/0/default.jpg`;
    if (res?.['@id']) return res['@id'];           // direct resource image
  } catch { /* fall through */ }
  return null;
}

async function r2Exists(key) { try { await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key })); return true; } catch { return false; } }
async function r2Upload(key, buf) {
  await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buf, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000' }));
}

// Reject obvious placeholder/broken images + enforce the image-quality gate (long-edge ≥ MIN_EDGE).
const PLACEHOLDER_HASHES = new Set();      // none known; populated if detected
async function downloadImage(url) {
  const buf = await fetchBuf(url);
  if (buf.length < 3000) throw new Error(`tiny:${buf.length}B`);
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  if (PLACEHOLDER_HASHES.has(sha)) throw new Error('placeholder');
  const meta = await sharp(buf, { limitInputPixels: false }).metadata();
  const longEdge = Math.max(meta.width || 0, meta.height || 0);
  if (longEdge < MIN_EDGE) throw new Error(`small:${meta.width}x${meta.height}`);
  return buf;
}

// Streaming RFC4180 CSV parser. The Fitz dump has note/description fields with embedded
// newlines + commas; a naive line-split mis-columns those rows and silently drops real PDP
// objects (incl. paintings). This index-sliced scanner is low-alloc enough for the ~209 MB
// objects.csv and respects quoted fields spanning newlines.
function* csvRows(s) {
  const N = s.length;
  let i = 0;
  while (i < N) {
    const row = [];
    let fieldStart = i, inQ = false, buf = null;
    while (i < N) {
      const c = s.charCodeAt(i);
      if (inQ) {
        if (c === 34) {                                  // "
          if (s.charCodeAt(i + 1) === 34) { buf = (buf === null ? s.slice(fieldStart, i + 1) : buf + s.slice(fieldStart, i + 1)); i += 2; fieldStart = i; continue; }
          inQ = false; buf = (buf === null ? s.slice(fieldStart, i) : buf + s.slice(fieldStart, i)); i++; fieldStart = i; continue;
        }
        i++;
      } else {
        if (c === 34) { inQ = true; i++; fieldStart = i; continue; }
        if (c === 44) { row.push(buf === null ? s.slice(fieldStart, i) : buf + s.slice(fieldStart, i)); buf = null; i++; fieldStart = i; continue; }
        if (c === 10 || c === 13) { row.push(buf === null ? s.slice(fieldStart, i) : buf + s.slice(fieldStart, i)); buf = null; i++; if (c === 13 && s.charCodeAt(i) === 10) i++; fieldStart = i; break; }
        i++;
      }
    }
    if (i >= N && fieldStart <= i && (fieldStart < i || row.length)) row.push(buf === null ? s.slice(fieldStart, i) : buf + s.slice(fieldStart, i));
    yield row;
  }
}

async function buildCandidates() {
  console.log('[fitz] downloading objects.csv.gz …');
  const gz = await fetchBuf(OBJECTS_CSV);
  const csv = zlib.gunzipSync(gz).toString('utf-8');
  let header = null, idx = null;
  const buckets = {}; for (const e of new Set(Object.values(CATMAP))) buckets[e] = [];
  for (const f of csvRows(csv)) {
    if (!header) { header = f; idx = Object.fromEntries(header.map((h, i) => [h, i])); continue; }
    if (f.length < 2) continue;
    if (f[idx.department] !== 'Paintings, Drawings and Prints') continue;
    const cat = (f[idx.primaryCategory] || '').toLowerCase().trim();
    const enum_ = CATMAP[cat]; if (!enum_) continue;
    const img = f[idx.largeImage] || f[idx.thumbnail] || '';
    const nimg = f[idx.numberOfImages] || '0';
    if (!img || nimg === '0' || nimg === '') continue;
    buckets[enum_].push(f[idx.id]);
  }
  return buckets;
}

async function main() {
  console.log(`[fitz] mode=${LIMIT ? `pilot(${LIMIT})` : (CAP ? `full(cap ${CAP})` : 'full(NO CAP — collect all)')}  concurrency=${CONCURRENCY}  minEdge=${MIN_EDGE}`);
  const buckets = await buildCandidates();
  let candTotal = 0;
  for (const k of PRIORITY) if (buckets[k]) { console.log(`[fitz]   candidate ${k}: ${buckets[k].length}`); candTotal += buckets[k].length; }
  console.log(`[fitz]   candidate TOTAL (in-scope flat art w/ image): ${candTotal}`);

  // ordered candidate list (priority categories first)
  const ordered = [];
  for (const k of PRIORITY) for (const id of (buckets[k] || [])) ordered.push(id);
  // candidate count per enum, for the per-medium "total / collected" report
  const candByCat = {}; for (const k of PRIORITY) candByCat[k] = (buckets[k] || []).length;
  const target = LIMIT || CAP || ordered.length;   // null CAP ⇒ process everything

  const artworks = [];
  const failed = [];
  const skippedNoYear = [];
  let processed = 0, anonCount = 0;
  const seenImg = new Set();
  const OUT_PATH = path.join(REPO_ROOT, OUT_JSON);
  const flush = () => {
    const out = {
      museum: 'The Fitzwilliam Museum',
      collection: LIMIT ? `Pilot ${artworks.length} items` : 'Paintings, Drawings, Prints, Photographs & Miniatures — flat visual art (all paintings + miniatures; drawings/prints/photos by image-quality gate)',
      website: 'https://fitzmuseum.cam.ac.uk/explore-our-collection',
      source: 'FitzwilliamMuseum/fitz-collection-raw-data (CC0 dump) objects.csv.gz + per-object JSON; images via museum IIIF (api.fitz.ms)',
      scraped_date: '2026-06-03',
      total_count: artworks.length,
      source_type: 'github-cc0-dump+iiif',
      artworks,
    };
    fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  };

  async function processOne(id) {
    let d;
    try { d = (await fetchJson(OBJ_JSON(id))).data; }
    catch (e) { failed.push({ id, reason: `json:${e.message}` }); return; }
    if (!d) { failed.push({ id, reason: 'no-data' }); return; }

    const title = pickTitle(d);
    if (!title) { failed.push({ id, reason: 'no-title' }); return; }

    const catRaw = pickCategoryRaw(d);
    const category = CATMAP[catRaw] || CATMAP[(catRaw || '').replace(/\s*\(.*\)$/, '').trim()];
    if (!category) { failed.push({ id, reason: `cat:${catRaw}` }); return; }

    const year = pickYear(d);
    if (year == null) { skippedNoYear.push(id); return; }        // 4-MUST: real creation year required

    let artist = pickMaker(d);
    if (!artist) { artist = 'Anonymous'; anonCount++; }

    const medium = pickMedium(d);
    const dimensions = pickDimensions(d);
    const accession = pickAccession(d);
    const dateStr = pickDateStr(d) || String(year);
    const description = pickDescription(d);

    // image: IIIF full-res preferred, else imagestore original
    let imgUrl = await resolveIiifImage(d);
    if (!imgUrl) imgUrl = pickFallbackImage(d);
    if (!imgUrl) { failed.push({ id, reason: 'no-image' }); return; }
    if (seenImg.has(imgUrl)) { failed.push({ id, reason: 'dup-image' }); return; }

    const numId = id.replace(/^object-/, '');
    const key = `artworks/${STEM}/${id}-${hash8(imgUrl)}-imageUrl.webp`;
    try {
      if (!await r2Exists(key)) {
        const buf = await downloadImage(imgUrl);
        const webp = await sharp(buf, { limitInputPixels: false })
                       .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
                       .webp({ quality: 85 }).toBuffer();
        if (webp.length < 2000) throw new Error('webp-tiny');
        await r2Upload(key, webp);
      }
      seenImg.add(imgUrl);
      artworks.push({
        id,
        objectNumber: accession || numId,
        title,
        artist,
        date: dateStr,
        year,
        medium,
        dimensions,
        category,
        description,
        imageUrl: `${R2_PUBLIC}/${key}`,
        thumbnailUrl: (() => { const mm = (d.multimedia || [])[0]; const p = mm && mm.preview && arr0(mm.preview.location); return p || ''; })(),
        onDisplay: false,
        displayLocation: '',
        sourceUrl: `${SITE}/id/object/${numId}`,
        metadata: {
          priref: numId,
          department: arr0(d.department?.value) || 'Paintings, Drawings and Prints',
          primaryCategory: catRaw,
          school_or_style: (d.school_or_style || []).map(s => arr0(s.summary_title)).filter(Boolean),
          manifestURI: arr0(d.manifestURI) || '',
        },
        original_imageUrl: imgUrl,
      });
    } catch (e) {
      failed.push({ id, imgUrl, reason: e.message });
    }
  }

  // worker pool — process EVERY candidate (cap only applies in pilot/explicit-cap mode)
  let cursor = 0;
  async function worker() {
    while (true) {
      if (artworks.length >= target) return;
      const i = cursor++;
      if (i >= ordered.length) return;
      await processOne(ordered[i]);
      processed++;
      if (processed % 100 === 0) {
        console.log(`[fitz] processed=${processed}/${ordered.length} kept=${artworks.length} noYear=${skippedNoYear.length} fail=${failed.length}`);
        flush();   // checkpoint: partial JSON is always queryable / resumable
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const finalArtworks = artworks;
  flush();
  console.log(`\n[fitz] wrote ${OUT_JSON} (${finalArtworks.length} artworks)`);

  if (failed.length) {
    const fp = path.join(REPO_ROOT, `scripts/.state/${STEM}-failed.ndjson`);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, failed.map(f => JSON.stringify(f)).join('\n'));
  }
  const cov = k => finalArtworks.filter(a => a[k] && (typeof a[k] === 'string' ? a[k].length : true)).length;
  const realArtist = finalArtworks.filter(a => a.artist && a.artist !== 'Anonymous').length;
  console.log(`\n=== Coverage on ${finalArtworks.length} kept ===`);
  console.log(`  title:      ${cov('title')}/${finalArtworks.length}`);
  console.log(`  artist:     ${realArtist}/${finalArtworks.length} real (+${anonCount} Anonymous)`);
  console.log(`  year:       ${finalArtworks.filter(a => a.year != null).length}/${finalArtworks.length}`);
  console.log(`  medium:     ${cov('medium')}/${finalArtworks.length}`);
  console.log(`  dimensions: ${cov('dimensions')}/${finalArtworks.length}`);
  const catDist = {}; finalArtworks.forEach(a => { catDist[a.category] = (catDist[a.category] || 0) + 1; });
  console.log(`  cat dist:   ${JSON.stringify(catDist)}`);
  console.log(`  dropped(no creation year): ${skippedNoYear.length}`);

  // per-medium TOTAL (candidate w/ image on source) / COLLECTED — mandatory report
  console.log(`\n=== Per-medium  candidate(total w/img) / collected ===`);
  for (const k of PRIORITY) {
    if (!candByCat[k]) continue;
    console.log(`  ${k.padEnd(15)} ${String(candByCat[k]).padStart(6)} / ${catDist[k] || 0}`);
  }
  // why things dropped (failure-reason histogram)
  const failHist = {};
  for (const f of failed) { const r = (f.reason || '').replace(/[0-9]+/g, 'N').replace(/x.*/, 'xN').slice(0, 30); failHist[r] = (failHist[r] || 0) + 1; }
  console.log(`\n=== Drop reasons (failed=${failed.length}, noYear=${skippedNoYear.length}) ===`);
  Object.entries(failHist).sort((a, b) => b[1] - a[1]).slice(0, 20).forEach(([k, v]) => console.log(`  ${String(v).padStart(6)}  ${k}`));
}

main().catch(e => { console.error(e); process.exit(1); });
