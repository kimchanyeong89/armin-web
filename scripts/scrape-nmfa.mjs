#!/usr/bin/env node
// NMFA Manila scraper — nationalmuseum.gov.ph/our-collections/fine-arts/{cat}/
// Each subcategory page renders artworks as <a data-caption="Artist | Title | Year | Medium | Note">
// with href=full-size image. Parse caption for metadata.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config({ path: path.resolve(fileURLToPath(import.meta.url), '../../.env.local') });

const STEM = 'nmfa-collection';
const OUT_JSON = `public/data/${STEM}.json`;
const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const UA = 'Mozilla/5.0 (compatible; armin-museum-research/1.0)';
const BASE = 'https://www.nationalmuseum.gov.ph';

const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const CATS = [
  ['painting', 'paintings'],
  ['drawing', 'drawings'],
  ['print', 'prints'],
  ['photograph', 'photographs'],
  ['drawing', 'comic-art'],   // include as drawing
];

const hash8 = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 8);
const sleep = ms => new Promise(r => setTimeout(r, ms));
function dec(s) {
  return (s || '').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
                  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
                  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
                  .replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&#039;/g, "'");
}

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// data-caption HTML-encoded; first decode &lt; / &gt; / &#39;, then strip <h4>…</h4>
function parseCaption(caption) {
  const decoded = dec(caption).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const parts = decoded.split('|').map(s => s.trim()).filter(Boolean);
  let artist = parts[0] || 'Anonymous';
  let title = parts[1] || '';
  let year = null;
  let medium = '';
  let note = '';
  for (const p of parts.slice(2)) {
    const yMatch = p.match(/^(\d{4})(?:[-–]\d{4})?$/);
    if (yMatch && !year) { year = Number(yMatch[1]); continue; }
    if (/oil|tempera|acrylic|watercolor|gouache|canvas|wood|paper|pastel|pencil|charcoal|ink|gelatin|silver|print|etching|lithograph/i.test(p) && !medium) {
      medium = p; continue;
    }
    note = (note ? note + '; ' : '') + p;
  }
  return { artist, title, year, medium, note };
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

async function main() {
  console.log(`[nmfa] scrape begin`);

  const items = new Map(); // key = imageUrl
  for (const [category, slug] of CATS) {
    let html;
    try { html = await fetchHtml(`${BASE}/our-collections/fine-arts/${slug}/`); }
    catch (e) { console.warn(`[nmfa] ${slug}: ${e.message}`); continue; }

    // Match <a ... href="IMAGE_URL" data-type="image" data-caption="CAPTION">
    const re = /<a\s+[^>]*href="(https:\/\/[^"]+\.(?:jpg|jpeg|png)[^"]*)"\s+data-type="image"\s+data-caption="([^"]+)"/gi;
    let count = 0;
    for (const m of html.matchAll(re)) {
      const imgUrl = m[1];
      if (items.has(imgUrl)) continue;
      const { artist, title, year, medium, note } = parseCaption(m[2]);
      items.set(imgUrl, { imgUrl, artist, title, year, medium, note, category, slug });
      count++;
    }
    console.log(`[nmfa] ${slug}: +${count} new (total=${items.size})`);
  }

  // Process each
  const artworks = [];
  const failed = [];
  let i = 0;
  for (const it of items.values()) {
    i++;
    if (!it.title) { failed.push({ imgUrl: it.imgUrl, reason: 'no-title' }); continue; }
    const id = `nmfa-${hash8(it.imgUrl).slice(0,6)}-${it.slug}`;
    const key = `artworks/${STEM}/${id}-${hash8(it.imgUrl)}-imageUrl.webp`;
    try {
      if (!await r2Exists(key)) {
        const buf = await downloadImage(it.imgUrl);
        const webp = await sharp(buf, { limitInputPixels: false })
                       .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
                       .webp({ quality: 85 }).toBuffer();
        await r2Upload(key, webp);
      }
      artworks.push({
        id, objectNumber: id,
        title: it.title, artist: it.artist,
        date: it.year ? String(it.year) : null,
        year: it.year,
        medium: it.medium, dimensions: '',
        category: it.category,
        description: it.note,
        imageUrl: `${R2_PUBLIC}/${key}`,
        thumbnailUrl: it.imgUrl,
        onDisplay: true,
        displayLocation: '',
        sourceUrl: `${BASE}/our-collections/fine-arts/${it.slug}/`,
        metadata: { collectionPage: it.slug },
        original_imageUrl: it.imgUrl,
      });
      if (i % 10 === 0) console.log(`[nmfa] ${i}/${items.size}  ok=${artworks.length}`);
    } catch (e) {
      failed.push({ id, imgUrl: it.imgUrl, reason: e.message });
    }
    await sleep(150);
  }

  const out = {
    museum: 'National Museum of Fine Arts, Manila',
    collection: 'Curated fine arts subcategory pages',
    website: 'https://www.nationalmuseum.gov.ph/our-collections/fine-arts/',
    source: 'data-caption parse from UIKit lightbox',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'html-direct',
    artworks,
  };
  fs.writeFileSync(path.join(REPO_ROOT, OUT_JSON), JSON.stringify(out, null, 2));
  console.log(`\n[nmfa] wrote ${OUT_JSON} (${artworks.length} artworks, ${failed.length} failed)`);
  if (failed.length) {
    const failPath = path.join(REPO_ROOT, `scripts/.state/${STEM}-failed.ndjson`);
    fs.mkdirSync(path.dirname(failPath), { recursive: true });
    fs.writeFileSync(failPath, failed.map(f => JSON.stringify(f)).join('\n'));
  }
  const cov = k => artworks.filter(a => a[k] && (typeof a[k] === 'string' ? a[k].length : true)).length;
  const catDist = {}; artworks.forEach(a => catDist[a.category] = (catDist[a.category]||0)+1);
  console.log(`coverage: title ${cov('title')}/${artworks.length} artist ${cov('artist')}/${artworks.length} year ${artworks.filter(a=>a.year).length}/${artworks.length} medium ${cov('medium')}/${artworks.length} cats: ${JSON.stringify(catDist)}`);
}

main().catch(e => { console.error(e); process.exit(1); });
