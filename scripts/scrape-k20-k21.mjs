#!/usr/bin/env node
// Kunstsammlung NRW (K20/K21) collection scraper.
// Source: sammlung.kunstsammlung.de "Collection Online" (MuseumPlus backend, static Tailwind front-end).
//
// Strategy:
//   1. Fetch /en/works (single page lists ALL 388 works as <article data-id="teaser_work">)
//   2. Filter by data-mt (Type & Material term id) to flat visual art:
//        painting, photography, works on paper, collage, new media(=video)
//   3. For each work: fetch /en/works/{id} detail HTML, parse
//        title+date (h1), artist + birth/death (p.text-h2 + accordion),
//        Material/Technique, Dimensions, Signature, Accession Number,
//        Catalogue Raisonné, Acquisition year, on-view tag.
//   4. Refine category from material text; reject pure 3D installation/sculpture.
//   5. Download cblightbox full-res /museumplus image → webp → R2 (resumable).
// Usage:  node scripts/scrape-k20-k21.mjs [--limit=N] [--concurrency=N]

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
const STEM        = args.limit ? 'k20-k21-pilot-collection' : 'k20-k21-collection';
const OUT_JSON    = `public/data/${STEM}.json`;
const REPO_ROOT   = path.resolve(fileURLToPath(import.meta.url), '../..');
const UA          = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const BASE        = 'https://sammlung.kunstsammlung.de';

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

// data-mt term id → our canonical category (excluded types intentionally absent)
const MT_MAP = {
  '169862': 'painting',
  '169860': 'photograph',
  '188682': 'works_on_paper', // refined later → drawing / print
  '169852': 'mixed_media_2d', // collage
  '169869': 'video',          // new media (mostly single/multi-channel video)
  // 169876 sculpture, 169866 installation, 169875 relief, 169879 textile art → excluded
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const hash8 = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 8);

function dec(s) {
  return (s || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, ' ');
}
const stripTags = s => dec((s || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

async function fetchHtml(url, attempt = 1) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
  if ((res.status === 429 || res.status >= 500) && attempt <= 3) { await sleep(1000 * 2 ** (attempt - 1)); return fetchHtml(url, attempt + 1); }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// Parse a work detail page into structured metadata.
function parseDetail(html) {
  const out = {
    title: '', date: '', year: null, artist: null,
    artistBorn: null, artistDied: null, artistBirthPlace: '', artistDeathPlace: '',
    medium: '', dimensions: '', signature: '', accession: '',
    catalogueRaisonne: '', acquisitionYear: null, onViewTag: '',
  };

  // Title + date: <h1 class="text-h1"><span class="block">TITLE,</span><span class="block">DATE</span></h1>
  const h1 = html.match(/<h1 class="text-h1">([\s\S]*?)<\/h1>/);
  if (h1) {
    const spans = [...h1[1].matchAll(/<span[^>]*>([\s\S]*?)<\/span>/g)].map(m => stripTags(m[1]));
    if (spans.length) {
      out.title = spans[0].replace(/,\s*$/, '').trim();
      if (spans.length > 1) out.date = spans.slice(1).join(' ').replace(/,\s*$/, '').trim();
    }
  }

  // Artist: <p class="text-h2">ARTIST</p> right after </h1>
  const artistM = html.match(/<\/h1>\s*<p class="text-h2">([\s\S]*?)<\/p>/);
  if (artistM) out.artist = stripTags(artistM[1]);

  // Artist accordion → birth / death year+place (two <p>YEAR<br>PLACE</p> after the name <p>)
  const accIdx = html.indexOf('>Artist</summary>');
  if (accIdx >= 0) {
    const block = html.slice(accIdx, accIdx + 1400);
    const ps = [...block.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map(m => m[1]);
    // ps[0] = name; ps[1] = birth "1884<br>Livorno, Italien"; ps[2] = death
    const parseLife = raw => {
      const txt = stripTags(raw);
      const ym = txt.match(/\b(1[5-9]\d{2}|20\d{2})\b/);
      const year = ym ? Number(ym[0]) : null;
      const place = txt.replace(/\b(1[5-9]\d{2}|20\d{2})\b/, '').replace(/\s+/g, ' ').trim();
      return { year, place };
    };
    if (ps[1]) { const b = parseLife(ps[1]); out.artistBorn = b.year; out.artistBirthPlace = b.place; }
    if (ps[2]) { const d = parseLife(ps[2]); out.artistDied = d.year; out.artistDeathPlace = d.place; }
  }

  // Metadata blocks: <h4 class="text-h4">LABEL</h4> <p>VALUE</p>  (NON-GREEDY value capture)
  const blocks = {};
  for (const m of html.matchAll(/<h4 class="text-h4">([\s\S]*?)<\/h4>\s*<p>([\s\S]*?)<\/p>/g)) {
    const k = stripTags(m[1]);
    const v = stripTags(m[2]);
    if (k && !(k in blocks)) blocks[k] = v;
  }
  out.medium      = blocks['Material/Technique'] || '';
  out.dimensions  = blocks['Dimensions'] || '';
  out.signature   = blocks['Signature'] || '';
  out.accession   = blocks['Accession Number'] || '';
  out.catalogueRaisonne = blocks['Catalogue Raisonné'] || blocks['Catalogue Raisonne'] || '';
  if (blocks['Acquisition year']) { const y = blocks['Acquisition year'].match(/\d{4}/); if (y) out.acquisitionYear = Number(y[0]); }

  // On-view tag: <a href="/en/works/?tag=k20" class="tag"><span>On view at K20</span></a>
  const tagM = html.match(/href="\/en\/works\/\?tag=(k2[01])"[^>]*class="tag"/i);
  if (tagM) out.onViewTag = tagM[1].toUpperCase();

  // Year from date string (handles "um 1911–1912", "1990/2002", "1958", "[2002]")
  if (out.date) { const y = out.date.match(/\b(1[5-9]\d{2}|20\d{2})\b/); if (y) out.year = Number(y[0]); }
  // Fallback: some works carry the date only in the title (e.g. "1926", On Kawara "MAY 18, 1995")
  if (out.year == null && out.title) { const y = out.title.match(/\b(1[5-9]\d{2}|20\d{2})\b/); if (y) out.year = Number(y[0]); }

  // Main image full-res: cblightbox href to /museumplus, pick largest ?w=
  const imgs = [...html.matchAll(/href="(\/museumplus\/[^"]+?\.jpe?g)\?w=(\d+)"/g)]
    .map(m => ({ url: m[1], w: Number(m[2]) }))
    .sort((a, b) => a.w - b.w);
  out.image = imgs.length ? imgs[imgs.length - 1].url : null;

  return out;
}

// Refine "works on paper" into drawing vs print using material text.
function refineCategory(rawCat, medium) {
  const m = (medium || '').toLowerCase();
  if (rawCat === 'works_on_paper') {
    if (/(etching|lithograph|litho|screenprint|silkscreen|woodcut|linocut|engraving|aquatint|drypoint|monotype|serigraph|print|druck|radierung|holzschnitt|siebdruck)/.test(m)) return 'print';
    return 'drawing'; // watercolor, gouache, pencil, chalk, ink, charcoal, pastel on paper
  }
  return rawCat;
}

// A "new media" work that is actually a spatial sculpture/installation is out of scope,
// even if it embeds monitors. Decide on the LEADING clause, not a keyword buried in a
// long materials list (e.g. Mucha "Multi-part sculptural room installation … 15 video …").
function isVideoWork(medium) {
  const m = (medium || '').toLowerCase();
  const lead = m.slice(0, 60);
  // reject when the work leads with sculptural/physical-object language
  if (/(sculptural|room installation)/.test(lead)) return false;
  if (/^\s*\d+\s+(clock|object|element|sculpture|lamp|tube)/.test(lead)) return false;
  // otherwise: include if any moving-image medium is present
  return /(video|film|moving image|projection|\b4k\b|\bhd\b|channel|dvd|betacam|16 mm|16mm|multimedia|live simulation|animation)/.test(m);
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
  const res = await fetch(url, { headers: { 'User-Agent': UA, Referer: BASE + '/en/works' }, redirect: 'follow' });
  if ((res.status === 429 || res.status >= 500) && attempt <= 4) { await sleep(1000 * 2 ** (attempt - 1)); return downloadImage(url, attempt + 1); }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 2048) throw new Error(`tiny: ${buf.length}B`);
  return buf;
}

async function main() {
  console.log(`[k20] mode=${LIMIT ? `pilot(${LIMIT})` : 'full'}  concurrency=${CONCURRENCY}`);

  // 1. Listing — single page holds all works
  const listingHtml = await fetchHtml(`${BASE}/en/works`);
  const cards = [...listingHtml.matchAll(/<article data-id="teaser_work"([^>]*)>[\s\S]*?href="\/en\/works\/(\d+)"/g)];
  console.log(`[k20] listing: ${cards.length} total work cards`);

  // 2. Filter by data-mt to flat visual art
  let candidates = [];
  const typeCount = {};
  for (const c of cards) {
    const attrs = c[1];
    const id = c[2];
    const mt = (attrs.match(/data-mt="([^"]*)"/) || [])[1] || '';
    const rawCat = MT_MAP[mt];
    if (!rawCat) continue;
    const ov = (attrs.match(/data-ov="([^"]*)"/) || [])[1] || '';
    typeCount[mt] = (typeCount[mt] || 0) + 1;
    candidates.push({ id, mt, rawCat, ov });
  }
  console.log(`[k20] after type filter: ${candidates.length} candidates  ${JSON.stringify(typeCount)}`);
  if (LIMIT) candidates = candidates.slice(0, LIMIT);

  // 3. Process each
  const artworks = [];
  const failed = [];
  const skipped = [];
  let done = 0;

  async function processOne(c) {
    const sourceUrl = `${BASE}/en/works/${c.id}`;
    let html, meta;
    try { html = await fetchHtml(sourceUrl); meta = parseDetail(html); }
    catch (e) { failed.push({ id: c.id, reason: `detail-fetch: ${e.message}` }); done++; return; }

    if (!meta.title) { failed.push({ id: c.id, reason: 'no-title' }); done++; return; }
    if (!meta.image) { failed.push({ id: c.id, reason: 'no-image' }); done++; return; }

    // category refine + scope guard
    let category = refineCategory(c.rawCat, meta.medium);
    if (category === 'video' && !isVideoWork(meta.medium)) {
      skipped.push({ id: c.id, reason: 'new-media-not-video', medium: meta.medium.slice(0, 80) });
      done++; return;
    }

    // artist must be real (site shows it for every work; "Anonymous" only if truly absent)
    let artist = meta.artist;
    if (!artist || !artist.trim()) artist = 'Anonymous';

    const imageUrl = `${BASE}${meta.image}`;
    const key = `artworks/${STEM}/${c.id}-${hash8(imageUrl)}-imageUrl.webp`;
    try {
      if (!await r2Exists(key)) {
        const buf = await downloadImage(imageUrl);
        const webp = await sharp(buf, { limitInputPixels: false })
          .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 85 }).toBuffer();
        await r2Upload(key, webp);
      }
      const onView = !!c.ov || !!meta.onViewTag;
      const loc = (meta.onViewTag || c.ov || '').toUpperCase();
      artworks.push({
        id: `k20k21-${c.id}`,
        objectNumber: meta.accession || `k20k21-${c.id}`,
        title: meta.title,
        artist,
        date: meta.date || (meta.year ? String(meta.year) : null),
        year: meta.year,
        medium: meta.medium,
        dimensions: meta.dimensions,
        category,
        description: '',
        imageUrl: `${R2_PUBLIC}/${key}`,
        thumbnailUrl: `${imageUrl.replace(/\?w=\d+$/, '')}?w=600`,
        onDisplay: onView,
        displayLocation: onView ? `On view at ${loc}` : '',
        sourceUrl,
        metadata: {
          k20RecordId: c.id,
          materialTypeId: c.mt,
          signature: meta.signature && meta.signature !== 'Unbezeichnet' ? meta.signature : '',
          catalogueRaisonne: meta.catalogueRaisonne,
          acquisitionYear: meta.acquisitionYear,
          artistBorn: meta.artistBorn,
          artistDied: meta.artistDied,
          artistBirthPlace: meta.artistBirthPlace,
          artistDeathPlace: meta.artistDeathPlace,
        },
        original_imageUrl: imageUrl,
      });
    } catch (e) {
      failed.push({ id: c.id, imageUrl, reason: e.message });
    } finally {
      done++;
      if (done % 25 === 0 || done === candidates.length) {
        console.log(`[k20] ${done}/${candidates.length}  ok=${artworks.length}  fail=${failed.length}  skipped=${skipped.length}`);
      }
    }
  }

  const queue = [...candidates];
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const c = queue.shift();
      if (!c) return;
      await processOne(c);
      await sleep(80);
    }
  }));

  // 4. Write JSON
  const out = {
    museum: 'Kunstsammlung Nordrhein-Westfalen (K20/K21)',
    collection: LIMIT ? `Pilot ${artworks.length} items` : 'Collection Online — flat visual art (masterpieces)',
    website: 'https://www.kunstsammlung.de/en/collection',
    source: 'sammlung.kunstsammlung.de Collection Online — listing data-attrs + per-work HTML detail scrape',
    scraped_date: '2026-05-27',
    total_count: artworks.length,
    source_type: 'html',
    artworks,
  };
  fs.writeFileSync(path.join(REPO_ROOT, OUT_JSON), JSON.stringify(out, null, 2));
  console.log(`\n[k20] wrote ${OUT_JSON} (${artworks.length} artworks)`);

  if (failed.length || skipped.length) {
    const stateDir = path.join(REPO_ROOT, 'scripts/.state');
    fs.mkdirSync(stateDir, { recursive: true });
    if (failed.length) fs.writeFileSync(path.join(stateDir, `${STEM}-failed.ndjson`), failed.map(f => JSON.stringify(f)).join('\n'));
    if (skipped.length) fs.writeFileSync(path.join(stateDir, `${STEM}-skipped.ndjson`), skipped.map(f => JSON.stringify(f)).join('\n'));
    console.log(`[k20] failed=${failed.length} skipped=${skipped.length} (logged to scripts/.state/)`);
  }

  // 5. Coverage
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
