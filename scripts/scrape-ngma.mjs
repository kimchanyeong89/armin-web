#!/usr/bin/env node
// NGMA New Delhi collection scraper — museumsofindia.gov.in NPDR.
// (NGMA's official online catalog is hosted by India's Ministry of Culture NPDR;
//  the museum's own ngmaindia.gov.in has no individual artwork pages.)
//
// Strategy:
//   1. Iterate /repository/collection/fetchRecords?...&pageNo=N (16/page)
//   2. Filter by object type to flat visual art
//   3. For each record: fetch /repository/record/{id} HTML for metadata
//   4. Download _h.jpg (high-res) image → webp → R2
// Usage:  node scripts/scrape-ngma.mjs [--limit=N] [--concurrency=N]

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
const LIMIT       = args.limit ? Number(args.limit) : null;
const CONCURRENCY = Number(args.concurrency || 4);
const STEM        = args.limit ? 'ngma-newdelhi-pilot-collection' : 'ngma-newdelhi-collection';
const OUT_JSON    = `public/data/${STEM}.json`;
const REPO_ROOT   = path.resolve(fileURLToPath(import.meta.url), '../..');
const UA          = 'Mozilla/5.0 (compatible; armin-museum-research/1.0)';
const BASE        = 'https://museumsofindia.gov.in';

const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const TYPE_MAP = {
  painting: 'painting',
  drawing: 'drawing',
  sketch: 'drawing',
  sketche: 'drawing',
  print: 'print',
  photograph: 'photograph',
  collage: 'drawing',
  graphic: 'print',
  // sculpture, insignia, installation, archaeology → excluded
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const hash8 = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 8);

function dec(s) {
  return (s || '').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
                  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
                  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
                  .replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ');
}

async function fetchJson(url, attempt = 1) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' } });
  if (res.status === 429 && attempt <= 3) { await sleep(1000 * 2 ** (attempt - 1)); return fetchJson(url, attempt + 1); }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
async function fetchHtml(url, attempt = 1) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (res.status === 429 && attempt <= 3) { await sleep(1000 * 2 ** (attempt - 1)); return fetchHtml(url, attempt + 1); }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// Parse detail-page <tr><th>Field</th><td>Value</td></tr>
function parseDetail(html) {
  const fields = {};
  for (const m of html.matchAll(/<tr[^>]*>[\s\S]*?<th[^>]*>([^<]+)<\/th>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/g)) {
    const k = dec(m[1]).trim();
    const v = dec(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (k) fields[k] = v;
  }
  return fields;
}

// Try to extract year from various places
function extractYear(fields, detailHtml) {
  for (const k of ['Date', 'Year', 'Date of Work', 'Creation Date', 'Creation Period', 'Period']) {
    if (fields[k]) { const m = fields[k].match(/\d{4}/); if (m) return Number(m[0]); }
  }
  // Sometimes year is inline in description
  if (fields['Brief Description']) { const m = fields['Brief Description'].match(/\b(19|20)\d{2}\b/); if (m) return Number(m[0]); }
  return null;
}

async function r2Exists(key) {
  try { await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key })); return true; }
  catch { return false; }
}
async function r2Upload(key, buf) {
  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET, Key: key, Body: buf,
    ContentType: 'image/webp', CacheControl: 'public, max-age=31536000',
  }));
}

// NPDR serves this single fixed "Image not found" placeholder for records with no image.
const PLACEHOLDER_SHA = '419ab52b489fa687503e5485358b5c2821407ca6fb49bdb97ace802e607bcf1d';
const PLACEHOLDER_LEN = 96625;

async function downloadImage(url, attempt = 1) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
  if (res.status === 429 && attempt <= 4) { await sleep(1000 * 2 ** (attempt - 1)); return downloadImage(url, attempt + 1); }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024) throw new Error(`tiny: ${buf.length}B`);
  // reject the NPDR placeholder (cheap length pre-check, then hash confirm)
  if (buf.length === PLACEHOLDER_LEN &&
      crypto.createHash('sha256').update(buf).digest('hex') === PLACEHOLDER_SHA) {
    throw new Error('placeholder');
  }
  return buf;
}

async function main() {
  console.log(`[ngma] mode=${LIMIT ? `pilot(${LIMIT})` : 'full'}  concurrency=${CONCURRENCY}`);

  // 1. List all records via fetchRecords
  const records = [];
  let page = 1, total = null;
  while (true) {
    const url = `${BASE}/repository/collection/fetchRecords?collectionType=MuseumName&collectionCategory=ngma_del&pageNo=${page}&museum=ngma_del`;
    let data;
    try { data = await fetchJson(url); } catch (e) { console.warn(`[ngma] page ${page} fetch err: ${e.message}`); break; }
    if (page === 1) { total = data.resultSize; console.log(`[ngma] total records: ${total}`); }
    const arr = data.listOfResult || [];
    if (!arr.length) break;
    records.push(...arr);
    if (page % 20 === 0) console.log(`[ngma] listing page ${page}: total fetched=${records.length}/${total}`);
    if (arr.length < 16) break;
    if (LIMIT && records.length >= LIMIT * 3) break;
    page++;
    await sleep(120);
  }
  console.log(`[ngma] listing done: ${records.length} records`);

  // 2. Filter by object type via detail page (object type isn't in listing). For pilot just use all.
  // For speed: skip detail-page filter; instead use ObjectType facet which isn't per-record.
  // We'll do filter inline in processOne after detail fetch.
  let candidates = records;
  if (LIMIT) candidates = candidates.slice(0, Math.ceil(LIMIT * 1.3));

  // 3. Process each
  const artworks = [];
  const failed = [];
  const skippedByType = [];
  let done = 0;

  async function processOne(r) {
    const id = r.recordIdentifier;
    const detailUrl = `${BASE}/repository/record/${id}`;
    let detailHtml, fields;
    try { detailHtml = await fetchHtml(detailUrl); fields = parseDetail(detailHtml); }
    catch (e) { failed.push({ id, reason: `detail-fetch: ${e.message}` }); done++; return; }

    const objType = (fields['Object Type'] || '').toLowerCase().trim();
    const category = TYPE_MAP[objType];
    if (!category) { skippedByType.push({ id, objType }); done++; return; }

    const title = dec(r.title || fields['Title'] || '').trim();
    if (!title) { failed.push({ id, reason: 'no-title' }); done++; return; }

    // Artist: "Jamini Roy (1887-1972)" → strip parenthetical
    let artist = fields['Main Artist'] || fields['Artist'] || '';
    artist = artist.replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (!artist || /unknown/i.test(artist)) artist = 'Anonymous';

    const medium = fields['Main Material'] || fields['Material'] || '';
    const dimensions = fields['Dimensions'] || '';
    const year = extractYear(fields, detailHtml);

    // _h.jpg high-resolution image
    const imageUrl = `${BASE}/repository/file/ngma_del/${id}/${id}_01_h.jpg`;
    const key = `artworks/${STEM}/${id}-${hash8(imageUrl)}-imageUrl.webp`;
    try {
      const present = await r2Exists(key);
      if (!present) {
        const buf = await downloadImage(imageUrl);
        const webp = await sharp(buf, { limitInputPixels: false })
                       .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
                       .webp({ quality: 85 }).toBuffer();
        await r2Upload(key, webp);
      }
      artworks.push({
        id,
        objectNumber: fields['Accession Number'] || id,
        title,
        artist,
        date: fields['Date'] || (year ? String(year) : null),
        year,
        medium,
        dimensions,
        category,
        description: fields['Brief Description'] || '',
        imageUrl: `${R2_PUBLIC}/${key}`,
        thumbnailUrl: r.path || '',
        onDisplay: true,
        displayLocation: fields['Gallery Name'] || '',
        sourceUrl: detailUrl,
        metadata: {
          ngmaRecordId: id,
          objectType: objType,
          country: fields['Country'] || '',
          nationality: fields["Artist's Nationality"] || '',
          inscription: fields['Inscription'] || '',
        },
        original_imageUrl: imageUrl,
      });
    } catch (e) {
      failed.push({ id, imageUrl, reason: e.message });
    } finally {
      done++;
      if (done % 50 === 0 || done === candidates.length) {
        console.log(`[ngma] ${done}/${candidates.length}  ok=${artworks.length}  fail=${failed.length}  skipped(type)=${skippedByType.length}`);
      }
      if (LIMIT && artworks.length >= LIMIT) { /* let pool drain */ }
    }
  }

  const queue = [...candidates];
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      if (LIMIT && artworks.length >= LIMIT) return;
      const c = queue.shift();
      if (!c) return;
      await processOne(c);
    }
  }));

  // Cap if pilot
  const finalArtworks = LIMIT ? artworks.slice(0, LIMIT) : artworks;

  // 4. Write JSON
  const out = {
    museum: 'National Gallery of Modern Art, New Delhi (NGMA)',
    collection: LIMIT ? `Pilot ${finalArtworks.length} items` : 'Full NGMA Delhi flat visual art holdings',
    website: 'https://ngmaindia.gov.in',
    source: 'museumsofindia.gov.in NPDR fetchRecords AJAX + per-record HTML scrape',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: finalArtworks.length,
    source_type: 'ngma-ajax+html',
    artworks: finalArtworks,
  };
  const outPath = path.join(REPO_ROOT, OUT_JSON);
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`\n[ngma] wrote ${outPath} (${finalArtworks.length} artworks)`);

  if (failed.length) {
    const failPath = path.join(REPO_ROOT, `scripts/.state/${STEM}-failed.ndjson`);
    fs.mkdirSync(path.dirname(failPath), { recursive: true });
    fs.writeFileSync(failPath, failed.map(f => JSON.stringify(f)).join('\n'));
    console.log(`[ngma] failed log: ${failPath} (${failed.length} items)`);
  }

  // 5. Coverage
  const cov = k => finalArtworks.filter(a => a[k] && (typeof a[k] === 'string' ? a[k].length : true)).length;
  console.log(`\n=== Coverage on ${finalArtworks.length} kept ===`);
  console.log(`  title:      ${cov('title')}/${finalArtworks.length}`);
  console.log(`  artist:     ${cov('artist')}/${finalArtworks.length}`);
  console.log(`  year:       ${finalArtworks.filter(a => a.year != null).length}/${finalArtworks.length}`);
  console.log(`  medium:     ${cov('medium')}/${finalArtworks.length}`);
  console.log(`  dimensions: ${cov('dimensions')}/${finalArtworks.length}`);
  console.log(`  category:   ${cov('category')}/${finalArtworks.length}`);
  const catDist = {};
  finalArtworks.forEach(a => { catDist[a.category] = (catDist[a.category] || 0) + 1; });
  console.log(`  cat dist:   ${JSON.stringify(catDist)}`);
}

main().catch(e => { console.error(e); process.exit(1); });
