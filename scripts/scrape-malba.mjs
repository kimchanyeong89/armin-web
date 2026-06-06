#!/usr/bin/env node
// MALBA collection scraper — coleccion.malba.org.ar WP REST API + HTML scrape.
// Strategy:
//   1. Fetch all posts via /wp-json/wp/v2/posts with _embed (featured image)
//   2. Filter by category to flat visual art
//   3. Scrape each post's public HTML page for artist/year/medium/dimensions
//   4. Download image → webp → R2
// Usage:  node scripts/scrape-malba.mjs [--limit=N] [--concurrency=N]

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
const STEM        = args.limit ? 'malba-pilot-collection' : 'malba-collection';
const OUT_JSON    = `public/data/${STEM}.json`;
const REPO_ROOT   = path.resolve(fileURLToPath(import.meta.url), '../..');
const UA          = 'armin-museum-research/1.0';
const BASE        = 'https://coleccion.malba.org.ar';

const R2_BUCKET  = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const R2_PUBLIC  = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// MALBA category id → our canonical category. Excluded categories aren't here.
const CAT_MAP = {
  4:  'painting',     // Pintura (269)
  30: 'drawing',      // Dibujo (80)
  31: 'drawing',      // Collage (16) — flat 2D
  34: 'print',        // Impresión (51)
  35: 'photograph',   // Fotografía (120)
  36: 'print',        // Grabado (14)
  38: 'print',        // Xilo collage (1)
  40: 'photograph',   // Fotocollage (4)
  56: 'drawing',      // Mixta (14)
  3:  'video',        // Video (29)
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const hash8 = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 8);

// Decode HTML entities for title/text
function dec(s) {
  return (s || '').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
                  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
                  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
                  .replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&#8220;|&#8221;/g, '"');
}

async function fetchJson(url, attempt = 1) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (res.status === 429 && attempt <= 3) {
    await sleep(1000 * Math.pow(2, attempt - 1));
    return fetchJson(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
  return res.json();
}

async function fetchHtml(url, attempt = 1) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (res.status === 429 && attempt <= 3) {
    await sleep(1000 * Math.pow(2, attempt - 1));
    return fetchHtml(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
  return res.text();
}

// Extract structured fields from a MALBA artwork page HTML
function parseArtworkPage(html) {
  const out = { artist: null, country: null, born: null, died: null,
                year: null, medium: null, dimensions: null, invNumber: null,
                bestImage: null, descripcion: null };
  // <h2 id="titulo"><a ...><strong>Artist Name</strong><br><span>... Country, born - died ...
  const artistM = html.match(/<h2 id="titulo">[\s\S]*?<strong>([^<]+)<\/strong>/);
  if (artistM) out.artist = dec(artistM[1]).trim();
  const paisM = html.match(/href="[^"]*\/pais\/[^"]+"[^>]*>([^<]+)<\/a>,\s*(\d{4})(?:[^\d]+(\d{4}))?/);
  if (paisM) { out.country = paisM[1]; out.born = Number(paisM[2]); if (paisM[3]) out.died = Number(paisM[3]); }
  // specs block: Año: NNNN | Técnica: ... | DIMS cm | Nro. de inventario: ...
  // "Ficha técnica" block: <br>-separated lines. Dimensions is the unlabeled line(s)
  // between "Técnica:" and "Nro. de inventario:" — may be "80 x 94,5 cm" OR text like
  // "Variables según instalación". Parse the whole block, not just a cm regex.
  const block = html.match(/Ficha t[ée]cnica<\/h3>\s*<p>([\s\S]*?)<\/p>/i);
  if (block) {
    const lines = block[1].split(/<br\s*\/?>/i).map(l => dec(l.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()).filter(Boolean);
    let afterTecnica = false;
    const dimParts = [];
    for (const ln of lines) {
      if (/^A[ñn]o:/i.test(ln)) { const y = ln.match(/\d{4}/); if (y) out.year = Number(y[0]); afterTecnica = false; }
      else if (/^T[ée]cnica:/i.test(ln)) { out.medium = ln.replace(/^T[ée]cnica:\s*/i, '').trim(); afterTecnica = true; }
      else if (/^Nro\. de inventario:/i.test(ln)) { out.invNumber = ln.replace(/^Nro\. de inventario:\s*/i, '').trim(); afterTecnica = false; }
      else if (/^(T[íi]tulo|Donaci[óo]n|Adquisici[óo]n|Compra|Colecci[óo]n):/i.test(ln)) { afterTecnica = false; }
      else if (afterTecnica) { dimParts.push(ln); }
    }
    if (dimParts.length) out.dimensions = dimParts.join(' ').trim();
  }
  // fallback: bare cm pattern anywhere if block parse missed
  if (!out.dimensions) { const dimM = html.match(/([\d.,]+\s*x\s*[\d.,]+(?:\s*x\s*[\d.,]+)?\s*cm)/i); if (dimM) out.dimensions = dimM[1].trim(); }
  // Best resolution image — look for /uploads/ jpg that's NOT a -150x150 / -300x249 thumb
  const imgM = html.match(/<img[^>]+src="(https:\/\/coleccion\.malba\.org\.ar\/wp-content\/uploads\/[^"]+\.(?:jpg|jpeg|png))"[^>]*class="img-responsive"/i);
  if (imgM) out.bestImage = imgM[1];
  return out;
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

async function downloadImage(url, attempt = 1) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
  if (res.status === 429 && attempt <= 4) {
    await sleep(1000 * Math.pow(2, attempt - 1));
    return downloadImage(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024) throw new Error(`tiny: ${buf.length}B`);
  return buf;
}

async function main() {
  console.log(`[malba] mode=${LIMIT ? `pilot(${LIMIT})` : 'full'}  concurrency=${CONCURRENCY}`);

  // 1. Fetch all posts paginated. per_page=100 (WP max).
  const allPosts = [];
  for (let page = 1; ; page++) {
    const url = `${BASE}/wp-json/wp/v2/posts?per_page=100&page=${page}&_embed`;
    let batch;
    try { batch = await fetchJson(url); }
    catch (e) { if (/rest_post_invalid_page_number|HTTP 400/.test(e.message)) break; throw e; }
    allPosts.push(...batch);
    console.log(`[malba] page ${page}: +${batch.length}  total=${allPosts.length}`);
    if (batch.length < 100) break;
    await sleep(200);
  }
  console.log(`[malba] total posts: ${allPosts.length}`);

  // 2. Filter by category
  let candidates = allPosts.filter(p => p.categories?.some(c => CAT_MAP[c]));
  console.log(`[malba] after category filter: ${candidates.length}`);
  if (LIMIT) candidates = candidates.slice(0, LIMIT);

  // 3. For each: HTML scrape + image upload
  const artworks = [];
  const failed = [];
  let done = 0;

  async function processOne(p) {
    const slug = p.slug;
    const link = p.link;
    const cat = p.categories.find(c => CAT_MAP[c]);
    const category = CAT_MAP[cat] || 'painting';
    const apiTitle = dec(p.title?.rendered || '').trim();
    const apiExcerpt = dec((p.excerpt?.rendered || '').replace(/<[^>]+>/g, ' ').trim());
    let parsed = {};
    try {
      const html = await fetchHtml(link);
      parsed = parseArtworkPage(html);
    } catch (e) {
      failed.push({ id: p.id, slug, reason: `html-fetch: ${e.message}` });
      done++; return;
    }
    // Best image: prefer parsed (from HTML — already 'img-responsive' main), fallback to API featured
    const apiImg = p._embedded?.['wp:featuredmedia']?.[0]?.source_url;
    const apiSizes = p._embedded?.['wp:featuredmedia']?.[0]?.media_details?.sizes || {};
    const apiFull = apiSizes.full?.source_url || apiImg;
    const imgUrl = parsed.bestImage || apiFull || apiImg;
    if (!imgUrl) {
      failed.push({ id: p.id, slug, reason: 'no-image' });
      done++; return;
    }
    if (!parsed.artist) {
      // Some posts genuinely have no artist (anonymous) — keep with placeholder
      parsed.artist = 'Anonymous';
    }
    if (!apiTitle) {
      failed.push({ id: p.id, slug, reason: 'no-title' });
      done++; return;
    }
    const key = `artworks/${STEM}/malba-${p.id}-${hash8(imgUrl)}-imageUrl.webp`;
    try {
      const present = await r2Exists(key);
      if (!present) {
        const buf = await downloadImage(imgUrl);
        const webp = await sharp(buf, { limitInputPixels: false })
                       .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
                       .webp({ quality: 85 }).toBuffer();
        await r2Upload(key, webp);
      }
      artworks.push({
        id: `malba-${p.id}`,
        objectNumber: parsed.invNumber || `malba-${p.id}`,
        title: apiTitle,
        artist: parsed.artist,
        date: parsed.year ? String(parsed.year) : null,
        year: parsed.year,
        medium: parsed.medium || '',
        dimensions: parsed.dimensions || '',
        category,
        description: apiExcerpt,
        imageUrl: `${R2_PUBLIC}/${key}`,
        thumbnailUrl: apiSizes.medium_large?.source_url || apiSizes.medium?.source_url || imgUrl,
        onDisplay: true,
        displayLocation: '',
        sourceUrl: link,
        metadata: {
          malbaPostId: p.id,
          slug,
          country: parsed.country,
          born: parsed.born,
          died: parsed.died,
        },
        original_imageUrl: imgUrl,
      });
    } catch (e) {
      failed.push({ id: p.id, slug, imgUrl, reason: e.message });
    } finally {
      done++;
      if (done % 25 === 0 || done === candidates.length) {
        console.log(`[malba] ${done}/${candidates.length}  ok=${artworks.length}  fail=${failed.length}`);
      }
    }
  }

  const queue = [...candidates];
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const c = queue.shift();
      if (!c) return;
      await processOne(c);
    }
  }));

  // 4. Write JSON
  const out = {
    museum: 'MALBA (Museo de Arte Latinoamericano de Buenos Aires)',
    collection: LIMIT ? `Pilot ${candidates.length} items` : 'Full collection — flat visual art',
    website: 'https://coleccion.malba.org.ar/',
    source: 'WordPress REST API + per-artwork HTML scrape',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'wp-rest+html',
    artworks,
  };
  const outPath = path.join(REPO_ROOT, OUT_JSON);
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`\n[malba] wrote ${outPath} (${artworks.length} artworks)`);

  if (failed.length) {
    const failPath = path.join(REPO_ROOT, `scripts/.state/${STEM}-failed.ndjson`);
    fs.mkdirSync(path.dirname(failPath), { recursive: true });
    fs.writeFileSync(failPath, failed.map(f => JSON.stringify(f)).join('\n'));
    console.log(`[malba] failed log: ${failPath} (${failed.length} items)`);
  }

  // 5. Coverage report
  const cov = k => artworks.filter(a => a[k] && (typeof a[k] === 'string' ? a[k].length : true)).length;
  console.log(`\n=== Coverage on ${artworks.length} kept ===`);
  console.log(`  title:      ${cov('title')}/${artworks.length}`);
  console.log(`  artist:     ${cov('artist')}/${artworks.length}`);
  console.log(`  year:       ${artworks.filter(a => a.year != null).length}/${artworks.length}`);
  console.log(`  medium:     ${cov('medium')}/${artworks.length}`);
  console.log(`  dimensions: ${cov('dimensions')}/${artworks.length}`);
  console.log(`  category:   ${cov('category')}/${artworks.length}`);
  const catDist = {};
  artworks.forEach(a => { catDist[a.category] = (catDist[a.category] || 0) + 1; });
  console.log(`  cat dist:   ${JSON.stringify(catDist)}`);
}

main().catch(e => { console.error(e); process.exit(1); });
