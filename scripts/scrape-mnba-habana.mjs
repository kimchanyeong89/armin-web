#!/usr/bin/env node
// MNBA Habana scraper — bellasartes.co.cu (Drupal).
// 92 "obras recomendadas" listed at /obras (paginated). Detail at /obra/{slug}.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config({ path: path.resolve(fileURLToPath(import.meta.url), '../../.env.local') });

const STEM = 'mnba-habana-collection';
const OUT_JSON = `public/data/${STEM}.json`;
const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const UA = 'Mozilla/5.0 (compatible; armin-museum-research/1.0)';
const BASE = 'https://www.bellasartes.co.cu';

const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const CAT_MAP = {
  pintura: 'painting',
  dibujo: 'drawing',
  acuarela: 'painting',
  grabado: 'print',
  estampa: 'print',
  litografia: 'print',
  fotografia: 'photograph',
  // escultura/objeto/instalación → excluded (return undefined)
};

const hash8 = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 8);
const sleep = ms => new Promise(r => setTimeout(r, ms));
function dec(s) { return (s || '').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, ' '); }

async function fetchHtml(url, attempt = 1) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (res.status === 429 && attempt <= 3) { await sleep(1000 * 2 ** (attempt - 1)); return fetchHtml(url, attempt + 1); }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
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

function parseDetail(html) {
  // text body (strip tags)
  const text = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
  // The body region content has pattern like:
  //   Artist | Title | "MediumDescription; DIMS cm" | "Obra recomendada" | "Colección: X" | "Manifestación artística: Type" | "Lugar de exhibición: Place"
  const t = text.replace(/<[^>]+>/g, '|').replace(/\s+/g, ' ').replace(/\|+/g, '|');
  // Extract by regex around known anchors
  const out = { artist: null, title: null, medium: '', dimensions: '', tipo: null, ubicacion: '', coleccion: '', year: null };
  const tipoM = t.match(/Manifestaci[óo]n art[íi]stica:(?:&nbsp;|\s)*\|+([^|]+)/i);
  if (tipoM) out.tipo = dec(tipoM[1]).trim();
  const colM = t.match(/Colecci[óo]n:(?:&nbsp;|\s)*\|+([^|]+)/i);
  if (colM) out.coleccion = dec(colM[1]).trim();
  const lugM = t.match(/Lugar de exhibici[óo]n:(?:&nbsp;|\s)*\|+([^|]+(?:\|+[^|]+)?)/i);
  if (lugM) out.ubicacion = dec(lugM[1].replace(/\|+/g, ' › ')).trim();
  // The "Title|MEDIUM; DIMENSIONS|Obra recomendada" cell: medium + dimensions live together.
  // Grab the cell that ends in "...cm" and precedes "Obra recomendada" / "Colección".
  const techCell = t.match(/\|([^|]*?;[^|]*?\d[\d.,]*\s*x\s*[\d.,]+\s*cm[^|]*)\|/i)
                || t.match(/\|([^|]*?\d[\d.,]*\s*x\s*[\d.,]+\s*cm[^|]*)\|/i);
  if (techCell) {
    const cell = dec(techCell[1]).trim();
    const dimM = cell.match(/([\d.,]+\s*x\s*[\d.,]+(?:\s*x\s*[\d.,]+)?\s*cm)/i);
    if (dimM) out.dimensions = dimM[1].trim();
    // medium = everything before the "; dimensions" (or before dims if no semicolon)
    let med = cell;
    if (cell.includes(';')) med = cell.split(';')[0];
    else if (dimM) med = cell.slice(0, cell.indexOf(dimM[1]));
    med = med.replace(/[;,]\s*$/, '').trim();
    if (med && !/^\d/.test(med)) out.medium = med;
  }
  // Year fallback from collection period; title-year is applied in processOne (more reliable).
  const ycoll = (out.coleccion || '').match(/(\d{4})/); if (ycoll) out.yearFromPeriod = Number(ycoll[1]);
  return out;
}

async function main() {
  console.log('[mnba] scrape begin');
  // 1. Walk /obras paginated, collect obra slugs
  const slugs = new Set();
  let page = 0;
  while (true) {
    const url = page === 0 ? `${BASE}/obras` : `${BASE}/obras?page=${page}`;
    let html;
    try { html = await fetchHtml(url); }
    catch (e) { console.warn(`[mnba] /obras?page=${page} err: ${e.message}`); break; }
    const matches = [...html.matchAll(/href="\/obra\/([^"]+)"/g)].map(m => m[1]);
    const fresh = matches.filter(s => !slugs.has(s));
    fresh.forEach(s => slugs.add(s));
    console.log(`[mnba] /obras page=${page}: +${fresh.length} new (total=${slugs.size})`);
    if (matches.length === 0 || fresh.length === 0) break;
    page++;
    if (page > 20) break;
    await sleep(150);
  }
  console.log(`[mnba] total slugs: ${slugs.size}`);

  // 2. Detail + image per slug
  const artworks = [];
  const failed = [];
  const skipped = [];
  let i = 0;
  for (const slug of slugs) {
    i++;
    const detailUrl = `${BASE}/obra/${slug}`;
    let html;
    try { html = await fetchHtml(detailUrl); }
    catch (e) { failed.push({ slug, reason: e.message }); continue; }
    const meta = parseDetail(html);
    // Title/artist from meta og:title or breadcrumb. Try various extractions.
    const ogTitle = (html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/) || [])[1];
    let pageTitle = dec(ogTitle || '').replace(/\s*\|\s*Museo[^|]*$/i, '').trim();
    // pageTitle format may be "Artist Name, Title (Year)" or "Artist Name, Title"
    let artist = 'Unknown', title = pageTitle;
    let titleYear = null;
    const m = pageTitle.match(/^(.+?),\s*(.+?)(?:\s*\((\d{4})\))?$/);
    if (m) { artist = m[1].trim(); title = m[2].trim(); if (m[3]) titleYear = Number(m[3]); }
    // title may carry a trailing ", YYYY" (no parens) → that's the work's year
    const tY = title.match(/,\s*(\d{4})\s*$/);
    if (tY) { titleYear = Number(tY[1]); title = title.replace(/,\s*\d{4}\s*$/, '').trim(); }
    // year priority: title year (real work date) > collection period
    meta.year = titleYear ?? meta.yearFromPeriod ?? null;
    if (!title) { failed.push({ slug, reason: 'no-title' }); continue; }

    const tipoLower = (meta.tipo || '').toLowerCase();
    const category = CAT_MAP[tipoLower];
    if (!category) { skipped.push({ slug, tipo: meta.tipo }); continue; }

    // image URL: prefer full path /sites/default/files/public/galerias/{slug}.jpg
    const imgM = html.match(/<a[^>]+href="(https?:\/\/[^"]+\/galerias\/[^"]+\.(?:jpg|jpeg|png))"/i) ||
                 html.match(/<img[^>]+src="(https?:\/\/[^"]+\/galerias\/[^"]+\.(?:jpg|jpeg|png)[^"]*)"/i);
    if (!imgM) { failed.push({ slug, reason: 'no-image' }); continue; }
    // strip ?itok params, strip /styles/... folder to get original
    let imgUrl = imgM[1].split('?')[0];
    imgUrl = imgUrl.replace(/\/styles\/[^/]+\/public\//, '/');

    const id = `mnba-${slug}`;
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
        id, objectNumber: slug,
        title, artist,
        date: meta.year ? String(meta.year) : null,
        year: meta.year,
        medium: meta.medium || '',
        dimensions: meta.dimensions,
        category,
        description: meta.coleccion,
        imageUrl: `${R2_PUBLIC}/${key}`,
        thumbnailUrl: imgM[1],
        onDisplay: !!meta.ubicacion,
        displayLocation: meta.ubicacion,
        sourceUrl: detailUrl,
        metadata: { mnbaSlug: slug, tipo: meta.tipo, coleccion: meta.coleccion },
        original_imageUrl: imgUrl,
      });
      console.log(`[mnba] ${i}/${slugs.size} ok: ${artist} — ${title} [${category}]`);
    } catch (e) {
      failed.push({ slug, imgUrl, reason: e.message });
    }
    await sleep(150);
  }

  const out = {
    museum: 'Museo Nacional de Bellas Artes (Arte Cubano), La Habana',
    collection: 'Obras recomendadas',
    website: 'https://www.bellasartes.co.cu',
    source: 'bellasartes.co.cu /obras pagination + /obra/{slug} detail',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'html-direct',
    artworks,
  };
  fs.writeFileSync(path.join(REPO_ROOT, OUT_JSON), JSON.stringify(out, null, 2));
  console.log(`\n[mnba] wrote ${OUT_JSON} (${artworks.length} artworks, ${failed.length} failed, ${skipped.length} skipped non-flat)`);
  if (failed.length) {
    const failPath = path.join(REPO_ROOT, `scripts/.state/${STEM}-failed.ndjson`);
    fs.mkdirSync(path.dirname(failPath), { recursive: true });
    fs.writeFileSync(failPath, failed.map(f => JSON.stringify(f)).join('\n'));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
