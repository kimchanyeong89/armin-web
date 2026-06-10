#!/usr/bin/env node
// International Center of Photography (New York) — full collection scraper.
// Source: museum-own Drupal 10 site, server-rendered HTML. No API/JSON-LD/IIIF exists
//   (probe: scripts/.state/na1-probes/icp-ny.json). Enumeration via sitemap.xml
//   (index of 44 pages; object detail pages /browse/archive/objects/{slug} ≈ 54,809 URLs).
// Detail page tombstone: artist (constituent link), title (h1.normal), Date, Location,
//   Dimensions, Print medium (field__label/field__item pairs), Credit Line, Accession No.
// Image: page embeds s3.amazonaws.com/icptmsdata/.../*_displaysize.jpg (700px cap);
//   swapping suffix → *_fullscreen.jpg gives ~2500px long side (verified). Per-object
//   404 fallback to _displaysize (700px, still ≥600px bar). GET (not HEAD) per probe.
//
// SCOPE: photography museum — classify by the museum's own TMS medium prefix taxonomy:
//   "Photo-*" → photograph (incl. Photo-Gravure: continuous-tone photographic process),
//   "Print-*"/litho/offset/etc → print (B&W reproductive prints SKIPPED at download time
//   via Hasler-Süsstrunk colorfulness < 20 — computed on the downloaded buffer BEFORE
//   R2 upload; drawings/photographs never gated), drawings/video/collage mapped to enum.
//   EXCLUDED: negatives/contact sheets (archival support material, renders inverted),
//   publications/equipment/3D, works with no image, min-4 failures (no date etc.).
//
// CAP: corpus ≈ 54.8k ≫ 25k → collect in sitemap order (≈ accession order: the early
//   core holdings first) until the serialized JSON would hit ~23MB (< 24MB Cloudflare
//   Pages limit) or HARD_CAP works. Painting/drawing are vanishingly rare here and are
//   always kept when seen; the cap effectively limits photographs only.
//
// Usage:
//   node scripts/scrape-icp-ny.mjs --probe   # ~20 in-scope works end-to-end → *-probe.json
//   node scripts/scrape-icp-ny.mjs --full    # full scrape, resumable (state in scripts/.state)
//
// Resume (--full): every terminal outcome is appended to scripts/.state/icp-ny-results.ndjson
//   (ok/skip) — re-running replays it and continues. Failures → icp-ny-failed.ndjson
//   (NOT marked done: next run retries them). Counters → icp-ny-progress.json.

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

const SLUG = 'icp-ny';
const COLLECTION_STEM = `${SLUG}-collection`;
const BASE = 'https://www.icp.org';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const DATA_DIR = path.join(REPO, 'public/data');

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : 'probe';
const PROBE_TARGET = 20;
const HARD_CAP = 23000;                    // works
const SIZE_CAP = 23 * 1024 * 1024;         // serialized-JSON budget (< 24MB Pages limit)
const MIN_LONG_SIDE = 600;                 // px (displaysize fallback at 700 still passes)
const CF_TH = 20;                          // colorfulness threshold for B&W print skip
const CONC = MODE === 'full' ? 8 : 4;      // image dl/upload bound; icp.org rate is capped by GAP_MS regardless
const GAP_MS = 270;                        // ≥270ms between icp.org page fetches (~3.7 rps)

const URLS_CACHE = path.join(STATE_DIR, `${SLUG}-urls.json`);
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
// serialized size of one artwork inside the final pretty-printed file (records sit at
// array depth 2 → every line carries 4 extra indent spaces vs. a bare stringify)
const recBytes = (w) => { const s = JSON.stringify(w, null, 2); return s.length + (s.match(/\n/g) || []).length * 4 + 6; };
const decodeEntities = (s) => (s || '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#8217;/g, '’')
  .replace(/&#8216;/g, '‘').replace(/&#8211;/g, '–').replace(/&#8212;/g, '—')
  .replace(/&hellip;/g, '…').replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).trim();
const stripTags = (s) => decodeEntities((s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());

// global politeness gap for icp.org page fetches (images live on AWS S3 — not gated)
let nextSlot = 0;
async function politeGap() {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + GAP_MS;
  if (wait) await sleep(wait);
}

async function fetchText(url, tries = 3) {
  for (let t = 1; t <= tries; t++) {
    try {
      await politeGap();
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (r.status === 404) return { notFound: true };
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return { text: await r.text() };
    } catch (e) { if (t === tries) throw e; await sleep(800 * t); }
  }
}

// ---------- enumeration via sitemap ----------
const OBJ_RE = /<loc>(https:\/\/www\.icp\.org\/browse\/archive\/objects\/[^<]+)<\/loc>/g;
async function enumerateObjects() {
  if (MODE === 'full' && fs.existsSync(URLS_CACHE)) {
    const cached = JSON.parse(fs.readFileSync(URLS_CACHE, 'utf8'));
    console.log(`[enum] cache hit: ${cached.length} object URLs (${URLS_CACHE})`);
    return cached;
  }
  const idx = await fetchText(`${BASE}/sitemap.xml`);
  const pages = [...idx.text.matchAll(/<loc>(https:\/\/www\.icp\.org\/sitemap\.xml\?page=\d+)<\/loc>/g)].map((m) => m[1]);
  console.log(`[enum] sitemap index: ${pages.length} pages`);
  const seen = new Set();
  const urls = [];
  for (const p of pages) {
    const { text } = await fetchText(p);
    let m; OBJ_RE.lastIndex = 0;
    let added = 0;
    while ((m = OBJ_RE.exec(text))) { const u = m[1]; if (!seen.has(u)) { seen.add(u); urls.push(u); added++; } }
    if (added) console.log(`[enum] ${p} → +${added} (total ${urls.length})`);
    if (MODE === 'probe' && urls.length >= 200) { console.log('[enum] probe: enough URLs, stopping enumeration'); return urls; }
  }
  fs.writeFileSync(URLS_CACHE, JSON.stringify(urls));
  console.log(`[enum] cached ${urls.length} object URLs`);
  return urls;
}

// ---------- detail-page parser ----------
function parseDetail(html, url) {
  const nid = (html.match(/data-history-node-id="(\d+)"/) || [])[1] || null;
  const titleDiv = (html.match(/<div class="archive-page__title h1">([\s\S]*?)<\/div>/) || [])[1] || '';
  const links = [...titleDiv.matchAll(/<a [^>]*>([\s\S]*?)<\/a>/g)].map((m) => stripTags(m[1])).filter(Boolean);
  const artist = links.length ? links.join('; ') : stripTags(titleDiv);
  const title = stripTags((html.match(/<h1 class="normal">([\s\S]*?)<\/h1>/) || [])[1]);
  const fields = {};
  const re = /<label class="field__label">([^<]+)<\/label>\s*<div class="field__item">([\s\S]*?)<\/div>/g;
  let m;
  while ((m = re.exec(html))) fields[m[1].trim()] = m[2];
  const accession = stripTags((html.match(/Accession No\.\s*([\s\S]*?)<\/span>/) || [])[1]);
  let img = (html.match(/https:\/\/s3\.amazonaws\.com\/icptmsdata\/[^"'\s]+_displaysize\.jpg/i) || [])[0] || null;
  if (!img) { // some images are proxied through the museum's own /icpmedia path
    const proxied = (html.match(/\/icpmedia\/[^"'\s]+_displaysize\.jpg/i) || [])[0];
    if (proxied) img = `${BASE}${proxied}`;
  }
  return {
    nid,
    artist,
    title,
    dateStr: stripTags(fields['Date'] || ''),
    medium: stripTags(fields['Print medium'] || fields['Medium'] || ''),
    dimensions: stripTags((fields['Dimensions'] || '').replace(/<br\s*\/?>/gi, '; ')),
    accession,
    displaysizeUrl: img,
    sourceUrl: url,
  };
}

// ---------- scope classifier (ICP TMS medium taxonomy) ----------
// Returns ARMIN enum or null (out of scope / excluded).
function classify(mediumRaw) {
  const t = (mediumRaw || '').toLowerCase();
  if (!t) return null;                                          // unknown → conservative skip
  if (/\bnegative\b|contact sheet/.test(t)) return null;        // archival support material
  if (/\bvideo\b|^film\b|u-matic|\bvhs\b|\bdvd\b/.test(t)) return 'video';
  if (/photo-?mechanical|halftone/.test(t)) return 'print';     // press repros — B&W gate applies
  if (/^photo|photograph|gelatin|chromogenic|cibachrome|dye transfer|dye bleach|platinum|palladium|albumen|salt(ed)? paper|cyanotype|daguerreotype|tintype|ambrotype|autochrome|polaroid|inkjet|c-print|silver/.test(t)) return 'photograph';
  if (/\bprint\b|lithograph|offset|serigraph|screen ?print|silkscreen|engraving|etching|woodcut|collotype|gravure|letterpress|poster/.test(t)) return 'print';
  if (/\b(ink|graphite|pencil|charcoal|watercolou?r|gouache|crayon|pastel|chalk)\b|drawing/.test(t)) return 'drawing';
  if (/collage|montage|mixed media/.test(t)) return 'mixed_media_2d';
  if (/painting|oil on|acrylic|tempera/.test(t)) return 'painting';
  return null;                                                  // books/equipment/3D/unknown
}

const PLACEHOLDER_ARTIST = /^(anonymous|unknown( photographer| artist| maker)?|unidentified( photographer| artist)?|n\/?a|none|-+)$/i;
const yearOf = (s) => { const m = (s || '').match(/\d{4}/); return m ? parseInt(m[0], 10) : null; };

// ---------- B&W print gate (Hasler-Süsstrunk colorfulness, on the downloaded buffer) ----------
async function colorfulness(buf) {
  const { data } = await sharp(buf, { limitInputPixels: false })
    .resize(80, 80, { fit: 'inside' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const rg = [], yb = [];
  for (let i = 0; i < data.length; i += 3) { const R = data[i], G = data[i + 1], B = data[i + 2]; rg.push(R - G); yb.push(0.5 * (R + G) - B); }
  const m = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const sd = (a) => { const mu = m(a); return Math.sqrt(m(a.map((v) => (v - mu) ** 2))); };
  return Math.sqrt(sd(rg) ** 2 + sd(yb) ** 2) + 0.3 * Math.sqrt(m(rg) ** 2 + m(yb) ** 2);
}

// ---------- image: fullscreen (2500px) with displaysize (700px) fallback ----------
async function dl(url) {
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (r.status === 404 || r.status === 403) return null;   // suffix variant missing
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 5000) throw new Error(`tiny ${buf.length}b`);
      return buf;
    } catch (e) { if (att === 3) throw e; await sleep(600 * att); }
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

// Returns { imageUrl, originalUrl } | { skip: reason }. Throws on hard failure (→ failed.ndjson).
async function processImage(d, id) {
  const fullUrl = d.displaysizeUrl.replace(/_displaysize\.jpg$/i, '_fullscreen.jpg');
  let src = await dl(fullUrl);
  let originalUrl = fullUrl;
  if (!src) { src = await dl(d.displaysizeUrl); originalUrl = d.displaysizeUrl; }
  if (!src) throw new Error('image 404 (fullscreen and displaysize)');
  const meta = await sharp(src).metadata().catch(() => ({}));
  if (!meta.width || Math.max(meta.width, meta.height) < MIN_LONG_SIDE) return { skip: `image too small ${meta.width}x${meta.height}` };
  if (d.category === 'print') {                       // B&W reproductive-print gate (BEFORE upload)
    const cf = await colorfulness(src);
    if (cf < CF_TH) return { skip: `monochrome print (cf=${cf.toFixed(1)})` };
  }
  const { buffer } = await autocropToWebp(src);       // pure webp 2048/q85 (trim opt-in, off)
  const key = `artworks/${COLLECTION_STEM}/${id}-${sha(originalUrl).slice(0, 8)}-imageUrl.webp`;
  await uploadR2(key, buffer);
  return { imageUrl: `${R2_PUBLIC}/${key}`, originalUrl };
}

// ---------- record assembly ----------
function toArtwork(d, id, imageUrl, originalUrl) {
  return {
    id,
    objectNumber: d.accession || '',
    title: d.title,
    artist: d.artist,
    date: d.dateStr,
    year: d.year,
    medium: d.medium,
    dimensions: d.dimensions,
    category: d.category,
    description: '',
    imageUrl,
    onDisplay: false,
    displayLocation: '',
    sourceUrl: d.sourceUrl,
    metadata: { nid: d.nid },
    original_imageUrl: originalUrl,
  };
}

function writeCollection(artworks, final) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'International Center of Photography',
    collection: 'Collection',
    website: 'https://www.icp.org/browse/archive',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'html+sitemap',
    category_breakdown: cats,
    scope_note: 'Sitemap corpus ≈54,809 objects; collected in sitemap (≈accession) order up to a ~23MB JSON cap. Excluded: negatives/contact sheets, publications/equipment, B&W reproductive prints (colorfulness<20), no-image and no-date records.',
    artworks,
  };
  fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2));
  console.log(`[write${final ? '/final' : ''}] ${OUT_PATH} (${artworks.length} works) breakdown=`, cats);
}

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const t0 = Date.now();

  // resume state (full mode only)
  const done = new Set();          // URLs with a terminal outcome (ok or skip)
  const byId = new Map();          // id → artwork (replayed + this run)
  let bytesEst = 0;                // running serialized-size estimate
  if (MODE === 'full' && fs.existsSync(RESULTS_PATH)) {
    for (const line of fs.readFileSync(RESULTS_PATH, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line);
        done.add(r.u);
        if (r.st === 'ok' && r.w && !byId.has(r.w.id)) { byId.set(r.w.id, r.w); bytesEst += recBytes(r.w); }
      } catch { /* tolerate a torn last line from a crash */ }
    }
    console.log(`[resume] replayed ${done.size} done URLs, ${byId.size} collected works (~${(bytesEst / 1e6).toFixed(1)}MB)`);
  }

  const urls = await enumerateObjects();
  const queue = urls.filter((u) => !done.has(u));
  console.log(`[${MODE}] ${urls.length} object URLs | ${queue.length} to process | target ${MODE === 'probe' ? PROBE_TARGET : `${HARD_CAP} works / ${(SIZE_CAP / 1e6).toFixed(0)}MB`}`);

  const tally = { collected: 0, skip: {}, failed: 0, processed: 0 };
  let stop = false;
  let qi = 0;

  const recordResult = (obj) => { if (MODE === 'full') fs.appendFileSync(RESULTS_PATH, JSON.stringify(obj) + '\n'); };
  const saveProgress = () => {
    if (MODE !== 'full') return;
    fs.writeFileSync(PROGRESS_PATH, JSON.stringify({
      slug: SLUG, urlCount: urls.length, doneUrls: done.size, collected: byId.size,
      bytesEst, capReached: stop, tallyThisRun: tally, updated: new Date().toISOString(),
    }, null, 2));
  };

  await Promise.all(Array.from({ length: CONC }, async () => {
    while (!stop && qi < queue.length) {
      const url = queue[qi++];
      try {
        const res = await fetchText(url);
        if (res.notFound) {
          recordResult({ u: url, st: 'skip', why: 'http 404' });
          done.add(url); tally.skip['http 404'] = (tally.skip['http 404'] || 0) + 1;
        } else {
          const d = parseDetail(res.text, url);
          d.year = yearOf(d.dateStr);
          d.category = classify(d.medium);
          let why = null;
          if (!d.nid) why = 'no node id';
          else if (!d.category) why = d.medium ? `out of scope: ${d.medium.slice(0, 40)}` : 'no medium';
          else if (!d.displaysizeUrl) why = 'no image';
          else if (!d.title) why = 'no title';
          else if (!d.artist || PLACEHOLDER_ARTIST.test(d.artist)) why = 'no/placeholder artist';
          else if (d.year == null) why = 'no year';
          if (why) {
            recordResult({ u: url, st: 'skip', why });
            done.add(url); tally.skip[why.split(':')[0]] = (tally.skip[why.split(':')[0]] || 0) + 1;
          } else {
            const id = `${SLUG}-${d.nid}`;
            if (byId.has(id)) {
              recordResult({ u: url, st: 'skip', why: 'duplicate nid' });
              done.add(url); tally.skip['duplicate nid'] = (tally.skip['duplicate nid'] || 0) + 1;
            } else {
              const img = await processImage(d, id);
              if (img.skip) {
                recordResult({ u: url, st: 'skip', why: img.skip });
                done.add(url); tally.skip[img.skip.split(' (')[0]] = (tally.skip[img.skip.split(' (')[0]] || 0) + 1;
              } else {
                const w = toArtwork(d, id, img.imageUrl, img.originalUrl);
                byId.set(id, w);
                bytesEst += recBytes(w);
                recordResult({ u: url, st: 'ok', w });
                done.add(url); tally.collected++;
                if (MODE === 'probe' && tally.collected >= PROBE_TARGET) stop = true;
                if (MODE === 'full' && (byId.size >= HARD_CAP || bytesEst >= SIZE_CAP)) {
                  stop = true;
                  console.log(`[cap] reached ${byId.size} works / ~${(bytesEst / 1e6).toFixed(1)}MB — stopping`);
                }
              }
            }
          }
        }
      } catch (e) {
        tally.failed++;
        fs.appendFileSync(FAILED_PATH, JSON.stringify({ u: url, err: String(e.message || e), at: new Date().toISOString() }) + '\n');
        if (tally.failed <= 8) console.log(`  [fail] ${url}: ${e.message}`);
      }
      tally.processed++;
      if (tally.processed % 100 === 0) {
        const rate = tally.processed / ((Date.now() - t0) / 1000);
        console.log(`  …${tally.processed}/${queue.length} processed | collected ${byId.size} (~${(bytesEst / 1e6).toFixed(1)}MB) | failed ${tally.failed} | ${rate.toFixed(2)} url/s`);
        saveProgress();
      }
      if (MODE === 'full' && tally.collected > 0 && tally.collected % 2000 === 0) {
        writeCollection([...byId.values()].sort((a, b) => Number(a.metadata.nid) - Number(b.metadata.nid)), false);
      }
    }
  }));

  const works = [...byId.values()].sort((a, b) => Number(a.metadata.nid) - Number(b.metadata.nid));
  writeCollection(works, true);
  saveProgress();
  const mins = ((Date.now() - t0) / 60000).toFixed(1);
  console.log(`\n[${MODE}] DONE in ${mins} min. processed ${tally.processed} URLs | collected ${works.length} | failed ${tally.failed}`);
  console.log(`[${MODE}] skip tally:`, tally.skip);
  console.log(`[${MODE}] corpus: ${urls.length} sitemap objects → collected ${works.length} (cap policy: ~23MB JSON)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
