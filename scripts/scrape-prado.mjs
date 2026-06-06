#!/usr/bin/env node
// Prado collection scraper — Wikidata SPARQL → R2.
// Usage:  node scripts/scrape-prado.mjs --limit=100   (pilot)
//         node scripts/scrape-prado.mjs               (full ~3,740)
//
// Output: public/data/prado-collection{-pilot}.json + R2 uploads under
//         artworks/prado-collection{-pilot}/{id}-{hash8}-imageUrl.webp

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config({ path: path.resolve(fileURLToPath(import.meta.url), '../../.env.local') });

// ---------- args ----------
const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const LIMIT   = args.limit ? Number(args.limit) : null;            // null = full
const IS_PILOT = !!args.limit;
const STEM    = IS_PILOT ? 'prado-collection-pilot' : 'prado-collection';
const OUT_JSON = `public/data/${STEM}.json`;
const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const UA = 'armin-museum-research/1.0 (niet89@kookmin.ac.kr)';

// ---------- R2 ----------
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

// ---------- SPARQL ----------
const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
const QUERY = `
SELECT ?work ?workLabel ?image ?sitelinks
       (SAMPLE(?creatorLabel) AS ?artist)
       (SAMPLE(?inception)    AS ?inceptionAny)
       (GROUP_CONCAT(DISTINCT ?materialLabel; separator="; ") AS ?materials)
       (GROUP_CONCAT(DISTINCT ?genreLabel;    separator="; ") AS ?genres)
       (GROUP_CONCAT(DISTINCT ?instanceLabel; separator="; ") AS ?instances)
       (SAMPLE(?heightCm) AS ?height)
       (SAMPLE(?widthCm)  AS ?width)
WHERE {
  ?work wdt:P276 wd:Q160112 ;
        wdt:P18  ?image ;
        wikibase:sitelinks ?sitelinks .
  FILTER NOT EXISTS {
    ?work wdt:P31/wdt:P279* ?bad .
    VALUES ?bad { wd:Q860861 wd:Q179700 wd:Q220659 wd:Q1456936 wd:Q464980 }
  }
  FILTER (!REGEX(STR(?image), "\\\\.svg$", "i"))
  OPTIONAL { ?work wdt:P170 ?creator . ?creator rdfs:label ?creatorLabel . FILTER(LANG(?creatorLabel) IN ("en","es")) }
  OPTIONAL { ?work wdt:P571 ?inception . }
  OPTIONAL { ?work wdt:P186 ?material . ?material rdfs:label ?materialLabel . FILTER(LANG(?materialLabel) IN ("en","es")) }
  OPTIONAL { ?work wdt:P136 ?genre . ?genre rdfs:label ?genreLabel . FILTER(LANG(?genreLabel) IN ("en","es")) }
  OPTIONAL { ?work wdt:P31  ?instance . ?instance rdfs:label ?instanceLabel . FILTER(LANG(?instanceLabel) IN ("en","es")) }
  OPTIONAL { ?work p:P2048/psv:P2048 [wikibase:quantityAmount ?heightCm ; wikibase:quantityUnit wd:Q174728] . }
  OPTIONAL { ?work p:P2049/psv:P2049 [wikibase:quantityAmount ?widthCm  ; wikibase:quantityUnit wd:Q174728] . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,es". }
}
GROUP BY ?work ?workLabel ?image ?sitelinks
ORDER BY DESC(?sitelinks)
${LIMIT ? `LIMIT ${LIMIT * 2}` : ''}
`;

// ---------- helpers ----------
function categoryFor(instances, genres) {
  const all = `${instances} ${genres}`.toLowerCase();
  if (/\b(etching|engraving|lithograph|woodcut|print)\b/.test(all)) return 'print';
  if (/\b(drawing|cartoon|sketch|pastel)\b/.test(all)) return 'drawing';
  if (/\b(photograph|photo)\b/.test(all)) return 'photograph';
  if (/\b(film|video|moving image)\b/.test(all)) return 'video';
  return 'painting'; // Prado default (>95% of holdings)
}

function yearOf(iso) {
  if (!iso) return null;
  const m = String(iso).match(/^(-?\d{1,4})/);
  return m ? Number(m[1]) : null;
}

function dimsString(h, w) {
  if (!h && !w) return '';
  const fmt = n => (n == null ? '?' : Number(n).toFixed(1).replace(/\.0$/, ''));
  return `height ${fmt(h)} cm × width ${fmt(w)} cm`;
}

function hash8(s) { return crypto.createHash('sha256').update(s).digest('hex').slice(0, 8); }

async function sparqlFetch(query) {
  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Accept: 'application/sparql-results+json', 'User-Agent': UA } });
  if (!res.ok) throw new Error(`SPARQL ${res.status}: ${await res.text().then(t => t.slice(0, 200))}`);
  return res.json();
}

async function downloadImage(url, attempt = 1) {
  // Follow redirects; Special:FilePath → upload.wikimedia.org
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
  if (res.status === 429 && attempt <= 4) {
    const wait = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s, 8s
    await new Promise(r => setTimeout(r, wait));
    return downloadImage(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024) throw new Error(`tiny: ${buf.length}B`);
  return buf;
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

// ---------- main ----------
async function main() {
  console.log(`[prado] mode=${IS_PILOT ? 'pilot' : 'full'} limit=${LIMIT ?? '∞'}`);

  // 1. SPARQL
  console.log('[prado] SPARQL …');
  const t0 = Date.now();
  const sparql = await sparqlFetch(QUERY);
  const rows = sparql.results.bindings;
  console.log(`[prado] SPARQL ok: ${rows.length} rows in ${Date.now() - t0}ms`);

  // 2. dedup by image URL — keep highest-sitelinks QID
  const byImg = new Map();
  for (const r of rows) {
    const img = r.image.value;
    const sitelinks = Number(r.sitelinks.value);
    const prev = byImg.get(img);
    if (!prev || sitelinks > prev._sitelinks) byImg.set(img, { ...r, _sitelinks: sitelinks });
  }
  let unique = [...byImg.values()];
  if (LIMIT) unique = unique.slice(0, LIMIT);
  console.log(`[prado] unique after dedup: ${unique.length}`);

  // 3. build artworks + upload (concurrent)
  const artworks = [];
  const failed = [];
  let done = 0;
  const CONCURRENCY = Number(args.concurrency || 4);

  async function processOne(r) {
    const qid = r.work.value.split('/').pop();
    const imageUrl = r.image.value;
    let title = r.workLabel?.value || '';
    let artist = r.artist?.value || null;
    const year = yearOf(r.inceptionAny?.value);
    const materials = r.materials?.value || '';
    const genres = r.genres?.value || '';
    const instances = r.instances?.value || '';
    const cat = categoryFor(instances, genres);

    // Wikidata label service returns QID as fallback when no language label exists
    if (!title || /^Q\d+$/.test(title)) {
      failed.push({ qid, reason: 'no-label-in-en' });
      return;
    }
    if (!artist) artist = 'Anonymous';

    const record = {
      id: qid,
      objectNumber: qid,
      title,
      artist,
      date: r.inceptionAny?.value || null,
      year,
      medium: materials,
      dimensions: dimsString(r.height?.value, r.width?.value),
      category: cat,
      description: '',
      imageUrl: '',
      thumbnailUrl: imageUrl + (imageUrl.includes('?') ? '&' : '?') + 'width=400',
      onDisplay: true,
      displayLocation: '',
      sourceUrl: `https://www.wikidata.org/wiki/${qid}`,
      metadata: { wikidataQid: qid, sitelinks: r._sitelinks, instanceOf: instances, genre: genres },
      original_imageUrl: imageUrl,
    };

    const key = `artworks/${STEM}/${qid}-${hash8(imageUrl)}-imageUrl.webp`;
    try {
      const present = await r2Exists(key);
      if (!present) {
        const buf = await downloadImage(imageUrl);
        const webp = await sharp(buf, { limitInputPixels: false })
                       .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
                       .webp({ quality: 85 }).toBuffer();
        await r2Upload(key, webp);
      }
      record.imageUrl = `${R2_PUBLIC}/${key}`;
      artworks.push(record);
    } catch (e) {
      failed.push({ qid, imageUrl, reason: e.message });
    } finally {
      done++;
      if (done % 50 === 0 || done === unique.length) {
        console.log(`[prado] ${done}/${unique.length}  ok=${artworks.length}  fail=${failed.length}`);
      }
    }
  }

  // simple worker pool
  const queue = [...unique];
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const r = queue.shift();
      if (!r) return;
      await processOne(r);
    }
  }));

  // 4. write JSON
  const out = {
    museum: 'Museo Nacional del Prado',
    collection: IS_PILOT ? 'Pilot (top sitelinks)' : 'All works on Wikidata with image',
    website: 'https://www.museodelprado.es/coleccion',
    source: 'Wikidata SPARQL (wdt:P276 wd:Q160112)',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'sparql',
    artworks,
  };
  const outPath = path.join(REPO_ROOT, OUT_JSON);
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`\n[prado] wrote ${outPath}  (${artworks.length} artworks)`);

  if (failed.length) {
    const failPath = path.join(REPO_ROOT, `scripts/.state/${STEM}-failed.ndjson`);
    fs.mkdirSync(path.dirname(failPath), { recursive: true });
    fs.writeFileSync(failPath, failed.map(f => JSON.stringify(f)).join('\n'));
    console.log(`[prado] failed log: ${failPath} (${failed.length} items)`);
  }

  // 5. summary
  const cov = k => artworks.filter(a => a[k] && (typeof a[k] === 'string' ? a[k].length : true)).length;
  console.log(`\n=== Coverage on ${artworks.length} kept records ===`);
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
