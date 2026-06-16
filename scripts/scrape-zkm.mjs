#!/usr/bin/env node
// ZKM | Center for Art and Media (Karlsruhe) — collection scraper.
// Source: museum-OWN Drupal 10 site, HTML scraping (JSON:API + REST are disabled — both 404).
//   Listing : https://zkm.de/en/collection?page={0..N}  → ~24 `/en/artworks/{slug}` links/page.
//   Detail  : https://zkm.de/en/artworks/{slug}         → Drupal field--name-* markup.
// Public collection view holds ~4,250 artwork nodes (page 177 is the last, partial).
//
// METADATA (parsed from the detail page, never the listing):
//   field-artwork-title-original   → Title
//   field-artwork-artist-information→ Artist / Artist group (free text)
//   field-artwork-date-year(-cln)  → Year (integer)
//   field-artwork-medium           → Category (controlled list: Painting/Drawing/Print/
//                                     Photography/Video/Film/Installation/Sculpture/…)
//   field-artwork-material         → Material / Technique (free text → `medium`)
//   field-artwork-measurement      → Dimensions / Duration (free text; "k. A." = unknown)
//
// IMAGE: the main work image is the media rendered in the `img_node_media_detail` image style.
//   Its filename → original (un-derivative) at  /system/files/field_media_image/{path}/{file}.
//   (The many `img_node_media_teaser` URLs are RELATED-work thumbnails — never the work itself.)
//   Originals verified 1024–1700px wide (≥600px gate satisfied).
//
// SCOPE (guide §1): flat visual works only. ZKM category → ARMIN category:
//   Painting→painting, Drawing→drawing, Print/Poster→print, Photography→photograph,
//   Video/Film/(media-art moving image)→video, mixed/collage 2D→mixed_media_2d.
//   EXCLUDED (3D / spatial / non-flat): Installation, Sculpture, Object, Performance,
//   Sound (audio-only, no image), Environment, Furniture, Design-product, Robotics, etc.
//   B&W reproductive PRINTS gated at download via Hasler-Süsstrunk colorfulness<20
//   (posters/graphic-design/photographs/drawings/video NEVER gated).
//
// Usage:
//   node scripts/scrape-zkm.mjs --probe      # ~15 in-scope works end-to-end (R2 upload), probe JSON
//   node scripts/scrape-zkm.mjs --full       # all in-scope, resumable, full JSON
//   node scripts/scrape-zkm.mjs --classify   # enumerate slugs + category tally only (no images)

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

const SLUG = 'zkm';
const COLLECTION_STEM = `${SLUG}-collection`;
const BASE = 'https://zkm.de';
const LISTING = (p) => `${BASE}/en/collection?page=${p}`;
const DETAIL = (s) => `${BASE}/en/artworks/${s}`;
const UA = 'armin-museum-research/1.0';
const UA_BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const PROGRESS = path.join(STATE_DIR, `${SLUG}-progress.json`);
const SLUGS_CACHE = path.join(STATE_DIR, `${SLUG}-slugs.json`);
const FAILED = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : args.includes('--classify') ? 'classify' : 'probe';
const PROBE_TARGET = 15;
const LAST_PAGE = 178;          // page 177 is last (partial); 178+ are empty — scan 0..177 inclusive
const RPS_MS = 280;             // ~3.5 req/s
const CONC_IMG = 4;
const CF_TH = 20;               // colorfulness gate for reproductive prints

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function decodeEntities(s) {
  return (s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#8217;/g, '’').replace(/&#8216;/g, '‘')
    .replace(/&#8211;/g, '–').replace(/&#8212;/g, '—')
    .replace(/&hellip;/g, '…').replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/\s+/g, ' ').trim();
}
const stripTags = (s) => decodeEntities((s || '').replace(/<[^>]+>/g, ' '));

// ---------- fetch with browser-UA fallback ----------
async function getHtml(url) {
  for (let att = 1; att <= 3; att++) {
    try {
      let r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' }, redirect: 'follow' });
      if (r.status === 403 || r.status === 429) {
        r = await fetch(url, { headers: { 'User-Agent': UA_BROWSER, 'Accept-Language': 'en' }, redirect: 'follow' });
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) { if (att === 3) throw e; await sleep(500 * att); }
  }
}

// ---------- Phase 1: enumerate slugs from the paginated listing ----------
function slugsFromListing(html) {
  const out = new Set();
  const re = /href="\/en\/artworks\/([^"#?]+)"/g;
  let m;
  while ((m = re.exec(html))) out.add(m[1]);
  return [...out];
}

async function enumerateSlugs() {
  if (fs.existsSync(SLUGS_CACHE)) {
    const cached = JSON.parse(fs.readFileSync(SLUGS_CACHE, 'utf8'));
    if (Array.isArray(cached) && cached.length) { console.log(`[slugs] cache hit: ${cached.length}`); return cached; }
  }
  const all = new Set();
  let emptyStreak = 0;
  for (let p = 0; p < LAST_PAGE; p++) {
    let html;
    try { html = await getHtml(LISTING(p)); }
    catch (e) { console.log(`  page ${p} fetch err: ${e.message}`); await sleep(RPS_MS); continue; }
    const slugs = slugsFromListing(html);
    slugs.forEach((s) => all.add(s));
    if (slugs.length === 0) { if (++emptyStreak >= 3) { console.log(`  3 empty pages at ${p} → stop`); break; } }
    else emptyStreak = 0;
    if (p % 20 === 0) console.log(`  …listing page ${p}: +${slugs.length} (total ${all.size})`);
    await sleep(RPS_MS);
  }
  const arr = [...all];
  fs.writeFileSync(SLUGS_CACHE, JSON.stringify(arr));
  console.log(`[slugs] enumerated ${arr.length} unique artwork slugs (cached)`);
  return arr;
}

// ---------- Phase 2: parse a detail page ----------
// Each field is a <dl ... field--name-{name} ...> ... </dl> with
//   <dt class="field__label">LABEL</dt>  +  one-or-more  <dd class="field__item">VALUE</dd>.
// Return the joined <dd> values (multi-value → "; "-joined), nothing else.
function fieldItems(html, name) {
  // grab the single <dl> for this field (up to its first </dl>)
  const re = new RegExp('<dl[^>]*field--name-' + name + '\\b[\\s\\S]*?</dl>', 'i');
  const m = html.match(re);
  if (!m) return [];
  const items = [];
  const ddRe = /<dd[^>]*class="[^"]*field__item[^"]*"[^>]*>([\s\S]*?)<\/dd>/gi;
  let d;
  while ((d = ddRe.exec(m[0]))) { const v = stripTags(d[1]); if (v) items.push(v); }
  return items;
}
function fieldValue(html, name) { return fieldItems(html, name).join('; '); }

// ZKM category (English controlled vocab, sometimes compound e.g. "Installation Video",
// "Painting Drawing") → ARMIN category, or null if out of scope.
// EXCLUDE tokens win over everything: a "video installation" is still a spatial installation,
// which guide §1 excludes — only screenable/flat moving-image (pure Video/Film) stays.
function mapCategory(zkmCat) {
  const c = (zkmCat || '').toLowerCase().trim();
  if (!c) return null;
  // 1) hard EXCLUDE — 3D / spatial / non-flat / non-image, regardless of other tokens.
  if (/\b(installation|sculpture|object|environment|performance|furniture|design|product|architecture|robot|machine|kinetic|relief|model|device|apparatus|costume|sound|audio|music|action|happening|intervention|game|app|website|software|net art|interface)\b/.test(c)) return null;
  // 2) in-scope flat works (most-specific first).
  if (/\bphotograph/.test(c)) return 'photograph';
  if (/\b(video|film|moving image|computer animation|animation|computer film)\b/.test(c)) return 'video';
  if (/\b(print|poster|graphic|lithograph|screen ?print|serigraph|etching|woodcut|linocut|offset)\b/.test(c)) return 'print';
  if (/\bdrawing\b/.test(c)) return 'drawing';
  if (/\bpainting\b/.test(c)) return 'painting';
  if (/\b(collage|mixed media|montage|photomontage)\b/.test(c)) return 'mixed_media_2d';
  return null; // unknown → conservative drop
}

function parseDetail(html, slug) {
  const title = fieldValue(html, 'field-artwork-title-original')
    || decodeEntities((html.match(/<title>([^<]*)<\/title>/) || [])[1] || '').replace(/\s*\|\s*ZKM\s*$/, '');
  const artist = fieldValue(html, 'field-artwork-artist-information');
  const yearRaw = fieldValue(html, 'field-artwork-date-year');
  const yearMatch = yearRaw.match(/\d{4}/);
  const year = yearMatch ? parseInt(yearMatch[0], 10) : null;
  const zkmCat = fieldValue(html, 'field-artwork-medium');
  const material = fieldValue(html, 'field-artwork-material');
  let dimensions = fieldValue(html, 'field-artwork-measurement');
  if (/^k\.\s*A\./i.test(dimensions) || /nicht dokumentiert/i.test(dimensions)) dimensions = '';
  const category = mapCategory(zkmCat);

  // main image: filename used by the img_node_media_detail style → un-styled original
  const detailM = html.match(/\/system\/files\/styles\/img_node_media_detail(?:_zoom)?\/private\/field_media_image\/([0-9]{4}\/[0-9]{2}\/[0-9]{2}\/[0-9]+\/[^"?]+\.(?:jpg|jpeg|png))/i);
  let imgUrl = null;
  if (detailM) imgUrl = `${BASE}/system/files/field_media_image/${detailM[1]}`;
  else {
    // fallback: a bare un-styled original present on the page (rare)
    const origM = html.match(/\/system\/files\/field_media_image\/[0-9]{4}\/[0-9]{2}\/[0-9]{2}\/[0-9]+\/[^"?]+\.(?:jpg|jpeg|png)/i);
    if (origM) imgUrl = `${BASE}${origM[0]}`;
  }

  return { slug, title, artist, year, zkmCat, material, dimensions, category, imgUrl, sourceUrl: DETAIL(slug) };
}

// ---------- colorfulness gate (Hasler-Süsstrunk) for reproductive prints ----------
async function colorfulness(buf) {
  try {
    const { data } = await sharp(buf, { limitInputPixels: false }).resize(80, 80, { fit: 'inside' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const rg = [], yb = [];
    for (let i = 0; i < data.length; i += 3) { const R = data[i], G = data[i + 1], B = data[i + 2]; rg.push(R - G); yb.push(0.5 * (R + G) - B); }
    const m = (a) => a.reduce((s, v) => s + v, 0) / a.length;
    const sd = (a) => { const mu = m(a); return Math.sqrt(m(a.map((v) => (v - mu) ** 2))); };
    return Math.sqrt(sd(rg) ** 2 + sd(yb) ** 2) + 0.3 * Math.sqrt(m(rg) ** 2 + m(yb) ** 2);
  } catch { return 999; }
}

// ---------- image: download → (gate prints) → autocrop → R2 ----------
async function dl(url) {
  for (let att = 1; att <= 3; att++) {
    try {
      let r = await fetch(url, { headers: { 'User-Agent': UA_BROWSER } });
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
  const meta = await sharp(src).metadata().catch(() => ({}));
  if (meta.width && Math.max(meta.width, meta.height) < 600) throw new Error(`thumb ${meta.width}x${meta.height}`);
  // gray-gate ONLY reproductive prints (drawings/posters/photo/video never gated)
  if (a.category === 'print') {
    const cf = await colorfulness(src);
    if (cf < CF_TH) { const e = new Error(`grayscale-print cf=${cf.toFixed(1)}`); e.skip = true; throw e; }
  }
  const { buffer } = await autocropToWebp(src);
  const hash8 = sha(a.imgUrl).slice(0, 8);
  const key = `artworks/${COLLECTION_STEM}/${SLUG}-${a.slug}-${hash8}-imageUrl.webp`;
  await uploadR2(key, buffer);
  return { imageUrl: `${R2_PUBLIC}/${key}`, srcW: meta.width || null, srcH: meta.height || null };
}

// ---------- record assembly (min-4 guard) ----------
function toArtwork(a, imageUrl) {
  if (!a.title || !a.artist || a.year == null || !a.category) return null;
  return {
    id: `${SLUG}-${a.slug}`,
    objectNumber: '',
    title: a.title,
    artist: a.artist,
    date: a.year != null ? String(a.year) : '',
    year: a.year,
    medium: a.material || '',
    dimensions: a.dimensions || '',
    category: a.category,
    description: '',
    imageUrl,
    thumbnailUrl: a.imgUrl,
    onDisplay: false,
    displayLocation: '',
    sourceUrl: a.sourceUrl,
    metadata: { zkm_slug: a.slug, zkm_category: a.zkmCat },
    original_imageUrl: a.imgUrl,
  };
}

function writeCollection(artworks, stem) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'ZKM | Center for Art and Media Karlsruhe',
    collection: 'Collection',
    website: 'https://zkm.de/en/collection',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'html',
    category_breakdown: cats,
    artworks,
  };
  const out = path.join(REPO, 'public/data', `${stem}.json`);
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
  const mb = (Buffer.byteLength(JSON.stringify(payload)) / 1e6).toFixed(2);
  console.log(`[write] ${out} (${artworks.length} works, ${mb} MB) breakdown=`, cats);
  return out;
}

function loadProgress() { try { return JSON.parse(fs.readFileSync(PROGRESS, 'utf8')); } catch { return { done: {}, artworks: [] }; } }
function saveProgress(p) { fs.writeFileSync(PROGRESS, JSON.stringify(p)); }

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const slugs = await enumerateSlugs();

  if (MODE === 'classify' || MODE === 'probe') {
    // For classify/probe, scan detail pages until we have enough in-scope (probe) or all (classify-light).
    const tally = {}; const zkmTally = {};
    const candidates = [];
    const scanLimit = MODE === 'probe' ? slugs.length : Math.min(slugs.length, 400); // classify: sample 400 for a fast tally
    let scanned = 0, inScope = 0, noImg = 0;
    for (const slug of slugs.slice(0, scanLimit)) {
      let html; try { html = await getHtml(DETAIL(slug)); } catch { await sleep(RPS_MS); continue; }
      const a = parseDetail(html, slug);
      scanned++;
      zkmTally[a.zkmCat || '(none)'] = (zkmTally[a.zkmCat || '(none)'] || 0) + 1;
      if (a.category) { tally[a.category] = (tally[a.category] || 0) + 1; inScope++; if (!a.imgUrl) noImg++; else candidates.push(a); }
      await sleep(RPS_MS);
      if (MODE === 'probe' && candidates.filter((c) => c.title && c.artist && c.year != null).length >= PROBE_TARGET) break;
      if (scanned % 50 === 0) console.log(`  …scanned ${scanned} (in-scope ${inScope}, candidates ${candidates.length})`);
    }
    console.log(`\n[scan] scanned=${scanned} in-scope=${inScope} (missing-image=${noImg})`);
    console.log('[scan] ARMIN category tally:', tally);
    console.log('[scan] ZKM raw category tally:', zkmTally);

    if (MODE === 'classify') {
      const frac = inScope / Math.max(scanned, 1);
      console.log(`\n[classify] in-scope fraction ~${(frac * 100).toFixed(1)}% → est ${Math.round(frac * slugs.length)} of ${slugs.length} total nodes`);
      return;
    }

    // PROBE: process up to PROBE_TARGET candidates end-to-end
    const pick = candidates.filter((c) => c.title && c.artist && c.year != null).slice(0, PROBE_TARGET);
    console.log(`\n[probe] processing ${pick.length} candidates end-to-end → R2 …`);
    const artworks = []; let imgErr = 0, skipped = 0;
    for (const a of pick) {
      try { const { imageUrl } = await processImage(a); const w = toArtwork(a, imageUrl); if (w) artworks.push(w); }
      catch (e) { if (e.skip) { skipped++; console.log(`  skip ${a.slug}: ${e.message}`); } else { imgErr++; console.log(`  img err ${a.slug}: ${e.message}`); } }
      await sleep(RPS_MS);
    }
    writeCollection(artworks, `${COLLECTION_STEM}-probe`);
    console.log(`\n[probe] DONE. collected ${artworks.length}/${pick.length} | imgErr ${imgErr} | grayskip ${skipped}`);
    return;
  }

  // ---------- FULL ----------
  const prog = loadProgress();
  const doneSet = prog.done || {};
  const artworks = prog.artworks || [];
  console.log(`[full] resume: ${artworks.length} already collected, ${Object.keys(doneSet).length} slugs processed`);

  // 2a) fetch+parse all detail pages (sequential, polite), collecting in-scope candidates
  const candidates = [];
  let scanned = 0, inScope = 0, outScope = 0;
  for (const slug of slugs) {
    if (doneSet[slug]) continue;
    let html; try { html = await getHtml(DETAIL(slug)); }
    catch (e) { fs.appendFileSync(FAILED, JSON.stringify({ slug, stage: 'detail', err: String(e.message || e) }) + '\n'); await sleep(RPS_MS); continue; }
    const a = parseDetail(html, slug);
    scanned++;
    if (a.category && a.imgUrl) candidates.push(a);
    else { doneSet[slug] = 1; if (!a.category) outScope++; }   // in-scope-no-image: nothing to fetch
    if (a.category) inScope++;
    await sleep(RPS_MS);
    if (scanned % 100 === 0) { console.log(`  …detail ${scanned}/${slugs.length} (in-scope ${inScope}, out ${outScope}, queued ${candidates.length})`); saveProgress({ done: doneSet, artworks }); }
  }
  console.log(`[full] detail scan complete: in-scope-with-image candidates = ${candidates.length}`);

  // 2b) image pipeline (concurrent), resumable per-slug
  let idx = 0, ok = 0, imgErr = 0, skipped = 0;
  await Promise.all(Array.from({ length: CONC_IMG }, async () => {
    while (idx < candidates.length) {
      const a = candidates[idx++];
      if (doneSet[a.slug]) continue;
      try {
        const { imageUrl } = await processImage(a);
        const w = toArtwork(a, imageUrl);
        if (w) { artworks.push(w); ok++; }
        doneSet[a.slug] = 1;
      } catch (e) {
        if (e.skip) { skipped++; doneSet[a.slug] = 1; }
        else { imgErr++; fs.appendFileSync(FAILED, JSON.stringify({ slug: a.slug, stage: 'image', url: a.imgUrl, err: String(e.message || e) }) + '\n'); }
      }
      if ((ok + imgErr + skipped) % 50 === 0) { console.log(`  …images ok ${ok}, err ${imgErr}, grayskip ${skipped} (of ${candidates.length})`); saveProgress({ done: doneSet, artworks }); }
      await sleep(RPS_MS / CONC_IMG);
    }
  }));
  saveProgress({ done: doneSet, artworks });

  artworks.sort((x, y) => (x.id < y.id ? -1 : 1));
  writeCollection(artworks, COLLECTION_STEM);
  console.log(`\n[full] DONE. collected ${artworks.length} | imgErr ${imgErr} | grayskip ${skipped}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
