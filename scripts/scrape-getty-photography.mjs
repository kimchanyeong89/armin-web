/**
 * J. Paul Getty Museum — Photography collection scraper
 * ------------------------------------------------------
 * Source: Getty Museum Collection API (no key required)
 *   search: https://www.getty.edu/art/collection/api/search
 *   get:    https://www.getty.edu/art/collection/api/get   (batch via repeated id=)
 *
 * Scope (per scripts/COLLECTION_SCRAPING_GUIDE.md):
 *   - classification_and_object_type = "Photograph"
 *   - images = true
 *   - open_content = true   → CC0 / Public Domain, full-res downloadable (Getty Open Content)
 *   - year >= 1920  (computed from the API's own date_range/decade_range; UNDATED kept)
 *
 * Image: image_metadata[].imageService (IIIF) → /full/2048,/0/default.jpg
 *        → sharp/autocrop → webp(q85) → R2 (armin-gallery-images).
 *
 * Modes:  --pilot  (default cap 30, no R2 unless --upload)  |  --full
 * Resumable: scripts/.state/getty-photography-progress.json (collected ids)
 *            scripts/.state/getty-photography-failed.ndjson (3-strike failures)
 *
 * Usage:
 *   node scripts/scrape-getty-photography.mjs --pilot           # 30 items, validates everything
 *   node scripts/scrape-getty-photography.mjs --full            # whole in-scope set, resumable
 *   node scripts/scrape-getty-photography.mjs --pilot --cap=10
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { autocropToWebp } from './lib/autocrop.mjs';

const require = createRequire(import.meta.url);
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(REPO, '.env.local') });
const sharp = (await import('sharp')).default;

// ---------- config ----------
const SLUG = 'getty-photography';
const COLLECTION_STEM = `${SLUG}-collection`;
const OUT = path.join(REPO, 'public/data', `${COLLECTION_STEM}.json`);
const STATE_DIR = path.join(__dirname, '.state');
const PROGRESS = path.join(STATE_DIR, `${SLUG}-progress.json`);
const FAILED = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);

const API = 'https://www.getty.edu/art/collection/api';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const UA = 'Mozilla/5.0 (compatible; ArminCollectionBot/1.0)';

const MIN_YEAR = 1920;
const SEARCH_PAGE = 500;     // ids per search page
const GET_BATCH = 50;        // details per /get call
const IMG_WIDTH = 2048;      // IIIF full size (long edge)

const args = process.argv.slice(2);
const FULL = args.includes('--full');
const PILOT = !FULL; // default pilot
const FORCE_UPLOAD = args.includes('--upload');
const DO_UPLOAD = FULL || FORCE_UPLOAD;
const capArg = args.find((a) => a.startsWith('--cap='));
const CAP = capArg ? parseInt(capArg.split('=')[1], 10) : (PILOT ? 30 : Infinity);
// pilot pulls from the richest in-scope decades so we exercise real ≥1920 data fast
const PILOT_DECADES = [1920, 1930];

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
fs.mkdirSync(STATE_DIR, { recursive: true });

// ---------- http ----------
async function fetchJson(url, attempts = 5) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (r.status === 429 || r.status === 503 || r.status === 500) throw new Error(`HTTP ${r.status}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) { lastErr = e; await sleep(1000 * i); }
  }
  throw lastErr;
}

// ---------- discovery: collect in-scope object ids ----------
// Build a search URL for one decade (decade_range is a working server-side filter; verified).
function searchUrl(decade, from) {
  const u = new URL(`${API}/search`);
  u.searchParams.set('from', String(from));
  u.searchParams.set('size', String(SEARCH_PAGE));
  u.searchParams.append('classification_and_object_type', 'Photograph');
  u.searchParams.append('images', 'true');
  u.searchParams.append('open_content', 'true');
  if (decade != null) u.searchParams.append('decade_range', String(decade));
  return u.toString();
}

// Decades with open-content photographs at/after 1920 (probe-confirmed they exist up to 2010s).
const SCOPE_DECADES = [1920, 1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010];

async function collectIds() {
  const decades = PILOT ? PILOT_DECADES : SCOPE_DECADES;
  const ids = [];
  const seen = new Set();
  for (const dec of decades) {
    let from = 0, total = Infinity;
    while (from < total) {
      const j = await fetchJson(searchUrl(dec, from));
      total = j.total ?? 0;
      const page = Array.isArray(j.data) ? j.data : [];
      if (page.length === 0) break;
      for (const it of page) {
        const id = it?.id;
        if (id && !seen.has(id)) { seen.add(id); ids.push(id); }
      }
      from += page.length;
      console.log(`  search ${dec}s: ${Math.min(from, total)}/${total} (uniq ${ids.length})`);
      if (PILOT && ids.length >= CAP * 3) break; // plenty of candidates for the pilot cap
      await sleep(250);
    }
    if (PILOT && ids.length >= CAP * 3) break;
  }
  return ids;
}

async function getDetails(idBatch) {
  const u = new URL(`${API}/get`);
  for (const id of idBatch) u.searchParams.append('id', id);
  const j = await fetchJson(u.toString());
  return Array.isArray(j.data) ? j.data : [];
}

// ---------- record mapping ----------
function pickArtist(producers) {
  if (!Array.isArray(producers)) return '';
  const names = producers
    .filter((p) => {
      const n = String(p?.primary_name || '').trim();
      if (!n || n.toLowerCase() === 'unknown') return false;
      const roles = Array.isArray(p?.role) ? p.role.map((r) => String(r).toLowerCase()) : [];
      // keep photographers / artists; drop pure publishers/printers when other roles absent
      if (roles.length === 0) return true;
      return roles.some((r) => /photograph|artist|maker/.test(r));
    })
    .map((p) => String(p.primary_name).trim());      // keep source order; display layer prettifies
  return Array.from(new Set(names)).slice(0, 3).join('; ');
}

// Determine the earliest creation year using the API's structured fields (robust to "1907–1943",
// "negative 1885; print 1903" etc.). Returns { year, inScope }.  year=null ⇒ undated (kept).
function resolveYear(it) {
  // 1) date_range.gte is an ISO timestamp the API derived from the messy date string.
  const gte = it?.date_range?.gte;
  if (typeof gte === 'string') {
    const m = gte.match(/^(-?\d{1,4})-/);
    if (m) {
      const y = parseInt(m[1], 10);
      return { year: y, inScope: y >= MIN_YEAR };
    }
  }
  // 2) one_year_range is an explicit array of plausible years.
  if (Array.isArray(it?.one_year_range) && it.one_year_range.length) {
    const y = Math.min(...it.one_year_range);
    return { year: y, inScope: it.one_year_range.some((v) => v >= MIN_YEAR) };
  }
  // 3) decade_range fallback.
  if (Array.isArray(it?.decade_range) && it.decade_range.length) {
    const y = Math.min(...it.decade_range);
    return { year: y, inScope: it.decade_range.some((v) => v >= MIN_YEAR) };
  }
  // 4) last resort: first 4-digit number in date_created.
  const m = String(it?.date_created || '').match(/\b(\d{4})\b/);
  if (m) { const y = parseInt(m[1], 10); return { year: y, inScope: y >= MIN_YEAR }; }
  // undated → keep (guide: "undated OK to keep")
  return { year: null, inScope: true };
}

function iiifImage(it) {
  const svc = it?.image_metadata?.find?.((m) => typeof m?.imageService === 'string' && m.isDisplayable !== false)?.imageService
    || it?.image_metadata?.find?.((m) => typeof m?.imageService === 'string')?.imageService;
  if (typeof svc === 'string' && svc.startsWith('http')) return `${svc}/full/${IMG_WIDTH},/0/default.jpg`;
  return '';
}

function detailUrl(slug) {
  const s = String(slug || '').trim();
  return s ? `https://www.getty.edu/art/collection${s}` : '';
}

// it → pre-image candidate (null if out of scope / no image / no artist).
function buildCandidate(it) {
  if (it?.open_content !== true) return null;           // open-content gate (double-check)
  const imgUrl = iiifImage(it);
  if (!imgUrl) return null;
  const { year, inScope } = resolveYear(it);
  if (!inScope) return null;                            // year < 1920 (dated)
  const artist = pickArtist(it?.producers);
  if (!artist) return null;                             // 4-must field; guide forbids Unknown filler
  const title = String(it?.primary_name || '').trim() || 'Untitled';
  const dims = Array.isArray(it?.dimensions) ? it.dimensions.join('; ') : (it?.dimensions || '');
  const medium = String(it?.materials || it?.medium || '').trim();
  const id = `${SLUG}-${String(it.id).replace(/^object\//, '')}`;
  return {
    id,
    objectNumber: String(it?.accession_number || it?.object_number || '').trim(),
    title,
    artist,
    date: String(it?.date_created || '').trim(),
    year,
    medium,
    dimensions: dims,
    category: 'photograph',
    description: '',
    imgUrl,
    sourceUrl: detailUrl(it?.slug_with_path),
    onDisplay: it?.on_view === true,
    manifest: it?.manifest?.url || '',
    rights: it?.rights_statement || 'Open Content (CC0)',
  };
}

// ---------- image: download → sharp gate → autocrop webp → R2 ----------
async function dl(url) {
  for (let i = 1; i <= 3; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const ct = r.headers.get('content-type') || '';
      if (!ct.startsWith('image/')) throw new Error(`non-image ct=${ct}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 5000) throw new Error(`tiny ${buf.length}b`);
      return buf;
    } catch (e) { if (i === 3) throw e; await sleep(600 * i); }
  }
}

async function uploadR2(key, buffer) {
  for (let i = 1; i <= 4; i++) {
    try {
      await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buffer, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000' }));
      return true;
    } catch (e) { if (i === 4) throw e; await sleep(500 * i); }
  }
}

async function processImage(c) {
  const src = await dl(c.imgUrl);
  const meta = await sharp(src).metadata().catch(() => ({}));
  if (meta.width && meta.height && Math.max(meta.width, meta.height) < 600) {
    throw new Error(`thumb ${meta.width}x${meta.height}`);
  }
  const { buffer } = await autocropToWebp(src);          // white-trim + webp(2048/q85)
  const hash8 = sha(c.imgUrl).slice(0, 8);
  const key = `artworks/${COLLECTION_STEM}/${c.id}-${hash8}-imageUrl.webp`;
  let imageUrl;
  if (DO_UPLOAD) { await uploadR2(key, buffer); imageUrl = `${R2_PUBLIC}/${key}`; }
  else imageUrl = `${R2_PUBLIC}/${key} (DRY — not uploaded; --upload to push)`;
  return { imageUrl, srcW: meta.width || null, srcH: meta.height || null };
}

function toRecord(c, imageUrl, srcW, srcH) {
  // min-4 guard (title/artist/year/category). year may be null (undated) — that's allowed.
  if (!c.title || !c.artist || !c.category) return null;
  return {
    id: c.id,
    objectNumber: c.objectNumber,
    title: c.title,
    artist: c.artist,
    date: c.date,
    year: c.year,
    medium: c.medium,
    dimensions: c.dimensions,
    category: c.category,
    description: c.description,
    imageUrl,
    thumbnailUrl: '',
    onDisplay: c.onDisplay,
    displayLocation: '',
    sourceUrl: c.sourceUrl,
    metadata: { iiif_manifest: c.manifest, rights: c.rights, source_width: srcW, source_height: srcH },
    original_imageUrl: c.imgUrl,
  };
}

// ---------- state ----------
function loadProgress() {
  try { return new Set(JSON.parse(fs.readFileSync(PROGRESS, 'utf8'))); } catch { return new Set(); }
}
function saveProgress(set) { fs.writeFileSync(PROGRESS, JSON.stringify([...set])); }
function loadExisting() {
  try { return JSON.parse(fs.readFileSync(OUT, 'utf8')).artworks || []; } catch { return []; }
}
function logFail(id, reason) { fs.appendFileSync(FAILED, JSON.stringify({ id, reason, t: Date.now() }) + '\n'); }

// ---------- main ----------
(async () => {
  console.log(`Getty Photography scraper — mode=${FULL ? 'FULL' : 'PILOT'} cap=${CAP} upload=${DO_UPLOAD}`);

  console.log('\n[1/3] Discovering in-scope object ids…');
  const ids = await collectIds();
  console.log(`  → ${ids.length} candidate ids`);

  const done = FULL ? loadProgress() : new Set();   // pilot always fresh
  const out = FULL ? loadExisting() : [];
  const seenOut = new Set(out.map((w) => w.id));

  console.log('\n[2/3] Fetching details + processing images…');
  let kept = out.length, scanned = 0, skipped = 0;
  for (let i = 0; i < ids.length && kept < CAP; i += GET_BATCH) {
    const batch = ids.slice(i, i + GET_BATCH).filter((id) => !done.has(id));
    if (batch.length === 0) continue;
    let details;
    try { details = await getDetails(batch); }
    catch (e) { console.log(`  get batch failed: ${e.message}`); continue; }

    for (const it of details) {
      if (kept >= CAP) break;
      scanned++;
      done.add(it.id);
      const c = buildCandidate(it);
      if (!c) { skipped++; continue; }
      if (seenOut.has(c.id)) continue;
      try {
        const { imageUrl, srcW, srcH } = await processImage(c);
        const rec = toRecord(c, imageUrl, srcW, srcH);
        if (!rec) { skipped++; continue; }
        out.push(rec); seenOut.add(rec.id); kept++;
        if (kept % 25 === 0 || PILOT) console.log(`  +kept ${kept} | ${rec.year ?? '----'} | ${rec.artist.slice(0, 28).padEnd(28)} | ${rec.title.slice(0, 40)}`);
        await sleep(150);
      } catch (e) {
        logFail(c.id, e.message);
        skipped++;
      }
    }
    if (FULL) saveProgress(done);
    if (FULL && kept % 100 < GET_BATCH) {
      writeOut(out);
      console.log(`  …checkpoint: kept ${kept}, scanned ${scanned}, skipped ${skipped}`);
    }
  }

  console.log('\n[3/3] Writing JSON…');
  writeOut(out);
  const years = out.map((w) => w.year).filter((y) => y != null).sort((a, b) => a - b);
  console.log(`\n✅ ${out.length} records → ${path.relative(REPO, OUT)}`);
  console.log(`   scanned=${scanned} skipped(out-of-scope/no-img/no-artist/fail)=${skipped}`);
  if (years.length) console.log(`   year range: ${years[0]}–${years[years.length - 1]} | undated kept: ${out.length - years.length}`);
  console.log(`   sample:`);
  for (const w of out.slice(0, 8)) console.log(`     • [${w.year ?? '----'}] ${w.artist} — "${w.title}" (${w.medium})`);
})();

function writeOut(artworks) {
  const doc = {
    museum: 'J. Paul Getty Museum',
    collection: 'Photography',
    website: 'https://www.getty.edu/art/collection/search/?classification_and_object_type=Photograph',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'api',
    license: 'Getty Open Content — CC0 / Public Domain',
    artworks,
  };
  fs.writeFileSync(OUT, JSON.stringify(doc, null, 2));
}
