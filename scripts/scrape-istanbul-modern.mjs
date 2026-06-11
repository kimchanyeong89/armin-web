#!/usr/bin/env node
// Istanbul Modern (Istanbul Museum of Modern Art) — collection scraper.
// Source: museum-OWN ASP.NET site.
//   Listing: POST https://www.istanbulmodern.org/en/filtercollection
//     form: CategoryId={4=main,3=photography} & PageNo=N & __RequestVerificationToken
//     (anti-forgery token + cookie come from a GET of the listing page; the JSON
//      response carries an HTML `list` + hasNextPage/nextPage/totalItems).
//     NOTE: list hrefs come back TR-localized (/koleksiyon/{tr-slug}) regardless of
//     locale — each TR detail page exposes its EN twin via <link hreflang="en">.
//   Detail (EN, server-rendered): h1 = "Artist, lifedates", h2 = "Title, year",
//     <strong>Medium</strong>/<p>, Technique, Dimensions, curator paragraphs,
//     image at /contents/piclib/bigsize/collection/*.jpg (paintings mostly 2000px+).
//
// SCOPE: museum's own Medium taxonomy — Painting / Photography / Work on Paper /
//   Film-Video / Video are in-scope; Installation & Sculpture are skipped.
//   Work on Paper → print vs drawing by Technique keywords. Prints (only) are
//   gated by Hasler-Süsstrunk colorfulness < 20 (B&W reproductive-print policy);
//   drawings/photographs are NEVER gated.
//
// Usage:
//   node scripts/scrape-istanbul-modern.mjs --probe   # ~20 works end-to-end → *-collection-probe.json
//   node scripts/scrape-istanbul-modern.mjs --full    # all in-scope, resumable → istanbul-modern-collection.json

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { autocropToWebp } from './lib/autocrop.mjs';

const require = createRequire(import.meta.url);
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const sharp = require('sharp');
const REPO = path.resolve(fileURLToPath(import.meta.url), '../..');
require('dotenv').config({ path: path.join(REPO, '.env.local') });

const SLUG = 'istanbul-modern';
const COLLECTION_STEM = `${SLUG}-collection`;
const BASE = 'https://www.istanbulmodern.org';
const UA = 'armin-museum-research/1.0';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const PROGRESS = path.join(STATE_DIR, `${SLUG}-progress.json`);
const FAILED = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);

// CategoryId 4 = Istanbul Museum of Modern Art Collection, 3 = Photography Collection
const CATEGORIES = [
  { id: 4, page: '/en/collection/istanbul-museum-of-modern-art-collection' },
  { id: 3, page: '/en/collection/photography-collection' },
];

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : 'probe';
const PROBE_TARGET = 20;

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const decodeEntities = (s) => (s || '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#8217;|&rsquo;/g, '’')
  .replace(/&#8216;|&lsquo;/g, '‘').replace(/&#8211;|&ndash;/g, '–').replace(/&#8212;|&mdash;/g, '—')
  .replace(/&hellip;/g, '…').replace(/&nbsp;/g, ' ')
  .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).trim();
const stripTags = (s) => decodeEntities((s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// ---------- HTTP with retries ----------
async function get(url, { asBuffer = false, headers = {} } = {}) {
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, ...headers } });
      if (!r.ok) throw new Error(`HTTP ${r.status} @ ${url}`);
      return asBuffer ? Buffer.from(await r.arrayBuffer()) : await r.text();
    } catch (e) { if (att === 3) throw e; await sleep(800 * att); }
  }
}

// ---------- anti-forgery session (cookie + token from the listing page) ----------
async function openSession(landingPath) {
  const r = await fetch(BASE + landingPath, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`session HTTP ${r.status}`);
  const cookies = (r.headers.getSetCookie ? r.headers.getSetCookie() : [])
    .map((c) => c.split(';')[0]).join('; ');
  const html = await r.text();
  const m = html.match(/name="__RequestVerificationToken" type="hidden" value="([^"]+)"/);
  if (!m) throw new Error('no anti-forgery token on listing page');
  return { cookies, token: m[1] };
}

// ---------- enumerate listing via /en/filtercollection ----------
async function enumerateCategory(cat, session, maxPages = Infinity) {
  const items = []; // { href, listArtist, listTitle }
  let pageNo = 1;
  for (;;) {
    const body = new URLSearchParams();
    body.set('CategoryId', String(cat.id));
    body.set('Keyword', '');
    body.set('PageNo', String(pageNo));
    body.set('__RequestVerificationToken', session.token);
    let d;
    for (let att = 1; att <= 3; att++) {
      try {
        const r = await fetch(`${BASE}/en/filtercollection`, {
          method: 'POST',
          headers: {
            'User-Agent': UA,
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'Cookie': session.cookies,
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': BASE + cat.page,
          },
          body: body.toString(),
        });
        if (!r.ok) throw new Error(`filtercollection HTTP ${r.status}`);
        d = await r.json();
        break;
      } catch (e) { if (att === 3) throw e; await sleep(1000 * att); }
    }
    if (!d.result) throw new Error(`filtercollection result=false (cat ${cat.id} page ${pageNo})`);
    const blocks = d.list.match(/<a href="[^"]+"[\s\S]*?<\/a>/g) || [];
    for (const b of blocks) {
      const href = (b.match(/<a href="([^"]+)"/) || [])[1];
      if (!href) continue;
      const cap = b.match(/<div class="i_item_title">\s*<div><strong>([\s\S]*?)<\/strong><\/div>\s*<div>([\s\S]*?)<\/div>/);
      items.push({ href, listArtist: cap ? stripTags(cap[1]) : '', listTitle: cap ? stripTags(cap[2]) : '' });
    }
    console.log(`  [enum] cat ${cat.id} page ${pageNo}: +${blocks.length} (total ${items.length}/${d.totalItems})`);
    if (!d.hasNextPage || blocks.length === 0 || pageNo >= maxPages) return { items, totalItems: d.totalItems };
    pageNo = d.nextPage || pageNo + 1;
    await sleep(350);
  }
}

// ---------- detail parsing ----------
const CAT_MAP = { 'painting': 'painting', 'photography': 'photograph' };
const PRINT_RX = /litho|serigraph|silkscreen|silk-?screen|screen ?print|etch|engrav|aquatint|woodcut|wood ?block|linocut|monoprint|monotype|offset|gravure|drypoint|intaglio|\bprint\b/i;

function classify(mediumType, technique) {
  const t = (mediumType || '').toLowerCase().trim();
  if (t === 'installation' || t === 'sculpture') return null; // out of scope (3D)
  if (CAT_MAP[t]) return CAT_MAP[t];
  if (t === 'video' || t === 'film / video' || t === 'film/video') return 'video';
  if (t === 'work on paper') return PRINT_RX.test(technique || '') ? 'print' : 'drawing';
  return undefined; // unknown taxonomy value — decide by technique as a fallback
}

function parseDetail(html, enUrl) {
  const h1 = stripTags((html.match(/<h1>([\s\S]*?)<\/h1>/) || [])[1] || '');
  const h2 = stripTags((html.match(/<h2>([\s\S]*?)<\/h2>/) || [])[1] || '');
  const field = (label) => {
    const m = html.match(new RegExp(`<strong>${label}<\\/strong>\\s*<p>([\\s\\S]*?)<\\/p>`, 'i'));
    return m ? stripTags(m[1]) : '';
  };
  const mediumType = field('Medium');
  const technique = field('Technique');
  const dimensions = field('Dimensions');

  // artist: strip trailing lifedates (", 1980" / ", 1923-1997" / ", b. 1948")
  let artist = h1, lifedates = '';
  const lm = h1.match(/,\s*((?:b\.\s*)?\d{4}(?:\s*[–-]\s*\d{4})?)\s*$/);
  if (lm) { lifedates = lm[1]; artist = h1.slice(0, lm.index).trim(); }

  // title + date: split h2 at the LAST comma whose remainder is year-ish
  let title = h2, dateStr = '', year = null;
  const tm = h2.match(/^(.*),\s*((?:c\.\s*)?\d{4}(?:\s*[–-]\s*\d{2,4})?)\s*$/s);
  if (tm) { title = tm[1].trim(); dateStr = tm[2].trim(); }
  else { const ym = h2.match(/(\d{4})\s*$/); if (ym) { dateStr = ym[1]; title = h2.replace(/[,\s]*\d{4}\s*$/, '').trim(); } }
  const ymatch = dateStr.match(/\d{4}/);
  if (ymatch) { const y = parseInt(ymatch[0], 10); if (y >= 1800 && y <= 2035) year = y; }

  // description: paragraphs in the main column (after collection_desc, before info column)
  let description = '';
  const dm = html.match(/<div class="collection_desc">[\s\S]*?<\/div>([\s\S]*?)<div class="col-12 col-md-3/);
  if (dm) {
    const paras = (dm[1].match(/<p>[\s\S]*?<\/p>/g) || []).map(stripTags).filter(Boolean);
    description = paras.join('\n\n').trim();
  }

  // image: bigsize <img>, fallback og:image
  let img = (html.match(/src="(\/contents\/piclib\/bigsize\/[^"]+)"/) || [])[1] || null;
  if (!img) {
    const og = (html.match(/property="og:image" content="([^"]+)"/) || [])[1];
    if (og && og.includes('/contents/piclib/')) img = og.replace(BASE, '');
  }

  // breadcrumb fund/collection (2nd crumb), e.g. "Women Artists Fund"
  const crumbs = [...html.matchAll(/<li class="breadcrumb-item">\s*<a[^>]*>([\s\S]*?)<\/a>/g)].map((m) => stripTags(m[1]));
  const fund = crumbs.length > 1 ? crumbs[1] : '';

  return { artist, lifedates, title, dateStr, year, mediumType, technique, dimensions, description, img: img ? BASE + img : null, fund, enUrl };
}

// EN slug from the EN url
const enSlugOf = (enUrl) => enUrl.replace(/\/+$/, '').split('/').pop();

// resolve listing href (usually TR /koleksiyon/...) to the EN detail page html
async function fetchEnDetail(href) {
  const abs = href.startsWith('http') ? href : BASE + href;
  if (/\/en\/collection\//.test(abs)) return { enUrl: abs, html: await get(abs) };
  const trHtml = await get(abs);
  const alt = (trHtml.match(/<link rel="alternate" href="([^"]+)" hreflang="en"/) || [])[1];
  if (!alt) throw new Error(`no EN alternate for ${href}`);
  await sleep(150);
  return { enUrl: alt, html: await get(alt) };
}

// ---------- image: colorfulness (Hasler-Süsstrunk, from audit/curate-grayscale-prints.mjs) ----------
async function colorfulness(buf) {
  const { data } = await sharp(buf, { limitInputPixels: false }).resize(80, 80, { fit: 'inside' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const rg = [], yb = [];
  for (let i = 0; i < data.length; i += 3) { const R = data[i], G = data[i + 1], B = data[i + 2]; rg.push(R - G); yb.push(0.5 * (R + G) - B); }
  const m = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const sd = (a) => { const mu = m(a); return Math.sqrt(m(a.map((v) => (v - mu) ** 2))); };
  return Math.sqrt(sd(rg) ** 2 + sd(yb) ** 2) + 0.3 * Math.sqrt(m(rg) ** 2 + m(yb) ** 2);
}

async function uploadR2(key, buffer) {
  for (let att = 1; att <= 4; att++) {
    try {
      await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buffer, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000' }));
      return;
    } catch (e) { if (att === 4) throw e; await sleep(500 * att); }
  }
}

// ---------- per-item pipeline ----------
async function processItem(item) {
  const { enUrl, html } = await fetchEnDetail(item.href);
  const d = parseDetail(html, enUrl);
  const category = classify(d.mediumType, d.technique);
  if (category === null) return { status: 'skip-3d', mediumType: d.mediumType };
  let cat = category;
  if (cat === undefined) {
    // unknown Medium value — fall back to technique keywords; conservative skip otherwise
    if (/oil|acrylic|tempera|watercolou?r|gouache|canvas|linen/i.test(d.technique)) cat = 'painting';
    else if (/photograph|c-print|chromogenic|gelatin|diasec|lambda|inkjet|pigment print/i.test(d.technique)) cat = 'photograph';
    else if (/video|film|single channel|projection/i.test(d.technique + ' ' + d.mediumType)) cat = 'video';
    else if (PRINT_RX.test(d.technique)) cat = 'print';
    else return { status: 'skip-unknown', mediumType: d.mediumType, technique: d.technique };
  }
  if (!d.title || !d.artist || d.year == null) return { status: 'drop-min4', enUrl, missing: { title: !d.title, artist: !d.artist, year: d.year == null } };
  if (!d.img) return { status: 'no-image', enUrl };

  const buf = await get(d.img, { asBuffer: true });
  if (buf.length < 5000) return { status: 'tiny-file', enUrl };
  const meta = await sharp(buf).metadata().catch(() => ({}));
  const longSide = Math.max(meta.width || 0, meta.height || 0);
  if (longSide < 400) return { status: 'small-image', enUrl, size: `${meta.width}x${meta.height}` };
  if (cat === 'print') {
    const c = await colorfulness(buf);
    if (c >= 0 && c < 20) return { status: 'grayscale-print', enUrl, colorfulness: Math.round(c * 10) / 10 };
  }

  const id = `${SLUG}-${enSlugOf(enUrl)}`;
  const hash8 = sha(d.img).slice(0, 8);
  const key = `artworks/${COLLECTION_STEM}/${id}-${hash8}-imageUrl.webp`;
  const { buffer } = await autocropToWebp(buf); // default: pure webp convert (no trim)
  await uploadR2(key, buffer);

  return {
    status: 'ok',
    artwork: {
      id,
      objectNumber: '',
      title: d.title,
      artist: d.artist,
      date: d.dateStr || String(d.year),
      year: d.year,
      medium: d.technique,
      dimensions: d.dimensions,
      category: cat,
      description: d.description,
      imageUrl: `${R2_PUBLIC}/${key}`,
      thumbnailUrl: d.img.replace('/piclib/bigsize/', '/piclib/'),
      onDisplay: false,
      displayLocation: '',
      sourceUrl: enUrl,
      metadata: {
        museum_medium: d.mediumType,
        ...(d.lifedates ? { artist_lifedates: d.lifedates } : {}),
        ...(d.fund ? { fund: d.fund } : {}),
        src_size: `${meta.width}x${meta.height}`,
      },
      original_imageUrl: d.img,
    },
  };
}

// ---------- progress (resume) ----------
function loadProgress() {
  if (MODE === 'full' && fs.existsSync(PROGRESS)) return JSON.parse(fs.readFileSync(PROGRESS, 'utf8'));
  return { done: {}, artworks: {} };
}
let saveTick = 0;
function saveProgress(p, force = false) {
  if (MODE !== 'full') return; // probe must not clobber the full-run resume state
  if (!force && ++saveTick % 10 !== 0) return;
  fs.writeFileSync(PROGRESS, JSON.stringify(p));
}

function writeCollection(artworks, stem) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'Istanbul Modern',
    collection: 'Collection',
    website: 'https://www.istanbulmodern.org/en/collection',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'html',
    category_breakdown: cats,
    artworks,
  };
  const out = path.join(REPO, 'public/data', `${stem}.json`);
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
  console.log(`[write] ${out} (${artworks.length} works) breakdown=`, cats);
}

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  console.log(`[${MODE}] opening session…`);
  const session = await openSession(CATEGORIES[0].page);

  // enumerate (probe: first page of each category is plenty for 20 works)
  const seen = new Set();
  const queue = [];
  for (const cat of CATEGORIES) {
    const { items, totalItems } = await enumerateCategory(cat, session, MODE === 'probe' ? 1 : Infinity);
    console.log(`[enum] cat ${cat.id}: ${items.length} listed (site total ${totalItems})`);
    for (const it of items) if (!seen.has(it.href)) { seen.add(it.href); queue.push(it); }
    await sleep(350);
  }
  console.log(`[${MODE}] queue: ${queue.length} unique items`);

  const progress = loadProgress();
  const stats = {};
  let processed = 0, okCount = Object.keys(progress.artworks).length;

  const CONC = 3;
  let idx = 0, stop = false;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (idx < queue.length && !stop) {
      const item = queue[idx++];
      if (progress.done[item.href]) { stats[progress.done[item.href]] = (stats[progress.done[item.href]] || 0) + 1; continue; }
      try {
        const res = await processItem(item);
        progress.done[item.href] = res.status;
        stats[res.status] = (stats[res.status] || 0) + 1;
        if (res.status === 'ok') {
          progress.artworks[res.artwork.id] = res.artwork;
          okCount = Object.keys(progress.artworks).length;
          if (MODE === 'probe' && okCount >= PROBE_TARGET) stop = true;
        } else if (res.status !== 'skip-3d') {
          console.log(`  [${res.status}] ${item.href}${res.size ? ' ' + res.size : ''}${res.colorfulness != null ? ' c=' + res.colorfulness : ''}`);
        }
        saveProgress(progress);
      } catch (e) {
        stats.error = (stats.error || 0) + 1;
        fs.appendFileSync(FAILED, JSON.stringify({ href: item.href, err: String(e.message || e), at: new Date().toISOString() }) + '\n');
        console.log(`  [error] ${item.href}: ${e.message}`);
      }
      if (++processed % 25 === 0) console.log(`  …${processed} processed (ok ${okCount})`, JSON.stringify(stats));
      await sleep(250);
    }
  }));
  saveProgress(progress, true);

  const artworks = Object.values(progress.artworks)
    .sort((a, b) => (a.artist + a.title).localeCompare(b.artist + b.title));
  writeCollection(artworks, MODE === 'probe' ? `${COLLECTION_STEM}-probe` : COLLECTION_STEM);
  console.log(`[${MODE}] DONE. status tally:`, JSON.stringify(stats));
}

main().catch((e) => { console.error(e); process.exit(1); });
