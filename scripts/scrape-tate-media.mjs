#!/usr/bin/env node
// Tate (Tate Modern) — TIME-BASED / MEDIA ART collection scraper.
// Source: Tate's open collection metadata (CC0), github.com/tategallery/collection
//   artwork_data.csv  — ~69,200 works; fields: id, accession_number, artist, title,
//   dateText, medium, year, dimensions, thumbnailUrl, url, …
//
// WHY a live-page step (not just the CSV thumbnailUrl):
//   The dataset was frozen Oct 2014 and explicitly EXCLUDES images. Its `thumbnailUrl`
//   column points at www.tate.org.uk/art/images/work/… which now 404s (Tate migrated its
//   image CDN to media.tate.org.uk and re-hashed derivatives). The only reliable current
//   image is the og:image on each work's live artwork page (a `media.tate.org.uk/…width-600…`
//   derivative). So we fetch the DETAIL page per candidate and read og:image — guide-compliant
//   detail-page parsing — and SKIP works with no public image (rights-restricted) or dead page.
//
// SCOPE: media / time-based art only. We keep works whose `medium` names a moving-image /
//   time-based form (video, film NN mm, projection, slide projection, audio/sound recording,
//   moving image, time-based, animation, dvd, …). Screenprints are excluded. category = 'video'
//   for every kept work (how the app stores media-art, matching scrape-njpac.mjs).
//   No year filter (media art is contemporary) — we keep meaningful works that have an image.
//
// Image: og:image (media.tate.org.uk width-600 derivative; ~600px — a usable representative
//   still/frame for media works) -> webp(q85, ≤2048 long edge) -> R2.
//
// Usage:
//   node scripts/scrape-tate-media.mjs --pilot   # ≤30 in-scope works end-to-end (R2 live)
//   node scripts/scrape-tate-media.mjs --full    # all in-scope, resumable
// State: scripts/.state/tate-media-progress.json ; failures -> scripts/.state/tate-media-failed.ndjson

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { autocropToWebp } from './lib/autocrop.mjs';

const require = createRequire(import.meta.url);
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const sharp = require('sharp');
const REPO = path.resolve(fileURLToPath(import.meta.url), '../..');
require('dotenv').config({ path: path.join(REPO, '.env.local') });

const SLUG = 'tate-media';
const COLLECTION_STEM = `${SLUG}-collection`;
const CSV_URL = 'https://raw.githubusercontent.com/tategallery/collection/master/artwork_data.csv';
const CSV_CACHE = path.join(REPO, 'scripts/.state/tate-artwork_data.csv');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const PROGRESS = path.join(STATE_DIR, `${SLUG}-progress.json`);
const FAILED = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : 'pilot';
const PILOT_TARGET = 30;

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ---------- CSV ingest ----------
async function loadCsv() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  if (!fs.existsSync(CSV_CACHE)) {
    console.log('[csv] downloading artwork_data.csv (~24MB)…');
    const r = await fetch(CSV_URL, { headers: { 'User-Agent': UA } });
    if (!r.ok) throw new Error(`CSV HTTP ${r.status}`);
    fs.writeFileSync(CSV_CACHE, Buffer.from(await r.arrayBuffer()));
  }
  const text = fs.readFileSync(CSV_CACHE, 'utf8').replace(/^﻿/, '');
  return parseCsv(text);
}

// Minimal RFC-4180 CSV parser (handles quotes, embedded commas/newlines).
function parseCsv(text) {
  const rows = [];
  let field = '', row = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); field = ''; row = []; }
    else if (c === '\r') { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift();
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

// ---------- scope filter: media / time-based art ----------
const TIMEBASED = /\b(video|film,?\s*\d+\s?mm|16\s?mm|35\s?mm|8\s?mm|super\s?8|cine|projection|projected image|audio|sound recording|moving image|time[- ]based|animation|dvd|videodisc|videotape|u-matic|betacam)\b/i;
const EXCLUDE_PRINT = /screenprint|silkscreen|screen ?print/i;
function isMedia(medium) {
  const m = medium || '';
  if (EXCLUDE_PRINT.test(m) && !/\bvideo|projection\b/i.test(m)) return false;
  if (!TIMEBASED.test(m)) return false;
  // reject paintings/objects where a media keyword is incidental (e.g. "magnetic tape on canvas")
  if (/on canvas|on board|on paper|on panel/i.test(m) && !/\b(video|film|projection|slide|dvd|moving image|audio|sound recording)\b/i.test(m)) return false;
  return true;
}

// ---------- live detail page: current image via og:image ----------
async function getHtml(url) {
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (r.status === 404) return { notFound: true };
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return { html: await r.text() };
    } catch (e) { if (att === 3) throw e; await sleep(700 * att); }
  }
}
function ogImage(html) {
  const m = html.match(/<meta property="og:image" content="([^"]+)"/);
  const og = m ? m[1] : null;
  // a real current image is a media.tate.org.uk width-NNN derivative (not a share/logo default)
  return og && /media\.tate\.org\.uk/.test(og) && /\.width-\d+_/.test(og) ? og : null;
}

// ---------- image: download -> webp -> R2 ----------
async function dl(url) {
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Referer: 'https://www.tate.org.uk/' } });
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
    } catch (e) { if (att === 4) throw e; await sleep(500 * att); }
  }
}
async function processImage(ogUrl, id) {
  const src = await dl(ogUrl);
  const meta = await sharp(src).metadata().catch(() => ({}));
  const { buffer } = await autocropToWebp(src); // default: webp(2048/q85), no trim
  const hash8 = sha(ogUrl).slice(0, 8);
  const key = `artworks/${COLLECTION_STEM}/${id}-${hash8}-imageUrl.webp`;
  await uploadR2(key, buffer);
  return { imageUrl: `${R2_PUBLIC}/${key}`, srcW: meta.width || null, srcH: meta.height || null };
}

// ---------- assembly ----------
function toArtwork(r, ogUrl, imageUrl) {
  const year = parseInt((r.year || '').match(/\d{4}/)?.[0] || (r.dateText || '').match(/\d{4}/)?.[0] || '', 10);
  const title = (r.title || '').trim();
  const artist = (r.artist || '').trim(); // Tate CSV is "Surname, Forename" — keep source format (guide §2)
  if (!title || !artist || !Number.isFinite(year)) return null; // min-4 guard (category is always 'video')
  return {
    id: `${SLUG}-${r.accession_number || r.id}`,
    objectNumber: r.accession_number || '',
    title,
    artist,
    date: r.dateText || '',
    year,
    medium: r.medium || '',
    dimensions: r.dimensions || '',
    category: 'video',
    description: '',
    imageUrl,
    thumbnailUrl: ogUrl,
    onDisplay: false,
    displayLocation: '',
    sourceUrl: (r.url || '').replace(/^http:\/\//, 'https://'),
    metadata: { tateId: r.id, acquisitionYear: r.acquisitionYear || '', creditLine: r.creditLine || '' },
    original_imageUrl: ogUrl,
  };
}

function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS, 'utf8')); } catch { return { done: {}, skipped: {} }; }
}
const saveProgress = (st) => fs.writeFileSync(PROGRESS, JSON.stringify(st));

function writeCollection(artworks, stem) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'Tate Modern',
    collection: 'Time-Based Media',
    website: 'https://www.tate.org.uk/art/artworks',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'bulk-csv+detail',
    category_breakdown: cats,
    artworks,
  };
  const out = path.join(REPO, 'public/data', `${stem}.json`);
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
  console.log(`[write] ${out} (${artworks.length} works) breakdown=`, cats);
}

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const st = MODE === 'full' ? loadProgress() : { done: {}, skipped: {} };

  const all = await loadCsv();
  console.log(`[csv] ${all.length} total Tate artworks`);
  const media = all.filter((r) => isMedia(r.medium));
  console.log(`[scope] ${media.length} media/time-based candidates (by medium)`);

  const artworks = Object.values(st.done).filter(Boolean);
  const haveIds = new Set(artworks.map((a) => a.id));
  let kept = artworks.length, noImg = 0, page404 = 0, minDrop = 0, imgErr = 0, fetched = 0;

  for (const r of media) {
    if (MODE === 'pilot' && kept >= PILOT_TARGET) break;
    const key = r.accession_number || r.id;
    if (st.done[key] || st.skipped[key]) continue;

    const url = (r.url || '').replace(/^http:\/\//, 'https://');
    let page;
    try { page = await getHtml(url); fetched++; await sleep(300); }
    catch (e) { fs.appendFileSync(FAILED, JSON.stringify({ key, stage: 'page', url, err: String(e.message || e) }) + '\n'); continue; }

    if (page.notFound) {
      page404++; st.skipped[key] = 'page-404';
      if (MODE === 'full') saveProgress(st);
      continue;
    }
    const ogUrl = ogImage(page.html);
    if (!ogUrl) {
      noImg++; st.skipped[key] = 'no-image'; // rights-restricted: no public image
      if (MODE === 'full') saveProgress(st);
      continue;
    }

    try {
      const id = `${SLUG}-${key}`;
      const { imageUrl, srcW, srcH } = await processImage(ogUrl, id);
      const w = toArtwork(r, ogUrl, imageUrl);
      if (!w) { minDrop++; st.skipped[key] = 'min4-drop'; console.log(`  [min4-drop] ${key} title=${JSON.stringify(r.title)} year=${r.year}`); }
      else {
        if (!haveIds.has(w.id)) { artworks.push(w); haveIds.add(w.id); }
        st.done[key] = w; kept++;
        console.log(`  [ok] ${w.id} video ${srcW}x${srcH} "${w.title.slice(0, 42)}" — ${w.artist.slice(0, 28)}`);
      }
    } catch (e) {
      imgErr++; fs.appendFileSync(FAILED, JSON.stringify({ key, stage: 'image', url: ogUrl, err: String(e.message || e) }) + '\n');
      console.log(`  [img-err] ${key}: ${e.message}`);
    }
    if (MODE === 'full') saveProgress(st);
    if ((fetched % 50) === 0) console.log(`  …progress fetched ${fetched}/${media.length} (kept ${kept}, no-img ${noImg}, 404 ${page404}, imgErr ${imgErr})`);
  }

  artworks.sort((a, b) => a.id.localeCompare(b.id));
  writeCollection(artworks, MODE === 'pilot' ? `${COLLECTION_STEM}-pilot` : COLLECTION_STEM);
  console.log(`[${MODE}] DONE. kept ${artworks.length} | no-image ${noImg} | page-404 ${page404} | min4-drops ${minDrop} | img errors ${imgErr} | pages fetched ${fetched}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
