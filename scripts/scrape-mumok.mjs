#!/usr/bin/env node
// Scrape mumok (Museum moderner Kunst Stiftung Ludwig Wien), Vienna.
// Source: TYPO3 HTML site. NO API/IIIF/OAI. Authoritative record list = the sitemap
//   https://www.mumok.at/en/online-collection/sitemap  → ~6,457 /detail/{slug} links.
// Detail page (parse here): https://www.mumok.at/en/online-collection/detail/{slug}
//
// SCOPE (flat 2D, museum-OWN source only):
//   Object category in {painting, graphics, photography, film/video, mixed media} → keep.
//   {plastic, object, installation, model, furniture, ...} or NO category → skip (sculpture/3D).
//   Records with NO previewimage → skip (text-only; ~79% of records).
//   PAINTINGS: collect ALL (no cap). Other 2D: value-filter (skip study/sketch/copy).
//
// IMAGE: only a ~600px-LONG-EDGE web derivative is served (csm_*.jpg, ~20-85KB). No full-size
//   original exists (FAL paths 404, no zoom/srcset). Accept it (passes pilot min >400px,>10KB).
//   autocrop → webp(2048/q85) → R2 armin-gallery-images/artworks/mumok-collection/{id}-{hash8}-imageUrl.webp
//
// Usage:
//   node scripts/scrape-mumok.mjs --limit=100            # pilot (in-scope+imaged, stops at 100 collected)
//   node scripts/scrape-mumok.mjs --limit=100 --no-upload  # pilot metadata only (skip R2)
//   node scripts/scrape-mumok.mjs                        # full (all slugs, resumable)
//   node scripts/scrape-mumok.mjs --out=mumok-collection-pilot.json

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { autocropToWebp } from './lib/autocrop.mjs';

const require = createRequire(import.meta.url);
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config({ path: path.resolve(fileURLToPath(import.meta.url), '../.env.local') });

const REPO = path.resolve(fileURLToPath(import.meta.url), '../..');
const DATA_DIR = path.join(REPO, 'public', 'data');
const STATE_DIR = path.join(REPO, 'scripts', '.state');
fs.mkdirSync(STATE_DIR, { recursive: true });

const args = process.argv.slice(2);
const LIMIT = (() => { const a = args.find(x => x.startsWith('--limit=')); return a ? Number(a.split('=')[1]) : Infinity; })();
const NO_UPLOAD = args.includes('--no-upload');
const OUT_NAME = (() => { const a = args.find(x => x.startsWith('--out=')); return a ? a.split('=')[1] : 'mumok-collection.json'; })();
const OUT_PATH = path.join(DATA_DIR, OUT_NAME);
const STATE_PATH = path.join(STATE_DIR, `mumok-progress.json`);
const FAILED_PATH = path.join(STATE_DIR, `mumok-failed.ndjson`);

const BASE = 'https://www.mumok.at';
const SITEMAP = `${BASE}/en/online-collection/sitemap`;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) armin-museum-research/1.0';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const COLLECTION_STEM = 'mumok-collection';

const s3 = (process.env.R2_ACCOUNT_ID && !NO_UPLOAD) ? new S3Client({
  region: 'auto', endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
}) : null;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const sha8 = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 8);

// ---- Object category → our enum. Anything not here = out of scope (skip). ----
const CATEGORY_MAP = {
  'painting': 'painting',
  'graphics': 'print',        // mumok "Grafik" = prints/works on paper
  'photography': 'photograph',
  'photograph': 'photograph',
  'film': 'video',
  'video': 'video',
  'film/video': 'video',
  'media art': 'video',
  'mixed media': 'mixed_media_2d',
};
const OUT_OF_SCOPE = new Set(['plastic', 'object', 'objects', 'installation', 'model', 'furniture', 'sculpture', 'design', 'architecture']);
// Value-filter keywords for NON-painting works (skip studies/copies). Painting = never skipped.
const SKIP_KEYWORDS = /\b(study|sketch|copy|reproduction|squeeze|rubbing|proof|preparatory)\b/i;

async function fetchText(url, tries = 3) {
  for (let t = 1; t <= tries; t++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) { if (t === tries) throw e; await sleep(800 * t); }
  }
}
async function fetchBuf(url, tries = 3) {
  for (let t = 1; t <= tries; t++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return Buffer.from(await r.arrayBuffer());
    } catch (e) { if (t === tries) throw e; await sleep(800 * t); }
  }
}

const decode = (s) => (s || '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/&szlig;/g, 'ß').replace(/&auml;/g, 'ä').replace(/&ouml;/g, 'ö').replace(/&uuml;/g, 'ü')
  .replace(/&Auml;/g, 'Ä').replace(/&Ouml;/g, 'Ö').replace(/&Uuml;/g, 'Ü')
  .replace(/&eacute;/g, 'é').replace(/&egrave;/g, 'è').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// Pull the <td> value that follows a given HTML comment marker. Returns '' if the row is absent.
function tdAfterComment(html, comment) {
  const i = html.indexOf(comment);
  if (i < 0) return '';
  // next </td> close that belongs to this row's first <td class="collectiontabletd">
  const seg = html.slice(i, i + 1500);
  const m = seg.match(/<td class="collectiontabletd">([\s\S]*?)<\/td>/);
  return m ? decode(m[1]) : '';
}

function parseDetail(html, slug, url) {
  // --- header: artist / title / EN title / date ---
  const am = html.match(/<div class="collectiontitle">([\s\S]*?)<\/div>/);
  const artist = am ? decode(am[1]) : '';

  const hm = html.match(/<h1 class="collectiondesc[^"]*">([\s\S]*?)<\/h1>([\s\S]{0,500})/);
  const title = hm ? decode(hm[1]) : '';
  let year = null;
  if (hm) {
    const divs = [...hm[2].matchAll(/<div[^>]*>([\s\S]*?)<\/div>/g)].map(x => decode(x[1])).filter(Boolean);
    // date = last sub-div that is (or contains) a 3-4 digit year
    for (let i = divs.length - 1; i >= 0; i--) {
      const y = divs[i].match(/\b(\d{3,4})\b/);
      if (y) { year = parseInt(y[1], 10); break; }
    }
  }

  // --- fact table (comment-delimited) ---
  const rawCategory = (tdAfterComment(html, '<!-- Object Category -->') || '').toLowerCase().trim();
  const objectDescription = tdAfterComment(html, '<!-- Object Description -->');
  const material = tdAfterComment(html, '<!-- Material -->');
  const technique = tdAfterComment(html, '<!-- Technique -->');
  const dimensions = tdAfterComment(html, '<!-- Dimensions -->');
  const acqYear = tdAfterComment(html, '<!-- Accession Date -->');
  const objectNumber = tdAfterComment(html, '<!-- Object Number -->');
  const creditline = tdAfterComment(html, '<!-- Credit Line -->');
  const rights = tdAfterComment(html, '<!-- Rights Holder -->');

  // medium = best human-readable description, fall back to Material then Technique
  const medium = objectDescription || material || technique || '';

  // --- images: all previewimage src (600px derivatives). First = primary. ---
  const imgs = [...html.matchAll(/<img class="previewimage"[^>]*src="([^"]+)"/g)].map(m => m[1]);

  return { slug, url, artist, title, year, rawCategory, medium, material, technique,
           dimensions, acqYear, objectNumber, creditline, rights, imgs };
}

function classify(rec) {
  // returns { keep:bool, reason, category }
  const rc = rec.rawCategory;
  if (!rc) return { keep: false, reason: 'no-category(likely-3D)' };
  // mumok category cell can be "painting" or sometimes a phrase; match by leading word
  const key = Object.keys(CATEGORY_MAP).find(k => rc === k || rc.startsWith(k));
  if (!key) {
    // explicit out-of-scope or unknown
    const first = rc.split(/[\s,/]/)[0];
    if (OUT_OF_SCOPE.has(rc) || OUT_OF_SCOPE.has(first)) return { keep: false, reason: `out-of-scope:${rc}` };
    return { keep: false, reason: `unmapped-category:${rc}` };
  }
  const category = CATEGORY_MAP[key];
  // value filter: only non-paintings get the study/copy skip
  if (category !== 'painting') {
    const hay = `${rec.title} ${rec.medium} ${rec.objectDescription || ''}`;
    if (SKIP_KEYWORDS.test(hay)) return { keep: false, reason: 'value-filter:study/copy', category };
  }
  return { keep: true, category };
}

async function uploadImage(id, srcUrl) {
  const buf = await fetchBuf(srcUrl);
  const { buffer } = await autocropToWebp(buf);
  const key = `artworks/${COLLECTION_STEM}/${id}-${sha8(srcUrl)}-imageUrl.webp`;
  if (s3) {
    let ok = false;
    for (let t = 1; t <= 4 && !ok; t++) {
      try { await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buffer, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000' })); ok = true; }
      catch (e) { if (t === 4) throw e; await sleep(500 * t); }
    }
  }
  return `${R2_PUBLIC}/${key}`;
}

async function getSlugs() {
  const html = await fetchText(SITEMAP);
  const set = new Set();
  for (const m of html.matchAll(/\/en\/online-collection\/detail\/([a-z0-9-]+)/g)) set.add(m[1]);
  return [...set];
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); } catch { return { doneSlugs: [], artworks: [], stats: {} }; }
}
function saveState(st) { fs.writeFileSync(STATE_PATH, JSON.stringify(st)); }

async function main() {
  const PILOT = Number.isFinite(LIMIT);
  console.log(`[mumok] mode=${PILOT ? `PILOT(limit ${LIMIT})` : 'FULL'} upload=${!NO_UPLOAD && !!s3} out=${OUT_NAME}`);
  const slugs = await getSlugs();
  console.log(`[mumok] sitemap: ${slugs.length} detail slugs`);

  // resumable for full runs; pilot always fresh
  const st = PILOT ? { doneSlugs: [], artworks: [], stats: {} } : loadState();
  const done = new Set(st.doneSlugs);
  const artworks = st.artworks;
  const stats = st.stats.scanned ? st.stats : { scanned: 0, kept: 0, skip_noCat: 0, skip_outScope: 0, skip_noImg: 0, skip_valueFilter: 0, skip_min4: 0, errors: 0, byCat: {} };

  let collected = artworks.length;
  for (const slug of slugs) {
    if (collected >= LIMIT) break;
    if (done.has(slug)) continue;
    const url = `${BASE}/en/online-collection/detail/${slug}`;
    try {
      await sleep(700); // ~1.4 req/s
      const html = await fetchText(url);
      stats.scanned++;
      if (!html) { done.add(slug); continue; }
      const rec = parseDetail(html, slug, url);

      const cls = classify(rec);
      if (!cls.keep) {
        if (cls.reason.startsWith('no-category')) stats.skip_noCat++;
        else if (cls.reason.startsWith('out-of-scope') || cls.reason.startsWith('unmapped')) stats.skip_outScope++;
        else if (cls.reason.startsWith('value-filter')) stats.skip_valueFilter++;
        done.add(slug); continue;
      }
      // image required
      if (!rec.imgs.length) { stats.skip_noImg++; done.add(slug); continue; }
      // min-4 guarantee (title, artist, year, category) — DROP if missing (never placeholder)
      if (!rec.title || !rec.artist || rec.year == null || !cls.category) { stats.skip_min4++; done.add(slug); continue; }

      const id = `mumok-${slug}`;
      const srcImg = rec.imgs[0].startsWith('http') ? rec.imgs[0] : `${BASE}${rec.imgs[0]}`;
      let imageUrl;
      try { imageUrl = await uploadImage(id, srcImg); }
      catch (e) { stats.errors++; fs.appendFileSync(FAILED_PATH, JSON.stringify({ slug, stage: 'image', err: String(e) }) + '\n'); done.add(slug); continue; }

      artworks.push({
        id,
        objectNumber: rec.objectNumber || '',
        title: rec.title,
        artist: rec.artist,            // keep source "Last, First" form
        date: String(rec.year),
        year: rec.year,
        medium: rec.medium || '',
        dimensions: rec.dimensions || '',
        category: cls.category,
        description: '',
        imageUrl,
        thumbnailUrl: srcImg,
        onDisplay: false,
        displayLocation: '',
        sourceUrl: url,
        metadata: {
          rawCategory: rec.rawCategory,
          material: rec.material || undefined,
          technique: rec.technique || undefined,
          acquisitionYear: rec.acqYear || undefined,
          creditline: rec.creditline || undefined,
          rights: rec.rights || undefined,
        },
        original_imageUrl: srcImg,
      });
      stats.kept++;
      stats.byCat[cls.category] = (stats.byCat[cls.category] || 0) + 1;
      collected = artworks.length;
      done.add(slug);

      if (stats.scanned % 100 === 0) {
        console.log(`  scanned ${stats.scanned} | kept ${stats.kept} | noCat ${stats.skip_noCat} noImg ${stats.skip_noImg} outScope ${stats.skip_outScope} | ${JSON.stringify(stats.byCat)}`);
        if (!PILOT) { st.doneSlugs = [...done]; st.artworks = artworks; st.stats = stats; saveState(st); }
      }
    } catch (e) {
      stats.errors++;
      fs.appendFileSync(FAILED_PATH, JSON.stringify({ slug, stage: 'detail', err: String(e) }) + '\n');
      done.add(slug);
    }
  }
  if (!PILOT) { st.doneSlugs = [...done]; st.artworks = artworks; st.stats = stats; saveState(st); }

  const out = {
    museum: 'Museum moderner Kunst Stiftung Ludwig Wien (mumok)',
    collection: 'Flat visual art — paintings (all), prints, photographs & video (value-filtered)',
    website: 'https://www.mumok.at/en/online-collection',
    source: 'mumok.at TYPO3 online-collection — HTML scrape (no API/IIIF); sitemap record list + per-detail parse',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'html-scrape',
    artworks,
  };
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log(`\n[mumok] WROTE ${OUT_PATH} — ${artworks.length} artworks`);
  console.log(`[mumok] stats: ${JSON.stringify(stats, null, 0)}`);
}

main().catch(e => { console.error(e); process.exit(1); });
