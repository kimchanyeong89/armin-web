#!/usr/bin/env node
// Musée Nicéphore Niépce (Chalon-sur-Saône) — photography collection scraper.
// Source: museum-OWN "Open musée Niépce" free-image bank (libres de droits), no auth.
//   List : GET https://www.open-museeniepce.com/recherche-photos?page=P&length=200
//          → 50/200 <a href="/accueil/photo,{id}"> per page (~20,750 photos, last page 415@50).
//   Detail: GET https://www.open-museeniepce.com/accueil/photo,{id}
//          → French labelled fields: "Titre inscrit", "Date", "Auteur", "Technique",
//            "Mots-clés"; objectNumber = the protectimage/download filename stem.
//   Image : GET https://www.open-museeniepce.com/downloadPhoto?id={id}
//          → full-res PNG (native ~1024px max-side, libre de droits, NOT watermarked).
//
// SCOPE: the bank is 100% photographs ("Cette collection est la vôtre !" — 20 000
//   photographies libres de droits). Every record → category 'photograph'. Photographs
//   are NEVER colour-gated (most are gélatino-bromure noir et blanc — keep them all).
//   No 3D objects appear in this image bank (cameras live on museeniepce.com, not here).
//
// Usage:
//   node scripts/scrape-niepce-chalon.mjs --probe   # ~15 works end-to-end + R2 upload → probe JSON
//   node scripts/scrape-niepce-chalon.mjs --full     # all photos, resumable → collection JSON

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

const SLUG = 'niepce-chalon';
const COLLECTION_STEM = `${SLUG}-collection`;
const BASE = 'https://www.open-museeniepce.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const PROGRESS = path.join(STATE_DIR, `${SLUG}-progress.json`);
const FAILED = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : 'probe';
const PROBE_TARGET = 15;
const PAGE_LEN = 200;          // list page size (server caps at 50 by row but honours length param)
const CONC = 4;                // image concurrency
const MAX_JSON_BYTES = 23 * 1024 * 1024;

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const decodeEntities = (s) => (s || '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&rsquo;|&#8217;/g, '’')
  .replace(/&lsquo;|&#8216;/g, '‘').replace(/&ndash;|&#8211;/g, '–').replace(/&mdash;|&#8212;/g, '—')
  .replace(/&agrave;/g, 'à').replace(/&eacute;/g, 'é').replace(/&egrave;/g, 'è').replace(/&ecirc;/g, 'ê')
  .replace(/&ccedil;/g, 'ç').replace(/&ocirc;/g, 'ô').replace(/&ucirc;/g, 'û').replace(/&icirc;/g, 'î')
  .replace(/&ldquo;/g, '“').replace(/&rdquo;/g, '”').replace(/&hellip;/g, '…').replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).trim();

async function getText(url, tries = 3) {
  for (let att = 1; att <= tries; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'fr,en;q=0.8' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) { if (att === tries) throw e; await sleep(500 * att); }
  }
}

// ---------- 1) harvest all photo ids by paging the search ----------
function idsFromListHtml(html) {
  // detail links render as /recherche-photos/photo,{id} on list pages (and /accueil/photo,{id}
  // on the homepage) — match the path-agnostic "photo,{id}" inside an open-museeniepce href.
  const out = [];
  const re = /open-museeniepce\.com\/[a-z-]+\/photo,(\d+)/gi;
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

async function harvestIds() {
  const seen = new Set();
  const ids = [];
  let page = 1;
  let empty = 0;
  while (true) {
    const html = await getText(`${BASE}/recherche-photos?page=${page}&length=${PAGE_LEN}&resetSearch=${page === 1 ? 1 : 0}`);
    const pageIds = idsFromListHtml(html).filter((id) => !seen.has(id));
    if (pageIds.length === 0) {
      empty++;
      if (empty >= 2) break;          // two consecutive empty pages → done
    } else {
      empty = 0;
      for (const id of pageIds) { seen.add(id); ids.push(id); }
    }
    if (page % 10 === 0) console.log(`  [harvest] page ${page} … ${ids.length} ids`);
    page++;
    await sleep(250);
    if (page > 600) break;            // hard safety stop (~120k ids ceiling)
  }
  console.log(`[harvest] collected ${ids.length} unique photo ids over ${page - 1} pages`);
  return ids;
}

// ---------- 2) detail page → metadata ----------
function fieldAfter(lines, label) {
  // labels render as "<Label> :" on their own line, value on the next non-empty line.
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l === `${label} :` || l === `${label}:`) {
      const v = lines[i + 1] || '';
      // guard: next line must not itself be another label
      if (/ :$/.test(v) || /^:/.test(v)) return '';
      return v.trim();
    }
  }
  return '';
}

function parseDetail(id, html) {
  const h2 = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  const text = decodeEntities(h2.replace(/<[^>]+>/g, '\n'));
  const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);

  // title fallback: "Titre inscrit" → "Titre" → "Légende" (caption; many records have only this)
  const title = fieldAfter(lines, 'Titre inscrit') || fieldAfter(lines, 'Titre') || fieldAfter(lines, 'Légende') || '';
  const dateStr = fieldAfter(lines, 'Date') || '';
  const artist = fieldAfter(lines, 'Auteur') || '';
  const medium = fieldAfter(lines, 'Technique') || '';
  const keywords = fieldAfter(lines, 'Mots-clés') || '';

  // objectNumber = protectimage / download filename stem (museum inventory no.)
  const fm = html.match(/protectimage\?img=([^"&]+?)\.(?:jpg|jpeg|png)/i);
  const objectNumber = fm ? decodeURIComponent(fm[1]).trim() : '';

  // year = first 4-digit run in the French date string
  const ym = dateStr.match(/\b(1[5-9]\d{2}|20\d{2})\b/);
  const year = ym ? parseInt(ym[1], 10) : null;

  return { id, title, artist, dateStr, medium, keywords, objectNumber, year,
    sourceUrl: `${BASE}/accueil/photo,${id}` };
}

async function fetchDetail(id) {
  const html = await getText(`${BASE}/accueil/photo,${id}`);
  return parseDetail(id, html);
}

// ---------- 3) image: download full-res, webp, upload to R2 ----------
async function dlImage(id) {
  const url = `${BASE}/downloadPhoto?id=${id}`;
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
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

async function processImage(rec) {
  const src = await dlImage(rec.id);
  const sharp = (await import('sharp')).default;
  const meta = await sharp(src, { limitInputPixels: false }).metadata().catch(() => ({}));
  if (meta.width && Math.max(meta.width, meta.height) < 600) throw new Error(`thumb ${meta.width}x${meta.height}`);
  const { buffer } = await autocropToWebp(src);          // webp 2048/q85 (no white-trim by default)
  const dlUrl = `${BASE}/downloadPhoto?id=${rec.id}`;
  const hash8 = sha(dlUrl).slice(0, 8);
  const key = `artworks/${COLLECTION_STEM}/${SLUG}-${rec.id}-${hash8}-imageUrl.webp`;
  await uploadR2(key, buffer);
  return { imageUrl: `${R2_PUBLIC}/${key}`, srcW: meta.width || null, srcH: meta.height || null };
}

// ---------- 4) record assembly (min: title + image; artist/date best-effort) ----------
function toArtwork(rec, imageUrl) {
  if (!rec.title || !imageUrl) return null;
  return {
    id: `${SLUG}-${rec.id}`,
    objectNumber: rec.objectNumber || '',
    title: rec.title,
    artist: rec.artist || 'Anonyme',
    date: rec.dateStr || (rec.year != null ? String(rec.year) : ''),
    year: rec.year,
    medium: rec.medium || '',
    dimensions: '',
    category: 'photograph',
    description: rec.keywords ? `Mots-clés : ${rec.keywords}` : '',
    imageUrl,
    thumbnailUrl: '',
    onDisplay: false,
    displayLocation: '',
    sourceUrl: rec.sourceUrl,
    metadata: { openId: rec.id, keywords: rec.keywords || '' },
    original_imageUrl: `${BASE}/downloadPhoto?id=${rec.id}`,
  };
}

function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS, 'utf8')); }
  catch { return { ids: [], done: {}, artworks: [] }; }
}
function saveProgress(p) { fs.writeFileSync(PROGRESS, JSON.stringify(p)); }

function writeCollection(artworks, stem) {
  // sort by id (numeric portion) for stability
  artworks.sort((a, b) => Number(a.id.replace(`${SLUG}-`, '')) - Number(b.id.replace(`${SLUG}-`, '')));
  const payload = {
    museum: 'Musée Nicéphore Niépce',
    collection: 'Photographs (Open musée Niépce — libres de droits)',
    website: 'https://www.open-museeniepce.com/',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'html',
    artworks,
  };
  const out = path.join(REPO, 'public/data', `${stem}.json`);
  // COMPACT json (no indent) to stay under size cap
  let json = JSON.stringify(payload);
  if (Buffer.byteLength(json) > MAX_JSON_BYTES) {
    // drop the description (keywords) field first, then trim oldest-id overflow if still too big
    payload.artworks.forEach((a) => { a.description = ''; a.metadata.keywords = ''; });
    json = JSON.stringify(payload);
    while (Buffer.byteLength(json) > MAX_JSON_BYTES && payload.artworks.length > 0) {
      payload.artworks.pop();
      payload.total_count = payload.artworks.length;
      json = JSON.stringify(payload);
    }
  }
  fs.writeFileSync(out, json);
  console.log(`[write] ${out} (${payload.artworks.length} works, ${(Buffer.byteLength(json) / 1048576).toFixed(1)} MB)`);
  return out;
}

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });

  if (MODE === 'probe') {
    // Probe: grab the first list page, take ~15 ids, run full pipeline end-to-end.
    const html = await getText(`${BASE}/recherche-photos?page=1&length=${PAGE_LEN}&resetSearch=1`);
    const ids = [...new Set(idsFromListHtml(html))].slice(0, PROBE_TARGET);
    console.log(`[probe] testing ${ids.length} ids: ${ids.join(', ')}`);
    const artworks = [];
    let imgErr = 0, parseEmpty = 0;
    for (const id of ids) {
      try {
        const rec = await fetchDetail(id);
        if (!rec.title) { parseEmpty++; console.log(`  [warn] id=${id}: no title parsed`); }
        const { imageUrl, srcW, srcH } = await processImage(rec);
        const w = toArtwork(rec, imageUrl);
        if (w) { artworks.push(w); console.log(`  ok ${id}: "${w.title.slice(0, 42)}" | ${w.artist.slice(0, 30)} | ${w.date} | ${srcW}x${srcH}`); }
        await sleep(300);
      } catch (e) { imgErr++; console.log(`  ERR ${id}: ${e.message}`); }
    }
    writeCollection(artworks, `${COLLECTION_STEM}-probe`);
    console.log(`\n[probe] DONE: ${artworks.length}/${ids.length} ok | imgErr ${imgErr} | empty-title ${parseEmpty}`);
    if (artworks.length === 0) process.exit(1);
    return;
  }

  // ---- full: resumable ----
  let prog = loadProgress();
  if (!prog.ids || prog.ids.length === 0) {
    prog.ids = await harvestIds();
    prog.done = prog.done || {};
    prog.artworks = prog.artworks || [];
    saveProgress(prog);
  } else {
    console.log(`[full] resuming: ${prog.ids.length} ids, ${prog.artworks.length} already done`);
  }

  const todo = prog.ids.filter((id) => !prog.done[id]);
  console.log(`[full] ${todo.length} remaining of ${prog.ids.length}`);

  let idx = 0, processed = 0, imgErr = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (idx < todo.length) {
      const id = todo[idx++];
      try {
        const rec = await fetchDetail(id);
        const { imageUrl } = await processImage(rec);
        const w = toArtwork(rec, imageUrl);
        if (w) prog.artworks.push(w);
        prog.done[id] = 1;
      } catch (e) {
        imgErr++;
        fs.appendFileSync(FAILED, JSON.stringify({ id, err: String(e.message || e) }) + '\n');
        prog.done[id] = 0;             // mark attempted-but-failed (won't retry within run; cleared on rerun if 0? no — keep)
        if (imgErr <= 8) console.log(`  img/parse err id=${id}: ${e.message}`);
      }
      if (++processed % 100 === 0) { saveProgress(prog); console.log(`  …${processed}/${todo.length} (ok ${prog.artworks.length}, err ${imgErr})`); }
    }
  }));

  saveProgress(prog);
  writeCollection(prog.artworks, COLLECTION_STEM);
  console.log(`\n[full] DONE: collected ${prog.artworks.length} | img/parse errors ${imgErr}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
