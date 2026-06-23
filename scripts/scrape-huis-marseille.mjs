#!/usr/bin/env node
// Huis Marseille, Museum voor Fotografie (Amsterdam) — full collection scraper.
// Source: museum-OWN WordPress site, server-rendered collection archive HTML (no auth).
//   GET https://huismarseille.nl/en/collection/page/{N}/   (60 `.tease` cards/page, ~15 pages)
//
// Why HTML, not REST: the WP REST `/wp/v2/collectie` post type returns 1,759 records but with
//   EMPTY acf/meta/content — it carries NO artist/year/medium/dimensions at all (verified live).
//   The 1,759 also double-counts EN+NL Polylang copies. The real, clean, complete metadata is
//   rendered ONLY in the archive `.tease` cards, which carry everything we need per work:
//     • artist  — <a class="collectie-title" href=".../photographers/{slug}/">Name</a>
//     • title+year — <span class="is-block ..."><i>Title</i>, 2023</span>
//     • data-caption="Artist, <i>Title</i>, [series,] 2023, [WxH cm,] HMA-2023-01,"  (inv + dims)
//     • full image  — the data-fancybox <a href> (originals are 1.5k–5k px) + data-width/height
//   The EN archive = 878 works (876 ≥600px). This museum is photography-only → category=photograph
//   for all (no colour-gating per scope: photographs are never colour-gated).
//
// SCOPE: all flat photographs in-scope (small corpus, no cap). Skip records that lack an image,
//   lack BOTH title and artist, or whose full image is <600px on the long side.
//
// Usage:
//   node scripts/scrape-huis-marseille.mjs --probe   # ~15 works end-to-end + R2 upload, probe JSON
//   node scripts/scrape-huis-marseille.mjs --full    # all in-scope, resumable, full JSON

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

const SLUG = 'huis-marseille';
const COLLECTION_STEM = `${SLUG}-collection`;
const ARCHIVE = 'https://huismarseille.nl/en/collection';
const SITE = 'https://huismarseille.nl';
const UA = 'armin-museum-research/1.0';
const UA_BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const PROGRESS = path.join(STATE_DIR, `${SLUG}-progress.json`);
const FAILED = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : 'probe';
const PROBE_TARGET = 15;
const MAX_PAGES = 40; // safety bound; real archive is ~15 pages

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

const decodeEntities = (s) => (s || '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#8217;/g, '’')
  .replace(/&#8216;/g, '‘').replace(/&#8211;/g, '–').replace(/&#8212;/g, '—')
  .replace(/&#8220;/g, '“').replace(/&#8221;/g, '”')
  .replace(/&hellip;/g, '…').replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).trim();

const stripTags = (s) => decodeEntities((s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// ---------- fetch a page of archive HTML (UA fallback) ----------
async function fetchHtml(url) {
  for (const ua of [UA, UA_BROWSER]) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': ua } });
      if (r.ok) return await r.text();
      if (r.status === 404) return null;
    } catch (e) { /* try next UA */ }
  }
  throw new Error(`fetch failed: ${url}`);
}

// ---------- parse one .tease card → raw work ----------
// Caption shape: "Artist, <i>Title</i>, [series,] YEAR, [W x H cm,] HMA-YYYY-NN,"
function parseCaption(capRaw) {
  // keep <i> boundaries to isolate the title, then strip
  const cap = decodeEntities(capRaw || '');
  const out = { capTitle: '', capYear: null, dimensions: '', objectNumber: '', capArtist: '' };
  // inventory number HMA-YYYY-NN(.x) or similar
  const inv = cap.match(/\bHMA[-\s]?\d{4}[-\s.]?[\dA-Za-z./-]*/i);
  if (inv) out.objectNumber = inv[0].replace(/\s+/g, '-').replace(/,+$/, '').trim();
  // title between first <i>...</i>
  const it = cap.match(/<i>([\s\S]*?)<\/i>/i);
  if (it) out.capTitle = stripTags(it[1]);
  // artist = leading segment before first comma (before the <i> title)
  const head = cap.split(/,\s*<i>/i)[0];
  if (head && head !== cap) out.capArtist = stripTags(head);
  // plain text for year + dimensions
  const txt = stripTags(cap);
  const ym = txt.match(/\b(18|19|20)\d{2}\b/);
  if (ym) out.capYear = parseInt(ym[0], 10);
  // dimensions: a segment containing "cm" (e.g. "120 x 80 cm", "32 x 25,12 cm (per stuk)").
  // Split on commas that are NOT decimal separators (digit,digit) and NOT inside parens.
  for (const seg of txt.split(/,(?![^()]*\))(?!\d)/)) {
    if (/\bcm\b/i.test(seg) && /\d/.test(seg)) { out.dimensions = seg.trim(); break; }
  }
  return out;
}

function parseCards(htmlText) {
  const works = [];
  const cards = htmlText.split(/(?=<li class="tease tease-collectie)/).filter((c) => c.includes('data-fancybox'));
  for (const c of cards) {
    const img = c.match(/<a href="([^"]+)" data-fancybox="gallery" data-caption="([^"]*)" data-width="(\d+)" data-height="(\d+)"/);
    if (!img) continue;
    const imgUrl = img[1];
    const srcW = parseInt(img[3], 10) || null;
    const srcH = parseInt(img[4], 10) || null;

    // artist from collectie-title link (authoritative)
    const am = c.match(/class="collectie-title"[^>]*>([\s\S]*?)<\/a>/);
    const linkArtist = am ? stripTags(am[1]) : '';
    const pm = c.match(/href="(https:\/\/huismarseille\.nl\/en\/photographers\/[^"]+\/)"/);
    const photogUrl = pm ? pm[1] : '';

    // title + year from the grey span "<i>Title</i>, 2023"
    const tm = c.match(/has-text-grey-lighter"[^>]*>([\s\S]*?)<\/span>/);
    let spanTitle = '', spanYear = null;
    if (tm) {
      const inner = tm[1];
      const it = inner.match(/<i>([\s\S]*?)<\/i>/i);
      spanTitle = it ? stripTags(it[1]) : stripTags(inner).replace(/,?\s*(18|19|20)\d{2}.*$/, '').trim();
      const ym = stripTags(inner).match(/\b(18|19|20)\d{2}\b/);
      if (ym) spanYear = parseInt(ym[0], 10);
    }

    const cap = parseCaption(img[2]);

    const artist = linkArtist || cap.capArtist;
    const title = spanTitle || cap.capTitle;
    const year = spanYear != null ? spanYear : cap.capYear;

    works.push({
      imgUrl, srcW, srcH,
      artist, title, year,
      dimensions: cap.dimensions,
      objectNumber: cap.objectNumber,
      sourceUrl: photogUrl || `${ARCHIVE}/`,
    });
  }
  return works;
}

// ---------- collect all cards across the archive (dedup by image URL) ----------
async function collectAll() {
  const seen = new Set();
  const all = [];
  for (let p = 1; p <= MAX_PAGES; p++) {
    const url = p === 1 ? `${ARCHIVE}/` : `${ARCHIVE}/page/${p}/`;
    const htmlText = await fetchHtml(url);
    if (htmlText == null) break; // 404 → past last page
    const cards = parseCards(htmlText);
    if (cards.length === 0) break; // empty page → done
    let added = 0;
    for (const w of cards) {
      if (seen.has(w.imgUrl)) continue;
      seen.add(w.imgUrl);
      all.push(w);
      added++;
    }
    console.log(`  [page ${p}] ${cards.length} cards, +${added} new (total ${all.length})`);
    await sleep(400);
  }
  return all;
}

// ---------- stable id ----------
function makeId(w) {
  if (w.objectNumber) return `${SLUG}-${w.objectNumber.replace(/[^\w.-]/g, '-').toLowerCase()}`;
  return `${SLUG}-${sha(w.imgUrl).slice(0, 12)}`;
}

// ---------- image: download full-size, autocrop, upload to R2 ----------
async function dl(url) {
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': att === 1 ? UA : UA_BROWSER } });
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

async function processImage(w, id) {
  const src = await dl(w.imgUrl);
  const sharp = (await import('sharp')).default;
  const meta = await sharp(src, { limitInputPixels: false }).metadata().catch(() => ({}));
  if (meta.width && Math.max(meta.width, meta.height) < 600) throw new Error(`thumb ${meta.width}x${meta.height}`);
  const { buffer } = await autocropToWebp(src);
  const hash8 = sha(w.imgUrl).slice(0, 8);
  const key = `artworks/${COLLECTION_STEM}/${id}-${hash8}-imageUrl.webp`;
  await uploadR2(key, buffer);
  return { imageUrl: `${R2_PUBLIC}/${key}`, srcW: meta.width || w.srcW || null, srcH: meta.height || w.srcH || null };
}

// ---------- record assembly (min: title|artist + image) ----------
function toArtwork(w, id, imageUrl) {
  return {
    id,
    objectNumber: w.objectNumber || '',
    title: w.title || 'Untitled',
    artist: w.artist || '',
    date: w.year != null ? String(w.year) : '',
    year: w.year,
    medium: '', // not exposed by the source (photography museum; technique not in archive cards)
    dimensions: w.dimensions || '',
    category: 'photograph',
    description: '',
    imageUrl,
    thumbnailUrl: w.imgUrl,
    onDisplay: false,
    displayLocation: '',
    sourceUrl: w.sourceUrl,
    metadata: { source_w: w.srcW || null, source_h: w.srcH || null },
    original_imageUrl: w.imgUrl,
  };
}

function writeCollection(artworks, stem) {
  const payload = {
    museum: 'Huis Marseille, Museum voor Fotografie',
    collection: 'Photography Collection',
    website: 'https://huismarseille.nl/en/collection/',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'html',
    artworks,
  };
  const out = path.join(REPO, 'public/data', `${stem}.json`);
  // compact JSON (no indent) to keep file small per guide cap rule
  fs.writeFileSync(out, JSON.stringify(payload));
  console.log(`[write] ${out} (${artworks.length} works, ${(fs.statSync(out).size / 1e6).toFixed(2)} MB)`);
  return out;
}

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  console.log(`[${MODE}] collecting archive cards …`);
  let works = await collectAll();
  console.log(`[${MODE}] collected ${works.length} unique works`);

  // require an image + (title or artist)
  const before = works.length;
  works = works.filter((w) => w.imgUrl && (w.title || w.artist));
  console.log(`[${MODE}] ${works.length} have image + (title|artist) (dropped ${before - works.length})`);

  // resume support (full mode)
  let progress = { done: {} };
  if (MODE === 'full' && fs.existsSync(PROGRESS)) {
    try { progress = JSON.parse(fs.readFileSync(PROGRESS, 'utf8')); } catch { /* fresh */ }
    console.log(`[full] resume: ${Object.keys(progress.done).length} already done`);
  }

  let candidates = works;
  if (MODE === 'probe') candidates = works.slice(0, PROBE_TARGET);
  console.log(`[${MODE}] processing ${candidates.length} → R2 …`);

  const artworks = [];
  // seed already-done from progress (full mode)
  if (MODE === 'full') for (const id in progress.done) artworks.push(progress.done[id]);

  let done = 0, imgErr = 0, dropSmall = 0;
  const CONC = MODE === 'probe' ? 3 : 4;
  let idx = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (idx < candidates.length) {
      const w = candidates[idx++];
      const id = makeId(w);
      if (MODE === 'full' && progress.done[id]) continue;
      try {
        const { imageUrl, srcW, srcH } = await processImage(w, id);
        w.srcW = srcW; w.srcH = srcH;
        const a = toArtwork(w, id, imageUrl);
        artworks.push(a);
        if (MODE === 'full') {
          progress.done[id] = a;
          if (Object.keys(progress.done).length % 25 === 0) fs.writeFileSync(PROGRESS, JSON.stringify(progress));
        }
      } catch (e) {
        const msg = String(e.message || e);
        if (/thumb/.test(msg)) dropSmall++; else imgErr++;
        fs.appendFileSync(FAILED, JSON.stringify({ id, url: w.imgUrl, err: msg }) + '\n');
        if (imgErr + dropSmall <= 6) console.log(`  img err id=${id}: ${msg}`);
      }
      if (++done % 25 === 0) console.log(`  …${done}/${candidates.length} (ok ${artworks.length}, imgErr ${imgErr}, small ${dropSmall})`);
    }
  }));

  if (MODE === 'full') fs.writeFileSync(PROGRESS, JSON.stringify(progress));

  // dedup by id (resume seeds + new) keeping first
  const byId = new Map();
  for (const a of artworks) if (!byId.has(a.id)) byId.set(a.id, a);
  const finalArts = [...byId.values()].sort((x, y) => x.id.localeCompare(y.id));

  const stem = MODE === 'probe' ? `${COLLECTION_STEM}-probe` : COLLECTION_STEM;
  const out = writeCollection(finalArts, stem);

  // probe report
  if (MODE === 'probe') {
    const cov = (f) => finalArts.filter((a) => a[f] !== '' && a[f] != null).length;
    console.log('\n[probe] coverage:');
    console.log('  title  :', cov('title'), '/', finalArts.length);
    console.log('  artist :', cov('artist'), '/', finalArts.length);
    console.log('  year   :', cov('year'), '/', finalArts.length);
    console.log('  dims   :', cov('dimensions'), '/', finalArts.length);
    console.log('  objNo  :', cov('objectNumber'), '/', finalArts.length);
    console.log('\n[probe] samples:');
    for (const a of finalArts.slice(0, 5)) {
      console.log(`  - "${a.title}" / ${a.artist} / ${a.year} / ${a.objectNumber} / ${a.dimensions || '(no dims)'}`);
      console.log(`    ${a.imageUrl}`);
    }
  }
  console.log(`\n[${MODE}] DONE. wrote ${finalArts.length} | imgErr ${imgErr} | tooSmall ${dropSmall} | ${out}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
