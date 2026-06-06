#!/usr/bin/env node
// Mathaf scraper — collections.qm.org.qa (Qatar Museums Nuxt portal).
// Strategy:
//   1. Get all object URLs ending in -mat... from sitemap.xml (233 Mathaf works)
//   2. For each: scrape detail page HTML → JSON-LD VisualArtwork + Artist from dt/dd
//   3. Download .original.jpg from Azure blob storage → R2

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config({ path: path.resolve(fileURLToPath(import.meta.url), '../../.env.local') });

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const LIMIT = args.limit ? Number(args.limit) : null;
const CONCURRENCY = Number(args.concurrency || 4);
const STEM = args.limit ? 'mathaf-pilot-collection' : 'mathaf-collection';
const OUT_JSON = `public/data/${STEM}.json`;
const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const UA = 'Mozilla/5.0 (compatible; armin-museum-research/1.0)';
const BASE = 'https://collections.qm.org.qa';
const IMG_BASE = 'https://dgcollectionprod.blob.core.windows.net/media/images';

const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const hash8 = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 8);
const sleep = ms => new Promise(r => setTimeout(r, ms));
function dec(s) { return (s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, ' '); }

async function fetchHtml(url, attempt = 1) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (res.status === 429 && attempt <= 3) { await sleep(1000 * 2 ** (attempt - 1)); return fetchHtml(url, attempt + 1); }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function parseDetail(html) {
  const out = { title: '', artist: null, year: null, medium: '', dimensions: '', accession: '', genre: '', description: '' };
  // JSON-LD VisualArtwork
  const ld = html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/);
  if (ld) {
    try {
      const d = JSON.parse(ld[1]);
      out.title = d.name || '';
      out.medium = d.artMedium || d.material || '';
      out.accession = d.identifier || '';
      out.genre = d.genre || '';
      out.description = d.description || '';
      const yM = (d.dateCreated || '').match(/\d{4}/); if (yM) out.year = Number(yM[0]);
      const dims = [];
      if (d.height) dims.push(`height ${d.height}`);
      if (d.width) dims.push(`width ${d.width}`);
      if (d.depth) dims.push(`depth ${d.depth}`);
      out.dimensions = dims.join(' × ');
    } catch (e) { /* ignore */ }
  }
  // dt/dd table backfills fields JSON-LD left empty (Artist always; Date/Technique/Dimensions as fallback)
  // NON-GREEDY dd capture — greedy {0,400} swallowed the next dt/dd pair (Title→"...Artist: X").
  const dtdd = [...html.matchAll(/<dt[^>]*>([^<]+?)<\/dt>[\s\S]*?<dd[^>]*>([\s\S]*?)<\/dd>/g)];
  for (const m of dtdd) {
    const k = dec(m[1]).replace(/:\s*$/, '').trim();
    const v = dec(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (/^artist|^maker|^creator/i.test(k)) out.artist = v.replace(/\s*\([^)]*\)\s*$/, '').trim();
    else if (/^date/i.test(k) && out.year == null) { const y = v.match(/\d{4}/); if (y) out.year = Number(y[0]); }
    else if (/^dimensions/i.test(k) && !out.dimensions) out.dimensions = v;
    else if (/^(medium|material|technique)/i.test(k) && !out.medium && !/^painting$|^sculpture$|^drawing$/i.test(v)) out.medium = v;
  }
  if (!out.artist) out.artist = 'Anonymous';
  return out;
}

async function r2Exists(key) { try { await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key })); return true; } catch { return false; } }
async function r2Upload(key, buf) {
  await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buf, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000' }));
}
async function downloadImage(url, attempt = 1) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
  if (res.status === 429 && attempt <= 4) { await sleep(1000 * 2 ** (attempt - 1)); return downloadImage(url, attempt + 1); }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024) throw new Error(`tiny: ${buf.length}B`);
  return buf;
}

async function main() {
  console.log(`[mathaf] scrape begin`);
  // 1. Get sitemap, filter Mathaf URLs
  const smXml = await fetchHtml(`${BASE}/sitemap.xml`);
  const allUrls = [...smXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  let mathafUrls = allUrls.filter(u => u.includes('/en/objects/') && /-mat\d/i.test(u));
  console.log(`[mathaf] sitemap: ${mathafUrls.length} Mathaf objects`);
  if (LIMIT) mathafUrls = mathafUrls.slice(0, LIMIT);

  // 2. Process
  const artworks = [];
  const failed = [];
  let done = 0;

  async function processOne(url) {
    const slug = url.split('/').pop();
    const accMatch = slug.match(/-(mat\d+)$/i);
    const accId = accMatch ? accMatch[1].toUpperCase() : null;
    // Format MAT.YYYY.X.NNNN — try a few possible image-name formats
    // The slug ID like "mat200711797" → accession "MAT.2007.1.1797"
    // Pattern: mat + 4-digit year + sequence
    let imgKeyId = null;
    if (accId) {
      const m = accId.match(/^MAT(\d{4})(\d+)$/);
      if (m) {
        const year = m[1], rest = m[2];
        // Common format: MAT.YYYY.1.NNNN — but unknown exact splitting; fall back to og:image scraping
        imgKeyId = `MAT.${year}.${rest.length>4 ? rest.slice(0,1) : '1'}.${rest.length>4 ? rest.slice(1) : rest}`;
      }
    }
    let html;
    try { html = await fetchHtml(url); }
    catch (e) { failed.push({ url, reason: `html: ${e.message}` }); done++; return; }

    const meta = parseDetail(html);
    if (!meta.title) { failed.push({ url, reason: 'no-title' }); done++; return; }

    // og:image gives the actual image URL (most reliable). Use as-is — .original.jpg often missing.
    let imgUrl = null;
    const ogM = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/);
    if (ogM) imgUrl = ogM[1];
    if (!imgUrl) { failed.push({ url, reason: 'no-image-url' }); done++; return; }

    const id = `mathaf-${slug}`;
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
        id, objectNumber: meta.accession || accId || id,
        title: meta.title,
        artist: meta.artist,
        date: meta.year ? String(meta.year) : null,
        year: meta.year,
        medium: meta.medium,
        dimensions: meta.dimensions,
        category: 'painting',  // default; refine if genre indicates otherwise
        description: meta.description,
        imageUrl: `${R2_PUBLIC}/${key}`,
        thumbnailUrl: imgUrl.replace('.original.jpg', '.width-400.jpg'),
        onDisplay: true,
        displayLocation: '',
        sourceUrl: url,
        metadata: { qmAccession: meta.accession, qmSlug: slug, genre: meta.genre },
        original_imageUrl: imgUrl,
      });
    } catch (e) {
      failed.push({ url, imgUrl, reason: e.message });
    } finally {
      done++;
      if (done % 20 === 0 || done === mathafUrls.length) {
        console.log(`[mathaf] ${done}/${mathafUrls.length}  ok=${artworks.length}  fail=${failed.length}`);
      }
    }
  }

  const queue = [...mathafUrls];
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const u = queue.shift(); if (!u) return;
      await processOne(u);
    }
  }));

  const out = {
    museum: 'Mathaf: Arab Museum of Modern Art',
    collection: LIMIT ? `Pilot ${artworks.length} items` : 'Full Mathaf flat visual art holdings',
    website: 'https://mathaf.org.qa',
    source: 'collections.qm.org.qa sitemap + per-object HTML scrape (JSON-LD + dt/dd)',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'sitemap+html',
    artworks,
  };
  fs.writeFileSync(path.join(REPO_ROOT, OUT_JSON), JSON.stringify(out, null, 2));
  console.log(`\n[mathaf] wrote ${OUT_JSON} (${artworks.length} artworks)`);
  if (failed.length) {
    const failPath = path.join(REPO_ROOT, `scripts/.state/${STEM}-failed.ndjson`);
    fs.mkdirSync(path.dirname(failPath), { recursive: true });
    fs.writeFileSync(failPath, failed.map(f => JSON.stringify(f)).join('\n'));
  }
  const cov = k => artworks.filter(a => a[k] && (typeof a[k] === 'string' ? a[k].length : true)).length;
  console.log(`coverage: title ${cov('title')}/${artworks.length} artist ${cov('artist')}/${artworks.length} year ${artworks.filter(a=>a.year).length}/${artworks.length} medium ${cov('medium')}/${artworks.length} dim ${cov('dimensions')}/${artworks.length}`);
}

main().catch(e => { console.error(e); process.exit(1); });
