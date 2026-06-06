#!/usr/bin/env node
// Galeri Nasional Indonesia scraper — gni.kemenbud.go.id (Next.js).
// DETAIL-PAGE PARSE (not filename shortcut): each artwork's detail page flight
// payload contains h1=title, h2=category, and body-lg <p> = artist(dates)/medium/dimensions/year.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config({ path: path.resolve(fileURLToPath(import.meta.url), '../../.env.local') });

const STEM = 'galnas-collection';
const OUT_JSON = `public/data/${STEM}.json`;
const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const UA = 'Mozilla/5.0 (compatible; armin-museum-research/1.0)';
const BASE = 'https://gni.kemenbud.go.id';

const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const hash8 = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 8);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// Concatenate Next.js flight payload chunks into one decoded string
function flightText(html) {
  return [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)]
    .map(m => { try { return JSON.parse(m[1]); } catch { return ''; } })
    .join('');
}

// Parse the detail page: title, category, and the 4 body-lg meta lines
function parseDetail(html) {
  const flight = flightText(html);
  const out = { title: '', category: '', artist: null, born: null, died: null, medium: '', dimensions: '', year: null };

  const titleM = flight.match(/"className":"heading-xl[^"]*","children":"((?:[^"\\]|\\.)*)"/);
  if (titleM) out.title = titleM[1].replace(/\\"/g, '"').trim();
  const catM = flight.match(/"className":"body-lg text-muted-foreground","children":"([^"]+)"/);
  if (catM) out.category = catM[1].trim();

  // All plain body-lg <p> children (the meta block: artist+dates / medium / dimensions / year)
  const metaLines = [...flight.matchAll(/"className":"body-lg","children":"((?:[^"\\]|\\.)*)"/g)]
    .map(m => m[1].replace(/\\"/g, '"').trim())
    .filter(Boolean);

  for (const line of metaLines) {
    const dates = line.match(/\((\d{4})\s*[-–]\s*(\d{4})?\)/);
    if (dates && !out.artist) {                 // "S. Prinka (1947-2004)" → artist
      out.artist = line.replace(/\s*\(.*$/, '').trim();
      out.born = Number(dates[1]); if (dates[2]) out.died = Number(dates[2]);
      continue;
    }
    if (/\d+\s*[x×]\s*\d+/.test(line) && /cm|mm/i.test(line)) { out.dimensions = line; continue; }  // "61 x 71 cm"
    if (/^\(?c?\.?\s*\d{3,4}\)?$/.test(line.replace(/\s/g, '')) || /^\d{4}\s*[-–]\s*\d{4}$/.test(line)) {
      const y = line.match(/\d{4}/); if (y && !out.year) { out.year = Number(y[0]); continue; }
    }
    // remaining non-artist, non-dim, non-year line → medium (e.g. "Drawing pen pada kertas", "Cat minyak")
    if (!out.medium && line.length < 120 && !/^\d{4}$/.test(line)) out.medium = line;
  }
  // If artist line had no dates, first meta line is artist
  if (!out.artist && metaLines.length) {
    out.artist = metaLines[0].replace(/\s*\(.*$/, '').trim();
    if (out.medium === metaLines[0]) out.medium = '';
  }
  return out;
}

async function r2Exists(key) { try { await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key })); return true; } catch { return false; } }
async function r2Upload(key, buf) {
  await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buf, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000' }));
}
async function downloadImage(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Referer: BASE }, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024) throw new Error(`tiny: ${buf.length}B`);
  return buf;
}

const CAT_MAP = { painting: 'painting', drawing: 'drawing', sketch: 'drawing', print: 'print', photograph: 'photograph' };

async function main() {
  console.log('[galnas] scrape begin (detail-page parse)');
  // 1. Collect detail URL + image from category pages
  const items = new Map();
  for (const [slug] of [['lukisan'], ['drawing']]) {
    const html = await fetchHtml(`${BASE}/en/koleksi/${slug}`);
    const detailLinks = [...new Set([...html.matchAll(new RegExp(`href="(/en/koleksi/${slug}/[^"]+)"`, 'g'))].map(m => m[1]))];
    for (const dl of detailLinks) {
      const idx = html.indexOf(`href="${dl}"`);
      const win = html.slice(Math.max(0, idx - 800), idx + 1500);
      const imgM = win.match(/\/_next\/image\?url=(%2Fimages%2Fkoleksi%2F[^&"]+)/);
      const imgPath = imgM ? decodeURIComponent(imgM[1]) : null;
      if (imgPath) items.set(BASE + dl, { detailUrl: BASE + dl, imgPath });
    }
    console.log(`[galnas] ${slug}: ${detailLinks.length} detail links`);
  }
  console.log(`[galnas] total: ${items.size}`);

  // 2. For each: fetch detail page → parse all metadata → image → R2
  const artworks = [];
  const failed = [];
  let i = 0;
  for (const it of items.values()) {
    i++;
    let meta;
    try { meta = parseDetail(await fetchHtml(it.detailUrl)); }
    catch (e) { failed.push({ url: it.detailUrl, reason: `detail: ${e.message}` }); continue; }
    const category = CAT_MAP[(meta.category || '').toLowerCase()] || 'painting';
    const title = meta.title || decodeURIComponent(it.imgPath.split('/').pop().replace(/\.jpg$/i, '')).replace(/_/g, ' ');
    const artist = meta.artist || 'Anonymous';
    const imageUrl = BASE + it.imgPath;
    const slug = it.detailUrl.split('/').pop();
    const id = `galnas-${slug}`;
    const key = `artworks/${STEM}/${id}-${hash8(imageUrl)}-imageUrl.webp`;
    try {
      if (!await r2Exists(key)) {
        const buf = await downloadImage(imageUrl);
        const webp = await sharp(buf, { limitInputPixels: false })
                       .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
                       .webp({ quality: 85 }).toBuffer();
        await r2Upload(key, webp);
      }
      artworks.push({
        id, objectNumber: slug,
        title, artist,
        date: meta.year ? String(meta.year) : null,
        year: meta.year,
        medium: meta.medium || '',
        dimensions: meta.dimensions || '',
        category,
        description: '',
        imageUrl: `${R2_PUBLIC}/${key}`,
        thumbnailUrl: `${BASE}/_next/image?url=${encodeURIComponent(it.imgPath)}&w=640&q=75`,
        onDisplay: true, displayLocation: '',
        sourceUrl: it.detailUrl,
        metadata: { galnasSlug: slug, artistBorn: meta.born, artistDied: meta.died },
        original_imageUrl: imageUrl,
      });
      console.log(`[galnas] ${i}/${items.size} ok: ${artist} — ${title} | ${meta.year ?? '?'} | ${meta.medium || '-'} | ${meta.dimensions || '-'}`);
    } catch (e) {
      failed.push({ id, reason: e.message });
    }
    await sleep(150);
  }

  const out = {
    museum: 'Galeri Nasional Indonesia',
    collection: 'Online catalog (paintings + drawings)',
    website: 'https://gni.kemenbud.go.id/en/koleksi',
    source: 'gni.kemenbud.go.id detail-page flight-payload parse',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'html-detail',
    artworks,
  };
  fs.writeFileSync(path.join(REPO_ROOT, OUT_JSON), JSON.stringify(out, null, 2));
  const cov = k => artworks.filter(a => a[k] && (typeof a[k] === 'string' ? a[k].trim().length : true)).length;
  console.log(`\n[galnas] wrote ${OUT_JSON} (${artworks.length}, ${failed.length} failed)`);
  console.log(`coverage: title ${cov('title')} artist ${cov('artist')} year ${artworks.filter(a=>a.year!=null).length} medium ${cov('medium')} dim ${cov('dimensions')}`);
}

main().catch(e => { console.error(e); process.exit(1); });
