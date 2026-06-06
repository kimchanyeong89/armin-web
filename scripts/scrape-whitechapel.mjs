#!/usr/bin/env node
// Whitechapel Gallery — collection scraper.
//
// CONTEXT: Whitechapel Gallery is a kunsthalle (temporary-exhibition venue). It has
// NO permanent collection catalogue on its main site (confirmed: WP REST exposes no
// artwork post type; the `medium` taxonomy only tags past exhibitions). The only
// per-artwork catalogue Whitechapel publishes on its OWN site is its Artist Editions —
// limited-edition prints/multiples donated by artists to fund the gallery, sold via the
// gallery's own Shopify store at shop.whitechapelgallery.org (self-site, HARD RULE 1 ok).
//
// SOURCE: Shopify storefront JSON API
//   https://shop.whitechapelgallery.org/collections/editions/products.json?limit=250
//   Each product = one edition. Detail metadata lives in `body_html` inside a
//   [[specs start]]...[[specs end]] block (medium / dimensions / edition lines), plus
//   `vendor` (artist), `tags` (artist-*, medium-*), and high-res Shopify CDN images.
//
// SCOPE (HARD RULE 2): keep only FLAT visual art (print, drawing, photograph,
//   painting, mixed_media_2d). Exclude editions whose medium is 3D
//   (sculpture, bronze, ceramic, object, textile, etc.).
//
// Usage:  node scripts/scrape-whitechapel.mjs [--limit=N] [--concurrency=N]

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
const STEM        = args.limit ? 'whitechapel-collection-pilot' : 'whitechapel-collection';
const OUT_JSON    = `public/data/${STEM}.json`;
const REPO_ROOT   = path.resolve(fileURLToPath(import.meta.url), '../..');
const UA          = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) armin-museum-research/1.0';
const SHOP        = 'https://shop.whitechapelgallery.org';
const COLLECTION_URL = `${SHOP}/collections/editions/products.json`;
const SOURCE_BASE = `${SHOP}/products/`;

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

const sleep = ms => new Promise(r => setTimeout(r, ms));
const hash8 = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 8);

function stripTags(s) {
  return (s || '').replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&rsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"').replace(/&hellip;/g, '...').replace(/&eacute;/g, 'é')
    .replace(/\s+/g, ' ').trim();
}

// ---- body_html spec-block parsing -----------------------------------------
// Block runs from [[specs start]] to [[specs end]] (or to the next [[ marker
// when the end marker is missing — happens on a few records).
function specLines(bodyHtml) {
  const bh = bodyHtml || '';
  const s = bh.indexOf('[[specs start]]');
  let block;
  if (s === -1) {
    block = bh;
  } else {
    const rest = bh.slice(s + '[[specs start]]'.length);
    const eEnd = rest.indexOf('[[specs end]]');
    const eNext = rest.indexOf('[[');
    const cuts = [eEnd, eNext].filter(c => c !== -1);
    block = cuts.length ? rest.slice(0, Math.min(...cuts)) : rest;
  }
  block = block.replace(/\[\[specs start\]\]/g, '').replace(/\[\[specs end\]\]/g, '');
  // split on p / br / li / h2 (with possible attributes)
  return block.split(/<\/?p[^>]*>|<br[^>]*>|<\/?li[^>]*>|<\/?h2[^>]*>/i)
    .map(x => stripTags(x).replace(/\[\[|\]\]/g, '')
                         .replace(/^(specs start|specs end|work start)\s*/i, '').trim())
    .filter(Boolean);
}

const DIM_PAT = /(\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?(?:\s*[x×]\s*\d+(?:\.\d+)?)?\s*(?:cm|mm|inches|in|")?)/i;
function lineHasDim(l) {
  const ll = l.toLowerCase();
  return DIM_PAT.test(l) ||
    /^(box:|size:|dimensions|sheet|image:|framed|paper size|approx)/.test(ll);
}
function isEditionLine(l) {
  return /\b(edition of|series of|variable edition|edition)\b/i.test(l) && /\d/.test(l);
}
function isNoiseLine(l) {
  const ll = l.toLowerCase();
  return /^(©|courtesy|printed by|please note|this edition|to select|a number of these|whitechapel gallery editions|as is traditional|for uk customers|the purchase)/.test(ll)
    || ll.startsWith('©');
}
// Split a line that carries BOTH descriptive medium AND a dimension
// (e.g. "C-type photograph on Fuji DPII matt paper 30.5 x 25.4 cm").
function splitMedDim(line) {
  const m = line.match(DIM_PAT);
  if (!m) return { med: line, dim: null };
  const dim = m[1].trim();
  let med = (line.slice(0, m.index) + ' ' + line.slice(m.index + m[1].length))
    .replace(/\s+/g, ' ').replace(/^[\s,;]+|[\s,;]+$/g, '');
  return { med: med || null, dim };
}

function parseSpecs(bodyHtml) {
  const lines = specLines(bodyHtml);
  let medium = null;
  const dims = [];
  let edition = null;
  for (const l of lines) {
    if (isEditionLine(l) && !edition) { edition = l; continue; }
    if (lineHasDim(l)) {
      const { med, dim } = splitMedDim(l);
      if (dim) dims.push(dim);
      // a combined line also yields medium when none captured yet
      if (med && !medium && !isNoiseLine(med) && !isEditionLine(med)) medium = med;
      continue;
    }
    if (isNoiseLine(l)) continue;
    if (!medium) medium = l;
  }
  return { medium: medium || '', dimensions: dims.join(' / '), edition };
}

// ---- "About the work" description -----------------------------------------
function aboutWork(bodyHtml) {
  const bh = bodyHtml || '';
  const s = bh.indexOf('[[work start]]');
  if (s === -1) return '';
  const rest = bh.slice(s + '[[work start]]'.length);
  const e = rest.search(/\[\[(?:work end|artist start)\]\]/);
  let block = e !== -1 ? rest.slice(0, e) : rest;
  block = block.replace(/<h2[^>]*>.*?<\/h2>/gis, ' '); // drop "About the work" heading
  const txt = stripTags(block);
  return txt.length > 600 ? txt.slice(0, 597).trimEnd() + '...' : txt;
}

// ---- title / artist / year -------------------------------------------------
// title format: "Artist Name | Work Title (year)"  or "..., year"
function splitTitle(raw) {
  const t = stripTags(raw);
  const bar = t.indexOf('|');
  let artist = '', work = t;
  if (bar !== -1) { artist = t.slice(0, bar).trim(); work = t.slice(bar + 1).trim(); }
  return { artist, work };
}
function parseYear(title) {
  const nums = (title.match(/\b(1[89]\d{2}|20\d{2})\b/g) || []).map(Number);
  return nums.length ? Math.min(...nums) : null; // earliest = date created
}

// ---- scope / category classification --------------------------------------
// Decide category from the medium text (detail page) + medium-* tags. Returns
// null when the work is 3D / out of scope.
const EXCLUDE_KW = [
  'sculpture', 'bronze', 'ceramic', 'porcelain', 'cast ', 'glazed', 'stoneware',
  'terracotta', 'marble', 'resin', ' steel', 'aluminium', 'aluminum', 'vessel',
  'plinth', 'knitted', 'woven', 'tapestry', 'embroider', 'garment', 'blanket',
  'rice', 'beans', 'plastic bag', 'galvanised', 'galvanized',
  'fabric, plastic and wood', ' nail', 'thread, nail',
];
function classify(medium, tags) {
  const mt = (medium || '').toLowerCase();
  const tg = (tags || []).join(' ').toLowerCase();
  const blob = mt + ' ' + tg;
  if (EXCLUDE_KW.some(k => mt.includes(k))) return null;
  if (['sculpture', 'bronze', 'ceramic', '-object', 'objet', 'textile'].some(k => tg.includes(k))) return null;
  if (['watercolour', 'watercolor', 'gouache', 'oil on', 'acrylic', 'tempera'].some(k => blob.includes(k))) return 'painting';
  if (blob.includes('cyanotype')) return 'photograph';
  if (blob.includes('photogra')) return 'photograph';
  if (['silkscreen', 'screenprint', 'screen print', 'serigraph', 'lithograph', 'etching',
       'aquatint', 'engraving', 'woodcut', 'linocut', 'monotype', 'monoprint',
       'relief print', 'intaglio', 'poster', 'digital pigment', 'inkjet', 'pigment print',
       'giclee', 'giclée', 'digital print', 'c-type', 'chromogenic', 'lambda', 'print'
      ].some(k => blob.includes(k))) return 'print';
  if (['pencil', 'charcoal', 'graphite', 'pastel', 'drawing'].some(k => blob.includes(k))) return 'drawing';
  if (blob.includes('collage')) return 'mixed_media_2d';
  return null;
}

function artistFromTags(tags) {
  const t = (tags || []).find(x => /^artist-/i.test(x));
  return t ? t.replace(/^artist-/i, '').replace(/-/g, ' ').trim() : null;
}

// ---- networking + R2 -------------------------------------------------------
async function fetchJson(url, attempt = 1) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if ((res.status === 429 || res.status >= 500) && attempt <= 4) {
    await sleep(1000 * 2 ** (attempt - 1));
    return fetchJson(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
  return res.json();
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
  if ((res.status === 429 || res.status >= 500) && attempt <= 4) {
    await sleep(1000 * 2 ** (attempt - 1));
    return downloadImage(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024) throw new Error(`tiny: ${buf.length}B`);
  return buf;
}

// Best image: the product's primary image (Shopify CDN, 2500px wide originals).
function bestImage(p) {
  // top-level images[] preferred (full product images), fallback to first variant image
  const imgs = (p.images || []).map(i => i.src).filter(Boolean);
  if (imgs.length) return imgs[0];
  const v = (p.variants || []).find(x => x.featured_image?.src);
  return v?.featured_image?.src || null;
}

async function main() {
  console.log(`[whitechapel] mode=${LIMIT ? `pilot(${LIMIT})` : 'full'}  concurrency=${CONCURRENCY}`);

  // 1. Fetch all editions (Shopify paginates at limit=250).
  const products = [];
  for (let page = 1; ; page++) {
    const url = `${COLLECTION_URL}?limit=250&page=${page}`;
    const batch = (await fetchJson(url)).products || [];
    if (!batch.length) break;
    products.push(...batch);
    console.log(`[whitechapel] page ${page}: +${batch.length}  total=${products.length}`);
    if (batch.length < 250) break;
    await sleep(300);
  }
  console.log(`[whitechapel] total editions fetched: ${products.length}`);

  // 2. Parse + scope-filter.
  const candidates = [];
  let droppedScope = 0, droppedNoImg = 0, droppedNoTitle = 0;
  for (const p of products) {
    const { medium, dimensions, edition } = parseSpecs(p.body_html);
    const category = classify(medium, p.tags);
    if (!category) { droppedScope++; continue; }

    const { artist: tArtist, work } = splitTitle(p.title);
    const artist = tArtist || artistFromTags(p.tags) || (p.vendor && p.vendor !== work ? p.vendor : null);
    // strip trailing "(year)" / ", year" and colour-variant suffix is kept as part of title
    let title = work.replace(/[\s,]*\((?:[^()]*\b(?:1[89]\d{2}|20\d{2})\b[^()]*)\)\s*$/,'').trim();
    title = title.replace(/[\s,]+\d{4}(?:\/\d{2,4})?\s*$/, '').trim(); // ", 2020" form
    if (!title) title = work;
    const year = parseYear(p.title);
    const img = bestImage(p);

    if (!title) { droppedNoTitle++; continue; }
    if (!img) { droppedNoImg++; continue; }
    if (!artist) { droppedNoTitle++; continue; } // 4-MUST: artist required (site always has it)
    if (year == null) { droppedNoTitle++; continue; }

    candidates.push({
      product: p, id: `whitechapel-${p.id}`, handle: p.handle,
      title, artist, year, medium, dimensions, edition, category,
      description: aboutWork(p.body_html), img,
    });
  }
  console.log(`[whitechapel] in-scope candidates: ${candidates.length}  (dropped: scope=${droppedScope} noImg=${droppedNoImg} noTitle/artist/year=${droppedNoTitle})`);

  const work = LIMIT ? candidates.slice(0, LIMIT) : candidates;

  // 3. Download → webp → R2.
  const artworks = [];
  const failed = [];
  let done = 0;
  const queue = [...work];

  async function processOne(c) {
    const p = c.product;
    const key = `artworks/whitechapel-collection/${c.id}-${hash8(c.img)}-imageUrl.webp`;
    try {
      if (!(await r2Exists(key))) {
        const buf = await downloadImage(c.img);
        const webp = await sharp(buf, { limitInputPixels: false })
          .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 85 }).toBuffer();
        await r2Upload(key, webp);
      }
      const sourceUrl = `${SOURCE_BASE}${c.handle}`;
      artworks.push({
        id: c.id,
        objectNumber: String(p.id),
        title: c.title,
        artist: c.artist,
        date: c.edition ? `${c.year}` : String(c.year),
        year: c.year,
        medium: c.medium || '',
        dimensions: c.dimensions || '',
        category: c.category,
        description: c.description || '',
        imageUrl: `${R2_PUBLIC}/${key}`,
        thumbnailUrl: c.img,
        onDisplay: false,
        displayLocation: '',
        sourceUrl,
        metadata: {
          shopifyProductId: p.id,
          handle: c.handle,
          productType: p.product_type,
          vendor: p.vendor,
          edition: c.edition || '',
          tags: (p.tags || []).filter(t => /^(artist|medium|nationality)/i.test(t)),
        },
        original_imageUrl: c.img,
      });
    } catch (e) {
      failed.push({ id: c.id, handle: c.handle, img: c.img, reason: e.message });
    } finally {
      done++;
      if (done % 25 === 0 || done === work.length) {
        console.log(`[whitechapel] ${done}/${work.length}  ok=${artworks.length}  fail=${failed.length}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const c = queue.shift();
      if (!c) return;
      await processOne(c);
    }
  }));

  // 4. Write JSON.
  const out = {
    museum: 'Whitechapel Gallery',
    collection: 'Artist Editions',
    website: 'https://www.whitechapelgallery.org',
    source: `Shopify storefront JSON (${COLLECTION_URL}) + per-product body_html spec parse`,
    scraped_date: '2026-05-27',
    total_count: artworks.length,
    source_type: 'shopify-json',
    note: 'Whitechapel Gallery is a kunsthalle with no permanent collection. This is its Artist Editions catalogue (limited-edition prints/multiples) published on the gallery\'s own Shopify store. Scope-filtered to flat visual art; 3D editions (sculpture/ceramic/bronze/object/textile) excluded.',
    artworks,
  };
  fs.writeFileSync(path.join(REPO_ROOT, OUT_JSON), JSON.stringify(out, null, 2));
  console.log(`\n[whitechapel] wrote ${OUT_JSON} (${artworks.length} artworks)`);

  if (failed.length) {
    const failPath = path.join(REPO_ROOT, `scripts/.state/${STEM}-failed.ndjson`);
    fs.mkdirSync(path.dirname(failPath), { recursive: true });
    fs.writeFileSync(failPath, failed.map(f => JSON.stringify(f)).join('\n'));
    console.log(`[whitechapel] failed log: ${failPath} (${failed.length} items)`);
  }

  // 5. Coverage.
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
