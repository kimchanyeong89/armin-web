#!/usr/bin/env node
// Iziko SANG scraper — iziko.org.za WP REST API, "masterpiece" custom post type.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config({ path: path.resolve(fileURLToPath(import.meta.url), '../../.env.local') });

const STEM = 'iziko-collection';
const OUT_JSON = `public/data/${STEM}.json`;
const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const UA = 'Mozilla/5.0 (compatible; armin-museum-research/1.0)';
const BASE = 'https://www.iziko.org.za';

const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const hash8 = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 8);
function dec(s) { return (s || '').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, ' '); }

// "Masterpiece of the month: Irma Stern, Lake Kivu, Congo (1946)" → {artist, title, year}
// Also handles year forms in title: (c.1870), (1833-4), (1620-30), (undated...).
function parseTitle(rawTitle) {
  const t = dec(rawTitle).replace(/<[^>]+>/g, '').trim();
  const cleaned = t.replace(/^Masterpiece of the [Mm]onth:?\s*/i, '').trim();
  // a series-intro post with no "Artist, Title" structure → not a real artwork
  if (!cleaned || /^Masterpiece of the Month$/i.test(cleaned)) return null;
  // pull any 4-digit year anywhere in the string (first one wins)
  const yAny = cleaned.match(/\(?\s*c?\.?\s*(\d{4})/);
  const year = yAny ? Number(yAny[1]) : null;
  const m = cleaned.match(/^(.+?),\s*(.+)$/);
  if (m) {
    let title = m[2].trim();
    return { artist: m[1].trim(), title, year };
  }
  return { artist: 'Unknown', title: cleaned, year };
}

// Body text opens with "Artist, Title (Year), medium, W x H cm" — pull medium + dimensions.
function parseBody(contentHtml) {
  const text = dec(contentHtml.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  const out = { medium: '', dimensions: '' };
  const dimM = text.match(/([\d.,]+\s*[x×]\s*[\d.,]+(?:\s*[x×]\s*[\d.,]+)?\s*(?:cm|mm))/i);
  if (dimM) out.dimensions = dimM[1].trim();
  // medium = phrase between "(YYYY)," and the dimensions (or first sentence)
  const medM = text.match(/\(\d{4}\)\s*,\s*([^,.]+?)\s*,\s*[\d.,]+\s*[x×]/i);
  if (medM) out.medium = medM[1].trim();
  else {
    const medM2 = text.match(/\(\d{4}\)\s*,\s*([a-z][^,.]{2,40})/i);  // medium w/o dims
    if (medM2) out.medium = medM2[1].trim();
  }
  return out;
}

async function r2Exists(key) { try { await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key })); return true; } catch { return false; } }
async function r2Upload(key, buf) {
  await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buf, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000' }));
}
async function downloadImage(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024) throw new Error(`tiny: ${buf.length}B`);
  return buf;
}

async function main() {
  console.log(`[iziko] scrape begin`);
  // Fetch all masterpieces (13 total, fits in 1 page)
  const res = await fetch(`${BASE}/wp-json/wp/v2/masterpiece?per_page=50&_embed`, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const posts = await res.json();
  console.log(`[iziko] fetched ${posts.length} masterpieces`);

  const artworks = [];
  const failed = [];
  for (const [i, p] of posts.entries()) {
    const parsed = parseTitle(p.title?.rendered || '');
    if (!parsed) { console.log(`[iziko] skip non-artwork post: ${dec(p.title?.rendered||'')}`); continue; }
    const { artist, title, year } = parsed;
    const body = parseBody(p.content?.rendered || p.excerpt?.rendered || '');
    const media = p._embedded?.['wp:featuredmedia']?.[0];
    const imgUrl = media?.source_url || media?.media_details?.sizes?.full?.source_url;
    if (!imgUrl) { failed.push({ id: p.id, reason: 'no-image' }); continue; }
    const id = `iziko-${p.id}`;
    const key = `artworks/${STEM}/${id}-${hash8(imgUrl)}-imageUrl.webp`;
    try {
      if (!await r2Exists(key)) {
        const buf = await downloadImage(imgUrl);
        const webp = await sharp(buf, { limitInputPixels: false })
                       .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
                       .webp({ quality: 85 }).toBuffer();
        await r2Upload(key, webp);
      }
      artworks.push({
        id, objectNumber: id,
        title, artist,
        date: year ? String(year) : null,
        year,
        medium: body.medium, dimensions: body.dimensions,
        category: 'painting',  // Iziko masterpieces dominantly paintings
        description: dec((p.excerpt?.rendered || p.content?.rendered || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 500),
        imageUrl: `${R2_PUBLIC}/${key}`,
        thumbnailUrl: media?.media_details?.sizes?.medium_large?.source_url || imgUrl,
        onDisplay: true,
        displayLocation: 'Iziko South African National Gallery',
        sourceUrl: p.link,
        metadata: { wpPostId: p.id, slug: p.slug },
        original_imageUrl: imgUrl,
      });
      console.log(`[iziko] ${i+1}/${posts.length} ok: ${artist} — ${title} (${year ?? '?'})`);
    } catch (e) {
      failed.push({ id, imgUrl, reason: e.message });
      console.log(`[iziko] ${i+1}/${posts.length} FAIL ${e.message}`);
    }
  }

  const out = {
    museum: 'Iziko South African National Gallery',
    collection: 'Masterpiece of the Month series',
    website: 'https://www.iziko.org.za/collections-and-digitisation/',
    source: 'WP REST API /wp/v2/masterpiece',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'wp-rest',
    artworks,
  };
  fs.writeFileSync(path.join(REPO_ROOT, OUT_JSON), JSON.stringify(out, null, 2));
  console.log(`\n[iziko] wrote ${OUT_JSON} (${artworks.length} artworks, ${failed.length} failed)`);
}

main().catch(e => { console.error(e); process.exit(1); });
