#!/usr/bin/env node
// MAM CDMX scraper — mam.inba.gob.mx/destacadas.html
// 46 highlighted works. Each: thumb + figcaption(artist+title+year).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config({ path: path.resolve(fileURLToPath(import.meta.url), '../../.env.local') });

const STEM = 'mam-cdmx-collection';
const OUT_JSON = `public/data/${STEM}.json`;
const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const UA = 'Mozilla/5.0 (compatible; armin-museum-research/1.0)';
const BASE = 'https://mam.inba.gob.mx';

const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const hash8 = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 8);
function dec(s) { return (s || '').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, ' '); }

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
  console.log('[mam-cdmx] scrape begin');
  const html = await (await fetch(`${BASE}/destacadas.html`, { headers: { 'User-Agent': UA } })).text();
  // Parse each card:
  //   <a href="#obra00"><img src="assets/destacadas/dtcs-NN-thumb.webp" alt="..."/>
  //   <figcaption>
  //     <p><span class="negritas">Artist</span></p>
  //     <p><span class="cursivas">Title</span>, YEAR</p>
  //   </figcaption></a>
  const re = /<a\s+href="#obra(\d+)"[^>]*>\s*<img[^>]+src="assets\/destacadas\/(dtcs-(\d+)-thumb\.webp)"[^>]*(?:alt="([^"]*)")?[\s\S]*?<figcaption[^>]*>([\s\S]*?)<\/figcaption>\s*<\/a>/g;
  const items = [];
  for (const m of html.matchAll(re)) {
    const obraId = m[1];
    const thumbFile = m[2];
    const num = m[3];
    const alt = dec(m[4] || '');
    const caption = m[5];
    const artistM = caption.match(/<span\s+class="negritas">([^<]+)<\/span>/);
    const titleM = caption.match(/<span\s+class="cursivas">([^<]+)<\/span>(?:[,\s]*(\d{4}))?/);
    const year = (caption.match(/[,\s](\d{4})/) || [])[1];
    const artist = artistM ? dec(artistM[1]).trim() : 'Unknown';
    const title = titleM ? dec(titleM[1]).trim() : '';
    if (!title) continue;
    items.push({
      obraId, num, artist, title,
      year: year ? Number(year) : null,
      alt,
      thumbUrl: `${BASE}/assets/destacadas/${thumbFile}`,
      fullUrl: `${BASE}/assets/destacadas/dtcs-${num}.webp`,
    });
  }
  // dedup by num
  const seen = new Set();
  const unique = items.filter(it => { if (seen.has(it.num)) return false; seen.add(it.num); return true; });
  console.log(`[mam-cdmx] parsed ${unique.length} unique items`);

  const artworks = [];
  const failed = [];
  for (const [i, it] of unique.entries()) {
    const id = `mam-cdmx-${it.num}`;
    const key = `artworks/${STEM}/${id}-${hash8(it.fullUrl)}-imageUrl.webp`;
    try {
      if (!await r2Exists(key)) {
        const buf = await downloadImage(it.fullUrl);
        const webp = await sharp(buf, { limitInputPixels: false })
                       .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
                       .webp({ quality: 85 }).toBuffer();
        await r2Upload(key, webp);
      }
      // category from alt text - "Fotografia" → photograph
      let category = 'painting';
      const a = it.alt.toLowerCase();
      if (/fotograf/.test(a)) category = 'photograph';
      else if (/dibujo|drawing/.test(a)) category = 'drawing';
      else if (/grabado|estampa/.test(a)) category = 'print';
      artworks.push({
        id, objectNumber: id,
        title: it.title, artist: it.artist,
        date: it.year ? String(it.year) : null,
        year: it.year,
        medium: '', dimensions: '',
        category,
        description: it.alt,
        imageUrl: `${R2_PUBLIC}/${key}`,
        thumbnailUrl: it.thumbUrl,
        onDisplay: true,
        displayLocation: '',
        sourceUrl: `${BASE}/destacadas.html#obra${it.obraId}`,
        metadata: { obraId: it.obraId, fileNum: it.num },
        original_imageUrl: it.fullUrl,
      });
      console.log(`[mam-cdmx] ${i+1}/${unique.length} ok: ${it.artist} — ${it.title} (${it.year ?? '?'}) [${category}]`);
    } catch (e) {
      failed.push({ id, reason: e.message });
      console.log(`[mam-cdmx] ${i+1}/${unique.length} FAIL ${e.message}`);
    }
  }

  const out = {
    museum: 'Museo de Arte Moderno, Mexico City',
    collection: 'Obras destacadas (highlighted works)',
    website: 'https://mam.inba.gob.mx',
    source: 'destacadas.html figcaption parse',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'html-direct',
    artworks,
  };
  fs.writeFileSync(path.join(REPO_ROOT, OUT_JSON), JSON.stringify(out, null, 2));
  console.log(`\n[mam-cdmx] wrote ${OUT_JSON} (${artworks.length} artworks, ${failed.length} failed)`);
}

main().catch(e => { console.error(e); process.exit(1); });
