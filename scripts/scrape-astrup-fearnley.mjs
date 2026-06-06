#!/usr/bin/env node
// Astrup Fearnley Museet (Oslo) — full collection scraper.
// Source: museum-OWN WordPress REST API (custom post type `artwork`), no auth.
//   GET https://www.afmuseet.no/wp-json/wp/v2/artwork?per_page=N&page=P&_embed
// Metadata comes from the DETAIL record (title.rendered, _embedded wp:term artist/year,
//   meta.afm_artwork_technique [Norwegian], meta.afm_artwork_dimensions [Norwegian]).
// Full image = _embedded wp:featuredmedia[0].media_details.sizes.full.source_url (museum CDN).
//
// SCOPE: flat visual works only — classify each record by parsing the Norwegian technique
//   string (the artwork-category taxonomy is unused). Paintings: ALL (no cap). Other 2D
//   (photo/print/works-on-paper/video/2D-textile): all in-scope (small contemporary corpus).
//   Excluded: sculpture/3D (steel, resin, ceramic, free-standing objects, etc.).
//
// CAVEAT (verified Phase A live): ONE record (offset 452, between id 2004 and id 1994) is
//   server-side broken — the WP backend returns HTTP 500 even without _embed, so it cannot be
//   serialized at all. We fetch with adaptive page-size fallback (50 → 5 → 1) to recover every
//   OTHER record (475/476) and skip only that single dead record. (It is 3D-adjacent anyway.)
//
// Usage:
//   node scripts/scrape-astrup-fearnley.mjs --classify   # dry-run: scope tally only (no images)
//   node scripts/scrape-astrup-fearnley.mjs --pilot      # build ~100 in-scope + R2 upload, write pilot JSON
//   node scripts/scrape-astrup-fearnley.mjs --full       # full scrape + R2 upload, write collection JSON

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { autocropToWebp } from './lib/autocrop.mjs';

const require = createRequire(import.meta.url);
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const REPO = path.resolve(fileURLToPath(import.meta.url), '../..');
require('dotenv').config({ path: path.join(REPO, '.env.local') });

const SLUG = 'astrup-fearnley';
const COLLECTION_STEM = `${SLUG}-collection`;
const API = 'https://www.afmuseet.no/wp-json/wp/v2/artwork';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : args.includes('--pilot') ? 'pilot' : 'classify';
const PILOT_TARGET = 100;

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const decodeEntities = (s) => (s || '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#8217;/g, '’')
  .replace(/&#8216;/g, '‘').replace(/&#8211;/g, '–').replace(/&#8212;/g, '—')
  .replace(/&hellip;/g, '…').replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).trim();

// ---------- fetch layer: adaptive page-size fallback to recover all serializable records ----------
async function getJson(per_page, page) {
  const url = `${API}?per_page=${per_page}&page=${page}&_embed`;
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (r.status === 500) return { fail: true };           // server cannot serialize this window
  if (!r.ok) throw new Error(`HTTP ${r.status} @ ${url}`);
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) return { fail: true };
  return { data: await r.json() };
}

// Fetch a contiguous range of `count` records starting at 1-based `startOffset`, splitting
// any 500-window down to per_page=1 and skipping only the single records that 500.
async function fetchRange(startOffset, count, big = 50) {
  const out = [];
  let off = startOffset;
  let remaining = count;
  while (remaining > 0) {
    const take = Math.min(big, remaining);
    // express this slice as one API page at the right granularity
    if ((off - 1) % take === 0) {
      const page = (off - 1) / take + 1;
      const res = await getJson(take, page);
      await sleep(700);
      if (!res.fail) { out.push(...res.data); off += take; remaining -= take; continue; }
      // window failed → split
      if (take === 1) { console.log(`  [skip] offset ${off}: server 500 (unserializable record)`); off += 1; remaining -= 1; continue; }
    }
    // not page-aligned for `take`, or window failed → drop to a finer granularity for this record
    const fine = (off - 1) % 5 === 0 && remaining >= 5 ? 5 : 1;
    const page = (off - 1) / fine + 1;
    const res = await getJson(fine, page);
    await sleep(700);
    if (!res.fail) { out.push(...res.data); off += fine; remaining -= fine; continue; }
    if (fine === 1) { console.log(`  [skip] offset ${off}: server 500 (unserializable record)`); off += 1; remaining -= 1; continue; }
    // fine=5 window failed → go record by record
    for (let i = 0; i < 5 && remaining > 0; i++) {
      const r1 = await getJson(1, off);
      await sleep(700);
      if (!r1.fail) out.push(...r1.data);
      else console.log(`  [skip] offset ${off}: server 500 (unserializable record)`);
      off += 1; remaining -= 1;
    }
  }
  return out;
}

async function fetchAll() {
  // total from headers
  const head = await fetch(`${API}?per_page=1&page=1`, { headers: { 'User-Agent': UA } });
  const total = parseInt(head.headers.get('x-wp-total') || '0', 10);
  console.log(`[fetch] X-WP-Total = ${total}`);
  const records = await fetchRange(1, total, 50);
  console.log(`[fetch] recovered ${records.length}/${total} records (${total - records.length} unserializable on server)`);
  return records;
}

// ---------- scope classifier (parse Norwegian technique) ----------
// Returns one of: painting | photograph | print | drawing | video | mixed_media_2d  (in-scope)
//   or null (out of scope: sculpture/3D/object).
function classify(techRaw) {
  const t = (techRaw || '').toLowerCase().normalize('NFC');
  if (!t) return null;

  // 1) hard EXCLUDE — unambiguous 3D / sculpture / object materials & forms.
  const EXCLUDE = [
    'rustfritt stål', 'stål', 'aluminium', 'bronse', 'messing', 'kobber', 'jern', 'metall',
    'harpiks', 'polyuretan', 'epoksy', 'fiberglass', 'glassfiber', 'silikon',
    'marmor', 'granitt', 'stein', 'betong', 'gips', 'keramikk', 'porselen', 'terrakotta', 'leire',
    'støpt', 'voks', 'tre og', 'i tre', 'av tre', 'plexiglass', 'akrylglass',
    'taxidermi', 'utstoppet', 'neon', 'lysrør', 'glødelampe',
    'installasjon', 'skulptur', 'objekt', 'funnet', 'ready-made', 'readymade', 'maskin', 'motor',
    'møbel', 'stol', 'bord', 'seng', 'vinyl på vegg', 'gummi', 'lateks', 'skum',
    'jord og', 'planter', 'levende', 'mat', 'sukker', 'sjokolade',
  ];
  if (EXCLUDE.some((k) => t.includes(k))) return null;

  // 2) VIDEO / moving image
  if (/\bvideo|film(?!ostat)|dvd|projeksjon|bevegelig|lysbilde|slide|lyd\b|sound/.test(t)) return 'video';

  // 3) PHOTOGRAPH
  if (/c-print|cprint|c-type|lambda|lamba|fargefotografi|sølvgelatin|fotografi|fototrykk|fotogravyr|fargetrykk|kromogent|giclée|giclee|fibertrykk|pigmenttrykk|inkjet|arkivbestandig|bromsølv|gelatin/.test(t)) return 'photograph';

  // 4) PAINTING (collect ALL)
  if (/olje|akryl|tempera|akvarell|gouache|maling|emalje på|lakk på lerret|lerret|lin\b|pannå|panel\b|plate\b|duk\b|maleri/.test(t)) {
    // guard: "emalje" alone (enamel object) was already excluded above only via 3D forms; on canvas it's painting.
    return 'painting';
  }

  // 5) PRINT (works on paper – multiples)
  if (/litografi|silketrykk|serigrafi|etsning|kobberstikk|tresnitt|linosnitt|raderingen|radering|xerox|kopitrykk|offset|screenprint|stencil|sjablong|trykk på papir|grafikk/.test(t)) return 'print';

  // 6) DRAWING (unique works on paper)
  if (/kull|blyant|tusj|blekk|sumi|fargestift|pastell|kritt|gouache på papir|collage|akvarell på papir|tegning|på papir|på japanpapir|papir/.test(t)) return 'drawing';

  // 7) 2D textile / mixed flat (broderi/billedvev/tekstil as wall works)
  if (/broderi|billedvev|tekstil|veving|applikasjon|paljett|stoff på/.test(t)) return 'mixed_media_2d';

  // 8) generic mixed media → treat as flat mixed (only if not caught by EXCLUDE)
  if (/blandet teknikk|blandingsteknikk|mixed media|montasje|collage/.test(t)) return 'mixed_media_2d';

  return null; // unknown → out of scope (conservative)
}

// ---------- detail-record → ARMIN artwork ----------
function parseRecord(r) {
  const terms = (r._embedded && r._embedded['wp:term'] || []).flat().filter(Boolean);
  const artist = terms.filter((x) => x.taxonomy === 'artist').map((x) => decodeEntities(x.name)).filter(Boolean).join('; ');
  const yearTerm = terms.find((x) => x.taxonomy === 'artwork-year');
  const yearStr = yearTerm ? String(yearTerm.name).trim() : '';
  const yearMatch = yearStr.match(/\d{4}/);
  const year = yearMatch ? parseInt(yearMatch[0], 10) : null;

  let title = decodeEntities(r.title && r.title.rendered);
  // titles carry a ", {year}" suffix (year is a separate field) — strip the trailing year.
  const dateStr = yearStr || (year ? String(year) : '');
  title = title.replace(/,\s*(c\.?\s*)?\d{4}(\s*[–-]\s*\d{2,4})?\s*$/i, '').trim();

  const medium = (r.meta && r.meta.afm_artwork_technique || '').trim();
  const dimensions = (r.meta && r.meta.afm_artwork_dimensions || '').trim();

  // full-size image: prefer sizes.full, else top-level source_url
  const fm = r._embedded && r._embedded['wp:featuredmedia'] && r._embedded['wp:featuredmedia'][0];
  let imgUrl = null;
  if (fm) {
    const sizes = fm.media_details && fm.media_details.sizes;
    imgUrl = (sizes && sizes.full && sizes.full.source_url) || fm.source_url || null;
  }

  const category = classify(medium);
  return { id: String(r.id), slug: r.slug, title, artist, year, dateStr, medium, dimensions, category, imgUrl, sourceUrl: r.link };
}

// ---------- image: download full-size, autocrop, upload to R2 ----------
async function dl(url) {
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 5000) throw new Error(`tiny ${buf.length}b`);
      return buf;
    } catch (e) { if (att === 3) throw e; await sleep(500 * att); }
  }
}

async function uploadR2(key, buffer) {
  for (let att = 1; att <= 4; att++) {
    try {
      await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buffer, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000' }));
      return true;
    } catch (e) { if (att === 4) throw e; await sleep(400 * att); }
  }
}

async function processImage(a) {
  const src = await dl(a.imgUrl);                       // full-size jpeg from museum CDN
  const meta = await (await import('sharp')).default(src).metadata().catch(() => ({}));
  if (meta.width && Math.max(meta.width, meta.height) < 600) throw new Error(`thumb ${meta.width}x${meta.height}`);
  const { buffer } = await autocropToWebp(src);         // white-trim + webp(2048/q85)
  const hash8 = sha(a.imgUrl).slice(0, 8);
  const key = `artworks/${COLLECTION_STEM}/${a.id}-${hash8}-imageUrl.webp`;
  await uploadR2(key, buffer);
  return { imageUrl: `${R2_PUBLIC}/${key}`, srcW: meta.width || null, srcH: meta.height || null };
}

// ---------- record assembly (min-4 guard) ----------
function toArtwork(a, imageUrl) {
  if (!a.title || !a.artist || a.year == null || !a.category) return null; // min-4 → drop
  return {
    id: a.id,
    objectNumber: '',
    title: a.title,
    artist: a.artist,
    date: a.dateStr || (a.year != null ? String(a.year) : ''),
    year: a.year,
    medium: a.medium,
    dimensions: a.dimensions,
    category: a.category,
    description: '',
    imageUrl,
    thumbnailUrl: a.imgUrl,
    onDisplay: false,
    displayLocation: '',
    sourceUrl: a.sourceUrl,
    metadata: { wp_id: a.id, wp_slug: a.slug },
    original_imageUrl: a.imgUrl,
  };
}

function writeCollection(artworks, stem) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'Astrup Fearnley Museet',
    collection: 'Collection',
    website: 'https://www.afmuseet.no/en/collection/',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'api',
    category_breakdown: cats,
    artworks,
  };
  const out = path.join(REPO, 'public/data', `${stem}.json`);
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
  console.log(`[write] ${out} (${artworks.length} works) breakdown=`, cats);
  return out;
}

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const records = await fetchAll();
  const parsed = records.map(parseRecord);

  // classification tally (full corpus)
  const tally = {};
  let inScope = 0, outScope = 0, noImg = 0, dropMin4 = 0;
  for (const p of parsed) {
    if (p.category) { inScope++; tally[p.category] = (tally[p.category] || 0) + 1; if (!p.imgUrl) noImg++; }
    else outScope++;
  }
  console.log('\n[classify] total parsed:', parsed.length);
  console.log('[classify] in-scope:', inScope, '| out-of-scope (3D/unknown):', outScope, '| in-scope missing image:', noImg);
  console.log('[classify] breakdown:', tally);

  if (MODE === 'classify') {
    // show a few of each excluded + a few unknowns for sanity
    const ex = parsed.filter((p) => !p.category).slice(0, 25);
    console.log('\n[classify] sample EXCLUDED (technique):');
    for (const p of ex) console.log('   -', JSON.stringify(p.medium), '|', p.title.slice(0, 40));
    // also report min-4 droppage among in-scope
    for (const p of parsed) if (p.category && (!p.title || !p.artist || p.year == null)) dropMin4++;
    console.log('\n[classify] in-scope records that would DROP on min-4 (missing title/artist/year):', dropMin4);
    return;
  }

  // in-scope, with image, that pass min-4 → candidates
  let candidates = parsed.filter((p) => p.category && p.imgUrl);
  if (MODE === 'pilot') candidates = candidates.slice(0, PILOT_TARGET);
  console.log(`\n[${MODE}] image-processing ${candidates.length} candidates → R2 …`);

  const artworks = [];
  let done = 0, imgErr = 0;
  const CONC = 4;
  let idx = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (idx < candidates.length) {
      const a = candidates[idx++];
      try {
        const { imageUrl } = await processImage(a);
        const w = toArtwork(a, imageUrl);
        if (w) artworks.push(w); else dropMin4++;
      } catch (e) {
        imgErr++;
        fs.appendFileSync(path.join(STATE_DIR, `${SLUG}-failed.ndjson`), JSON.stringify({ id: a.id, url: a.imgUrl, err: String(e.message || e) }) + '\n');
        if (imgErr <= 5) console.log(`  img err id=${a.id}: ${e.message}`);
      }
      if (++done % 50 === 0) console.log(`  …${done}/${candidates.length} (ok ${artworks.length}, imgErr ${imgErr})`);
    }
  }));

  artworks.sort((x, y) => Number(x.id) - Number(y.id));
  const stem = MODE === 'pilot' ? `${COLLECTION_STEM}-pilot` : COLLECTION_STEM;
  writeCollection(artworks, stem);
  console.log(`\n[${MODE}] DONE. collected ${artworks.length} | img errors ${imgErr} | min4-drops ${dropMin4}`);
  console.log(`[${MODE}] total in-scope offered = ${inScope}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
