/**
 * Art Institute of Chicago (AIC) — Architecture & Design collection scraper
 * ------------------------------------------------------------------------
 * Source: AIC public API (no key) — https://api.artic.edu/api/v1/artworks/search
 *   Query (POST JSON): department_title == "Architecture and Design" AND image_id exists.
 *   In-scope total (probed 2026-06-29): 6,127 A&D works → 4,959 with a usable image_id.
 *
 * Why a dedicated collection: our existing aic-collection.json (39,315 works) is
 * photographs/drawings/paintings with NO architecture, yet AIC sits in the app's
 * "Architecture" genre. This fills that gap with architectural drawings, models,
 * design objects, plans, architectural fragments, and graphic design.
 *
 * Scope (per scripts/COLLECTION_SCRAPING_GUIDE.md):
 *   - department_title.keyword = "Architecture and Design"
 *   - image_id present (non-null)  → IIIF image exists
 *   - category: mapped from AIC artwork_type_title → our enum, defaulting to 'architecture'
 *     (drawings/prints/photographs keep their specific category; everything else = 'architecture').
 *
 * Image: image_id → https://www.artic.edu/iiif/2/{image_id}/full/{W},/0/default.jpg
 *        → sharp size-gate → autocrop → webp(q85) → R2 (armin-gallery-images).
 *
 *   ⚠️ KNOWN BLOCKER — Cloudflare: the IIIF image host (www.artic.edu/iiif) is fronted by
 *   a Cloudflare bot challenge that returns 403 to plain HTTP, headless Chrome, and the
 *   weserv proxy alike (verified 2026-06-29). The METADATA API (api.artic.edu) is wide open.
 *   This scraper fetches images in two ways, in order:
 *     1) direct HTTPS with realistic browser headers (works from an allow-listed IP / when
 *        AIC's CF posture relaxes — this is the correct, fast path);
 *     2) a shared Playwright Chrome context (channel:'chrome') that reuses a single
 *        CF-cleared session. Run with HEADLESS=0 to solve the challenge by hand ONCE; the
 *        cleared cookie then serves the whole run. (Mirrors the repo's existing
 *        scripts/cache-aic-images-playwright.cjs approach.)
 *   Use --no-images to build/validate the JSON + metadata without fetching images at all.
 *
 * Modes:  --pilot (default, cap 30, no R2 unless --upload)  |  --full
 * Flags:  --upload  force R2 upload in pilot
 *         --no-images  skip image fetch/R2 entirely (metadata-only; imageUrl left as pending marker)
 *         --cap=N   override item cap
 * Env:    HEADLESS=0  run the Playwright fallback browser visibly (to solve CF by hand)
 *
 * Resumable: scripts/.state/aic-architecture-progress.json (collected source ids)
 *            scripts/.state/aic-architecture-failed.ndjson (3-strike image failures)
 *
 * Usage:
 *   node scripts/scrape-aic-architecture.mjs --pilot                 # 30 items, validate end-to-end
 *   node scripts/scrape-aic-architecture.mjs --pilot --no-images     # 30 items, metadata only
 *   HEADLESS=0 node scripts/scrape-aic-architecture.mjs --full       # whole set; solve CF once
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
const SLUG = 'aic-architecture';
const COLLECTION_STEM = `${SLUG}-collection`;
const OUT = path.join(REPO, 'public/data', `${COLLECTION_STEM}.json`);
const STATE_DIR = path.join(__dirname, '.state');
const PROGRESS = path.join(STATE_DIR, `${SLUG}-progress.json`);
const FAILED = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);

const API = 'https://api.artic.edu/api/v1/artworks/search';
const IIIF_BASE = 'https://www.artic.edu/iiif/2';
const SOURCE_BASE = 'https://www.artic.edu/artworks';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const DEPARTMENT = 'Architecture and Design';
const SEARCH_PAGE = 100;     // API page size (max 100)
const IMG_WIDTH = 2048;      // IIIF full size (long edge)
const API_FIELDS = [
  'id', 'title', 'main_reference_number', 'artist_title', 'artist_display',
  'date_display', 'date_start', 'date_end', 'medium_display', 'dimensions',
  'department_title', 'artwork_type_title', 'classification_title', 'classification_titles',
  'image_id', 'is_public_domain', 'is_on_view', 'gallery_title', 'description',
];

const args = process.argv.slice(2);
const FULL = args.includes('--full');
const PILOT = !FULL;
const FORCE_UPLOAD = args.includes('--upload');
const NO_IMAGES = args.includes('--no-images');
const DO_UPLOAD = (FULL || FORCE_UPLOAD) && !NO_IMAGES;
const capArg = args.find((a) => a.startsWith('--cap='));
const CAP = capArg ? parseInt(capArg.split('=')[1], 10) : (PILOT ? 30 : Infinity);
const HEADLESS = String(process.env.HEADLESS ?? '1') !== '0';

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
fs.mkdirSync(STATE_DIR, { recursive: true });

// ---------- AIC artwork_type → our category enum ----------
// Default everything to 'architecture' (this collection IS the app's Architecture genre);
// keep a more specific 2D category when the type maps cleanly to our enum.
const TYPE_TO_CATEGORY = {
  'Architectural Drawing': 'drawing',
  'Drawing and Watercolor': 'drawing',
  'Graphic Design': 'print',
  'Print': 'print',
  'Photograph': 'photograph',
  'Painting': 'painting',
  'Book': 'manuscript',
  'Film, Video, New Media': 'video',
  'Time Based Media': 'video',
  'Audio-Video': 'video',
  'Digital Arts': 'mixed_media_2d',
  'Mixed Media': 'mixed_media_2d',
};
function mapCategory(typeTitle) {
  return TYPE_TO_CATEGORY[String(typeTitle || '').trim()] || 'architecture';
}

// ---------- http (API; JSON) ----------
async function postJson(body, attempts = 5) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      const r = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': UA, 'AIC-User-Agent': 'armin-collection-bot (cykim@crexai.co)' },
        body: JSON.stringify(body),
      });
      if (r.status === 429 || r.status >= 500) throw new Error(`HTTP ${r.status}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) { lastErr = e; await sleep(1000 * i); }
  }
  throw lastErr;
}

function searchBody(page) {
  return {
    query: { bool: { must: [
      { term: { 'department_title.keyword': DEPARTMENT } },
      { exists: { field: 'image_id' } },
    ] } },
    sort: [{ id: 'asc' }],   // stable order for resumable paging
    fields: API_FIELDS,
    page,
    limit: SEARCH_PAGE,
  };
}

// ---------- record mapping ----------
function cleanDescription(html) {
  if (!html || typeof html !== 'string') return '';
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// AIC artist_title is the clean display name; artist_display has dates/roles. Prefer title,
// fall back to first line of artist_display. Source format kept verbatim (guide §2).
// Guide §8 forbids Unknown/Unidentified filler — treat those as "no artist" so the work is skipped.
const PLACEHOLDER_ARTIST = /^(unknown|unidentified|anonymous|n\/?a|not recorded|various artists?)$/i;
function pickArtist(it) {
  const t = String(it?.artist_title || '').trim();
  if (t && !PLACEHOLDER_ARTIST.test(t)) return t;
  const disp = String(it?.artist_display || '').trim();
  if (disp) {
    const first = disp.split('\n')[0].split(';')[0].trim();
    if (first && !PLACEHOLDER_ARTIST.test(first)) return first;
  }
  return '';
}

// it → pre-image candidate (null if no image / no usable year+artist+title).
function buildCandidate(it) {
  if (!it?.image_id) return null;
  const title = String(it?.title || '').trim();
  if (!title) return null;
  const artist = pickArtist(it);
  if (!artist) return null;                       // 4-must; guide forbids Unknown filler
  const year = Number.isInteger(it?.date_start) && it.date_start !== 0 ? it.date_start
    : (Number.isInteger(it?.date_end) && it.date_end !== 0 ? it.date_end : null);
  if (year == null) return null;                  // 4-must: year required
  const category = mapCategory(it?.artwork_type_title);
  const imgUrl = `${IIIF_BASE}/${it.image_id}/full/${IMG_WIDTH},/0/default.jpg`;
  return {
    id: `${SLUG}-${it.id}`,
    objectNumber: String(it?.main_reference_number || '').trim(),
    title,
    artist,
    date: String(it?.date_display || '').trim(),
    year,
    medium: String(it?.medium_display || '').trim(),
    dimensions: String(it?.dimensions || '').trim(),
    category,
    description: cleanDescription(it?.description),
    imgUrl,
    sourceUrl: `${SOURCE_BASE}/${it.id}`,
    onDisplay: it?.is_on_view === true,
    displayLocation: String(it?.gallery_title || '').trim(),
    metadata: {
      aic_id: it.id,
      image_id: it.image_id,
      artwork_type: it?.artwork_type_title || '',
      classification: it?.classification_title || '',
      is_public_domain: it?.is_public_domain === true,
      iiif_image_api: `${IIIF_BASE}/${it.image_id}`,
    },
  };
}

// ---------- image fetch: direct HTTPS, then Playwright-Chrome fallback ----------
let _pwCtx = null;          // shared Playwright context (lazy, reused across run)
let _pwTried = false;
let _pwUsable = false;

async function getPlaywrightContext() {
  if (_pwTried) return _pwCtx;
  _pwTried = true;
  try {
    const { chromium } = await import('playwright');
    const os = await import('node:os');
    const udd = path.join(os.tmpdir(), 'aic-cf-profile');
    _pwCtx = await chromium.launchPersistentContext(udd, {
      channel: 'chrome',
      headless: HEADLESS,
      viewport: { width: 1280, height: 900 },
      userAgent: UA,
      args: ['--disable-blink-features=AutomationControlled'],
    });
    const page = _pwCtx.pages()[0] || await _pwCtx.newPage();
    console.log(`  [pw] warming CF session (${HEADLESS ? 'headless' : 'headful — solve the challenge if shown'})…`);
    await page.goto('https://www.artic.edu/', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    // poll until home returns 200 (challenge cleared) — up to 90s when headful (manual solve)
    const deadline = Date.now() + (HEADLESS ? 20000 : 90000);
    while (Date.now() < deadline) {
      const ok = await page.evaluate(async () => {
        try { return (await fetch('https://www.artic.edu/', { headers: { Accept: 'text/html' } })).status === 200; } catch { return false; }
      }).catch(() => false);
      if (ok) { _pwUsable = true; break; }
      await sleep(2500);
    }
    console.log(_pwUsable ? '  [pw] CF session ready.' : '  [pw] CF still challenged — images will fail; rerun with HEADLESS=0 to solve by hand.');
  } catch (e) {
    console.log(`  [pw] unavailable (${e.message}) — install playwright + Chrome to enable the image fallback.`);
    _pwCtx = null;
  }
  return _pwCtx;
}

async function fetchImageDirect(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Referer': 'https://www.artic.edu/', 'Accept': 'image/avif,image/webp,image/*,*/*' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const ct = r.headers.get('content-type') || '';
  if (!ct.startsWith('image/')) throw new Error(`non-image ct=${ct}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 5000) throw new Error(`tiny ${buf.length}b`);
  return buf;
}

async function fetchImageViaBrowser(url) {
  const ctx = await getPlaywrightContext();
  if (!ctx || !_pwUsable) throw new Error('cf-blocked (no cleared browser session)');
  const page = ctx.pages()[0] || await ctx.newPage();
  const data = await page.evaluate(async (u) => {
    const r = await fetch(u, { headers: { Accept: 'image/*' } });
    if (!r.ok) return { err: `HTTP ${r.status}` };
    const b = await r.arrayBuffer();
    return { bytes: Array.from(new Uint8Array(b)) };
  }, url);
  if (data.err) throw new Error(data.err);
  const buf = Buffer.from(data.bytes);
  if (buf.length < 5000) throw new Error(`tiny ${buf.length}b`);
  if (!(buf[0] === 0xff && buf[1] === 0xd8)) throw new Error('not-jpeg (challenge html?)');
  return buf;
}

async function dl(url) {
  let lastErr;
  for (let i = 1; i <= 3; i++) {
    try { return await fetchImageDirect(url); }
    catch (e) { lastErr = e; await sleep(500 * i); }
  }
  // direct failed (likely CF 403) → browser fallback
  try { return await fetchImageViaBrowser(url); }
  catch (e) { throw new Error(`direct:${lastErr?.message} | browser:${e.message}`); }
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
  const hash8 = sha(c.imgUrl).slice(0, 8);
  const key = `artworks/${COLLECTION_STEM}/${c.id}-${hash8}-imageUrl.webp`;
  if (NO_IMAGES) {
    return { imageUrl: `${R2_PUBLIC}/${key} (PENDING — image not fetched; --no-images)`, srcW: null, srcH: null };
  }
  const src = await dl(c.imgUrl);
  const meta = await sharp(src).metadata().catch(() => ({}));
  if (meta.width && meta.height && Math.max(meta.width, meta.height) < 600) {
    throw new Error(`thumb ${meta.width}x${meta.height}`);
  }
  const { buffer } = await autocropToWebp(src);     // white-trim + webp(2048/q85)
  let imageUrl;
  if (DO_UPLOAD) { await uploadR2(key, buffer); imageUrl = `${R2_PUBLIC}/${key}`; }
  else imageUrl = `${R2_PUBLIC}/${key} (DRY — not uploaded; --upload to push)`;
  return { imageUrl, srcW: meta.width || null, srcH: meta.height || null };
}

function toRecord(c, imageUrl, srcW, srcH) {
  if (!c.title || !c.artist || c.year == null || !c.category) return null;
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
    displayLocation: c.displayLocation,
    sourceUrl: c.sourceUrl,
    metadata: { ...c.metadata, source_width: srcW, source_height: srcH },
    original_imageUrl: c.imgUrl,
  };
}

// ---------- state ----------
function loadProgress() { try { return new Set(JSON.parse(fs.readFileSync(PROGRESS, 'utf8'))); } catch { return new Set(); } }
function saveProgress(set) { fs.writeFileSync(PROGRESS, JSON.stringify([...set])); }
function loadExisting() { try { return JSON.parse(fs.readFileSync(OUT, 'utf8')).artworks || []; } catch { return []; } }
function logFail(id, reason) { fs.appendFileSync(FAILED, JSON.stringify({ id, reason, t: Date.now() }) + '\n'); }

function writeOut(artworks) {
  const doc = {
    museum: 'Art Institute of Chicago',
    collection: 'Architecture and Design',
    website: 'https://www.artic.edu/collection?department_ids=PC-3',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'api',
    license: 'AIC — CC0 / Public Domain (image rights vary; metadata CC0)',
    artworks,
  };
  fs.writeFileSync(OUT, JSON.stringify(doc, null, 2));
}

// ---------- main ----------
(async () => {
  console.log(`AIC Architecture & Design scraper — mode=${FULL ? 'FULL' : 'PILOT'} cap=${CAP} upload=${DO_UPLOAD} images=${!NO_IMAGES}`);

  const done = FULL ? loadProgress() : new Set();   // pilot always fresh
  const out = FULL ? loadExisting() : [];
  const seenOut = new Set(out.map((w) => w.id));

  console.log('\n[1/2] Paging API + processing…');
  let kept = out.length, scanned = 0, skipped = 0, imgFail = 0;
  let page = 1, totalPages = Infinity, grandTotal = null;

  outer:
  while (page <= totalPages && kept < CAP) {
    let j;
    try { j = await postJson(searchBody(page)); }
    catch (e) { console.log(`  page ${page} failed: ${e.message}`); break; }
    const pag = j.pagination || {};
    totalPages = pag.total_pages ?? totalPages;
    if (grandTotal == null) { grandTotal = pag.total ?? null; console.log(`  in-scope total (A&D w/ image): ${grandTotal}`); }
    const rows = Array.isArray(j.data) ? j.data : [];
    if (rows.length === 0) break;

    for (const it of rows) {
      if (kept >= CAP) break outer;
      scanned++;
      if (done.has(it.id)) continue;
      done.add(it.id);
      const c = buildCandidate(it);
      if (!c) { skipped++; continue; }
      if (seenOut.has(c.id)) continue;
      try {
        const { imageUrl, srcW, srcH } = await processImage(c);
        const rec = toRecord(c, imageUrl, srcW, srcH);
        if (!rec) { skipped++; continue; }
        out.push(rec); seenOut.add(rec.id); kept++;
        if (kept % 25 === 0 || PILOT) {
          console.log(`  +kept ${kept} | ${String(rec.year).padEnd(4)} | ${rec.category.padEnd(12)} | ${rec.artist.slice(0, 24).padEnd(24)} | ${rec.title.slice(0, 38)}`);
        }
        await sleep(NO_IMAGES ? 30 : 200);
      } catch (e) {
        imgFail++; logFail(c.id, e.message);
        if (PILOT || imgFail <= 5) console.log(`  ✗ img fail [${c.id}]: ${e.message.slice(0, 110)}`);
      }
    }
    if (FULL) { saveProgress(done); writeOut(out); }
    console.log(`  …page ${page}/${totalPages} | kept ${kept} scanned ${scanned} skipped ${skipped} imgFail ${imgFail}`);
    page++;
    await sleep(250);
  }

  console.log('\n[2/2] Writing JSON…');
  writeOut(out);

  // category distribution
  const catDist = {};
  for (const w of out) catDist[w.category] = (catDist[w.category] || 0) + 1;
  console.log(`\n✅ ${out.length} records → ${path.relative(REPO, OUT)}`);
  console.log(`   scanned=${scanned} skipped(no-img/no-meta)=${skipped} imgFail=${imgFail}`);
  console.log(`   category dist: ${JSON.stringify(catDist)}`);
  if (grandTotal != null) console.log(`   in-scope full count (A&D with image_id): ${grandTotal}`);
  console.log('   sample:');
  for (const w of out.slice(0, 8)) console.log(`     • [${w.year}] (${w.category}) ${w.artist} — "${w.title.slice(0, 50)}"`);

  if (_pwCtx) await _pwCtx.close().catch(() => {});
  if (imgFail > 0 && !NO_IMAGES) {
    console.log(`\n⚠️  ${imgFail} image(s) failed (Cloudflare 403 on the IIIF host). Rerun with HEADLESS=0 to solve the challenge by hand, or run --no-images to validate metadata only.`);
  }
})();
