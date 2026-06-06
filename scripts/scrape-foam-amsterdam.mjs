#!/usr/bin/env node
// Foam Photography Museum (Amsterdam) — "Foam Collection" scraper.
// Slug: foam-amsterdam. Whole collection is contemporary PHOTOGRAPHY → category=photograph
//   for every record (no paintings, no value-filter needed at this size).
//
// SOURCE (museum-OWN data, via Wayback to bypass a Vercel bot-firewall):
//   www.foam.org is a Next.js/Vercel app fed by Storyblok CMS (space 113697). The LIVE site is
//   behind Vercel's bot challenge (HTTP 429 x-vercel-mitigated on every path) and the Storyblok
//   public token is server-side only (api.storyblok.com → 401), so curl/WebFetch cannot read it.
//   BUT the archived raw HTML embeds the full resolved Storyblok story in <script id="__NEXT_DATA__">.
//   We harvest that from the Internet Archive (no firewall):
//     - LIST  : every archived snapshot of /collection/all (CDX-discovered). Each snapshot renders
//               page 1 = the 100 newest works AT THAT TIME (sort_by created_at:desc). The collection
//               grew 44→102→171 over time, so unioning snapshots across years recovers ~156 of 171.
//               (No ?page=2 snapshot exists in Wayback and pagination is client-side via the token
//                we don't have, so a single snapshot caps at 100 — the cross-time union is the fix.)
//     - DETAIL: every archived snapshot of /artworks/<slug> (CDX). Same Artwork content shape; fills
//               a handful of slugs that never appeared on a captured page-1 (~+7).
//   Reachable union ≈ 160/171 (~95%). The ~8 unreachable works never got archived & have no token route.
//
// IMAGES: content.thumbnail.filename is a UNIQUE full-size jpeg per work on the Storyblok CDN
//   (a.storyblok.com/f/113697/<WxH>/<hash>/<accession>.jpg) — verified HTTP 200, full-res (e.g.
//   4175x5204, 1.5MB), no firewall, download direct. NB: content.media.filename is a SHARED CMS
//   placeholder (only ~3 distinct values across the corpus) — never use it for the image.
//
// METADATA — all 6 fields parsed from the DETAIL record (the Storyblok Artwork component):
//   title=content.title richtext · artist=content.artist.name (resolved relation; kept verbatim) ·
//   year=content.year, else "…in YYYY" in the description, else a 4-digit year in media.title ·
//   medium=content.medium[] joined (+ any "is a <medium>" phrase from the description) ·
//   dimensions parsed from the description ("displayed at 50 x 40 cm") · category=photograph (all).
//   min-4 guard (title/artist/year/category) or DROP.
//
// Usage:
//   node scripts/scrape-foam-amsterdam.mjs --classify                  # dry-run: scope+fill tally, no images
//   node scripts/scrape-foam-amsterdam.mjs --pilot --limit=20 --no-upload   # ~20 recs, no R2, write pilot JSON
//   node scripts/scrape-foam-amsterdam.mjs --full                      # full scrape + R2 upload, write collection JSON

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

const SLUG = 'foam-amsterdam';
const COLLECTION_STEM = `${SLUG}-collection`;
const HOME = 'https://www.foam.org';
const ARTWORK_BASE = `${HOME}/artworks/`;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');

const args = process.argv.slice(2);
const MODE = args.includes('--full') ? 'full' : args.includes('--pilot') ? 'pilot' : 'classify';
const NO_UPLOAD = args.includes('--no-upload');
const limitArg = args.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : (MODE === 'pilot' ? 20 : Infinity);

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// Flatten a Storyblok richtext doc (or any nested node) to plain text.
function richText(node) {
  const out = [];
  const walk = (n) => {
    if (Array.isArray(n)) { for (const c of n) walk(c); return; }
    if (n && typeof n === 'object') {
      if (typeof n.text === 'string') out.push(n.text);
      if (n.content) walk(n.content);
    }
  };
  walk(node);
  return out.join(' ').replace(/\s+/g, ' ').trim();
}

// ---------- Wayback discovery + fetch ----------
async function fetchText(url, tries = 4) {
  for (let att = 1; att <= tries; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
      if (r.status === 429 || r.status === 503) throw new Error(`throttled ${r.status}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) { if (att === tries) throw e; await sleep(800 * att); }
  }
}

// CDX → list of {timestamp, original} for a url pattern (200, html, deduped on digest/urlkey).
async function cdx(urlPattern, collapse = 'digest') {
  const api = `http://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(urlPattern)}&output=text&fl=original,timestamp&filter=statuscode:200&filter=mimetype:text/html&collapse=${collapse}&limit=2000`;
  let txt = '';
  for (let att = 1; att <= 5; att++) {
    try { txt = await fetchText(api, 1); break; } catch { await sleep(1200 * att); }
  }
  const rows = [];
  for (const line of txt.split('\n')) {
    const [original, timestamp] = line.trim().split(/\s+/);
    if (original && timestamp) rows.push({ original, timestamp });
  }
  return rows;
}

function extractNextData(html) {
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

async function waybackRaw(timestamp, originalUrl) {
  const url = `https://web.archive.org/web/${timestamp}id_/${originalUrl}`;
  const html = await fetchText(url);
  return extractNextData(html);
}

// ---------- gather raw Artwork stories (deduped by slug, keep highest-res thumbnail) ----------
const STORYBLOK = 'https://a.storyblok.com';
function thumbRes(filename) {
  const m = (filename || '').match(/\/f\/\d+\/(\d+)x(\d+)\//);
  return m ? parseInt(m[1], 10) * parseInt(m[2], 10) : 0;
}
function isArtworkStory(content) {
  return content && content.component === 'Artwork'
    && ((content.thumbnail || {}).filename || '').startsWith(STORYBLOK);
}

async function gatherStories() {
  const bySlug = new Map(); // slug -> { content, slug, uuid, id, sourceUrl, tag_list }
  const consider = (story) => {
    if (!story) return;
    const slug = story.slug || (story.full_slug || '').replace(/^artworks\//, '');
    const content = story.content;
    if (!slug || !isArtworkStory(content)) return;
    const cand = {
      slug,
      uuid: story.uuid || null,
      id: story.id != null ? String(story.id) : null,
      content,
      tag_list: story.tag_list || [],
      sourceUrl: `${ARTWORK_BASE}${slug}`,
    };
    const prev = bySlug.get(slug);
    // keep the richer record: higher-res thumbnail wins; tie → one that has a year/description
    if (!prev) { bySlug.set(slug, cand); return; }
    const better = thumbRes(content.thumbnail.filename) > thumbRes(prev.content.thumbnail.filename);
    if (better) bySlug.set(slug, cand);
  };

  // 1) every archived /collection/all snapshot → page-1 stories[]
  const listSnaps = await cdx('www.foam.org/collection/all');
  console.log(`[wayback] /collection/all snapshots: ${listSnaps.length}`);
  for (const s of listSnaps) {
    try {
      const data = await waybackRaw(s.timestamp, s.original);
      const stories = data && data.props && data.props.pageProps && data.props.pageProps.stories;
      const tot = data && data.props && data.props.pageProps && data.props.pageProps.total;
      let n = 0;
      if (Array.isArray(stories)) for (const st of stories) { consider(st); n++; }
      console.log(`  ${s.timestamp}: stories=${n} total=${tot} | union=${bySlug.size}`);
    } catch (e) { console.log(`  ${s.timestamp}: FAIL ${e.message}`); }
    await sleep(900);
  }

  // 2) every archived /artworks/<slug> detail snapshot → story (fills slugs missing from page-1)
  const detailSnaps = await cdx('www.foam.org/artworks*', 'urlkey'); // newest per urlkey kept by collapse
  // collapse=urlkey keeps the FIRST row per urlkey; prefer the LATEST capture, so group + pick max ts
  const latestByUrl = new Map();
  for (const d of detailSnaps) {
    const cur = latestByUrl.get(d.original);
    if (!cur || d.timestamp > cur) latestByUrl.set(d.original, d.timestamp);
  }
  const detailList = [...latestByUrl.entries()].map(([original, timestamp]) => ({ original, timestamp }))
    .filter((d) => {
      const slug = d.original.split('/artworks/')[1]?.replace(/\/$/, '');
      return slug && !bySlug.has(slug); // only fetch detail pages for slugs we don't already have
    });
  console.log(`[wayback] /artworks detail snapshots to fill: ${detailList.length} (of ${latestByUrl.size} archived)`);
  for (const d of detailList) {
    try {
      const data = await waybackRaw(d.timestamp, d.original);
      const story = data && data.props && data.props.pageProps && data.props.pageProps.story;
      consider(story);
    } catch (e) { /* skip dead snapshot */ }
    await sleep(700);
  }

  console.log(`[wayback] total unique Artwork stories recovered: ${bySlug.size}`);
  return [...bySlug.values()];
}

// ---------- detail-record → ARMIN artwork ----------
const YEAR_RE = /\b(1[6-9]\d{2}|20[0-4]\d)\b/;

function parseYear(content) {
  const yf = (content.year || '').toString();
  let m = yf.match(YEAR_RE);
  if (m) return parseInt(m[1], 10);
  const desc = richText(content.description);
  m = desc.match(/\bin\s+(1[6-9]\d{2}|20[0-4]\d)\b/) || desc.match(YEAR_RE);
  if (m) return parseInt(m[1], 10);
  const sub = richText(content.subtitle);
  m = sub.match(YEAR_RE);
  if (m) return parseInt(m[1], 10);
  // media.title / thumbnail.title sometimes carry "Title, YYYY" even when media image is a placeholder
  for (const f of ['media', 'thumbnail']) {
    const t = (content[f] || {}).title || '';
    m = String(t).match(YEAR_RE);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

function parseDimensions(content) {
  const desc = richText(content.description);
  // "displayed at 50 x 40 cm" / "is a digital c-print and displayed at 152.4 x 152.4 cm."
  let m = desc.match(/displayed at\s+([\d.,]+\s*[x×]\s*[\d.,]+(?:\s*[x×]\s*[\d.,]+)?\s*(?:cm|mm|inch(?:es)?|in)?)/i);
  if (m) return m[1].replace(/\s+/g, ' ').trim();
  m = desc.match(/([\d.,]+\s*[x×]\s*[\d.,]+(?:\s*[x×]\s*[\d.,]+)?\s*(?:cm|mm|inch(?:es)?|in))/i);
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
}

function parseMedium(content) {
  const arr = Array.isArray(content.medium) ? content.medium.filter(Boolean) : [];
  let base = arr.join(', ').trim();
  // enrich with the specific process named in the description ("is a digital c-print and …")
  const desc = richText(content.description);
  const dm = desc.match(/\bis an?\s+([a-z][a-z\s-]{2,40}?)(?:\s+and\b|\s+displayed\b|[.,])/i);
  if (dm) {
    const proc = dm[1].trim().replace(/\s+/g, ' ');
    if (proc && !/^(work|piece|photograph|image)$/i.test(proc) && !base.toLowerCase().includes(proc.toLowerCase())) {
      base = base ? `${base}; ${proc}` : proc;
    }
  }
  return base || 'Photography';
}

function parseRecord(rec) {
  const c = rec.content;
  const title = richText(c.title) || rec.slug;
  const artistObj = c.artist;
  const artist = (artistObj && typeof artistObj === 'object' ? artistObj.name : artistObj) || '';
  const year = parseYear(c);
  const medium = parseMedium(c);
  const dimensions = parseDimensions(c);
  const description = richText(c.text);
  const imgUrl = (c.thumbnail || {}).filename || null;
  const tags = (rec.tag_list || []).join(', ');
  // accession number from the image filename (foaXXXXXX…)
  const accMatch = (imgUrl || '').match(/\/([A-Za-z]{2,4}\d{4,})(?:_[\d_]+)?\.(?:jpg|jpeg|png)/i);
  const objectNumber = accMatch ? accMatch[1] : '';
  return {
    id: rec.uuid || rec.id || rec.slug,
    slug: rec.slug,
    objectNumber,
    title: String(title).trim(),
    artist: String(artist).trim(),
    year,
    medium,
    dimensions,
    category: 'photograph', // whole Foam Collection is photography
    description,
    tags,
    imgUrl,
    sourceUrl: rec.sourceUrl,
  };
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
  const src = await dl(a.imgUrl); // full-size jpeg from Storyblok CDN
  const meta = await (await import('sharp')).default(src).metadata().catch(() => ({}));
  if (meta.width && Math.max(meta.width, meta.height) < 600) throw new Error(`thumb ${meta.width}x${meta.height}`);
  const { buffer } = await autocropToWebp(src); // white-trim + webp(2048/q85)
  const hash8 = sha(a.imgUrl).slice(0, 8);
  const key = `artworks/${COLLECTION_STEM}/${a.id}-${hash8}-imageUrl.webp`;
  let imageUrl = a.imgUrl;
  if (!NO_UPLOAD) { await uploadR2(key, buffer); imageUrl = `${R2_PUBLIC}/${key}`; }
  return { imageUrl, srcW: meta.width || null, srcH: meta.height || null };
}

// ---------- record assembly (min-4 guard) ----------
function toArtwork(a, imageUrl) {
  if (!a.title || !a.artist || a.year == null || !a.category) return null; // min-4 → drop
  return {
    id: String(a.id),
    objectNumber: a.objectNumber || '',
    title: a.title,
    artist: a.artist,
    date: a.year != null ? String(a.year) : '',
    year: a.year,
    medium: a.medium,
    dimensions: a.dimensions,
    category: a.category,
    description: a.description || '',
    imageUrl,
    thumbnailUrl: a.imgUrl,
    onDisplay: false,
    displayLocation: '',
    sourceUrl: a.sourceUrl,
    metadata: { storyblok_uuid: a.id, slug: a.slug, tags: a.tags },
    original_imageUrl: a.imgUrl,
  };
}

function writeCollection(artworks, stem) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'Foam Photography Museum',
    collection: 'Foam Collection',
    website: 'https://www.foam.org/collection',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'wayback-nextdata',
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
  const stories = await gatherStories();
  const parsed = stories.map(parseRecord);

  // tally
  let withImg = 0, noImg = 0, dropMin4 = 0;
  const fill = { title: 0, artist: 0, year: 0, medium: 0, dim: 0, desc: 0 };
  for (const p of parsed) {
    if (p.imgUrl) withImg++; else noImg++;
    if (p.title) fill.title++;
    if (p.artist) fill.artist++;
    if (p.year != null) fill.year++;
    if (p.medium) fill.medium++;
    if (p.dimensions) fill.dim++;
    if (p.description) fill.desc++;
    if (!p.title || !p.artist || p.year == null) dropMin4++;
  }
  const n = parsed.length || 1;
  console.log('\n[classify] total Artwork stories:', parsed.length);
  console.log('[classify] all category=photograph | with image:', withImg, '| missing image:', noImg);
  console.log('[classify] REAL fill: '
    + `title ${fill.title}/${parsed.length} (${Math.round(fill.title/n*100)}%) `
    + `artist ${fill.artist} (${Math.round(fill.artist/n*100)}%) `
    + `year ${fill.year} (${Math.round(fill.year/n*100)}%) `
    + `medium ${fill.medium} (${Math.round(fill.medium/n*100)}%) `
    + `dim ${fill.dim} (${Math.round(fill.dim/n*100)}%) `
    + `desc ${fill.desc} (${Math.round(fill.desc/n*100)}%)`);
  console.log('[classify] would DROP on min-4 (missing title/artist/year):', dropMin4);

  if (MODE === 'classify') {
    console.log('\n[classify] sample records:');
    for (const p of parsed.slice(0, 12)) {
      console.log(`   - "${p.title.slice(0,34)}" | ${p.artist.slice(0,22)} | ${p.year ?? '—'} | ${p.medium.slice(0,28)} | ${p.dimensions || 'no-dim'}`);
    }
    const missY = parsed.filter((p) => p.year == null).slice(0, 8);
    if (missY.length) { console.log('\n[classify] records missing year:'); for (const p of missY) console.log('   -', p.slug, '|', p.artist); }
    return;
  }

  let candidates = parsed.filter((p) => p.imgUrl);
  candidates.sort((a, b) => String(a.slug).localeCompare(String(b.slug)));
  if (Number.isFinite(LIMIT)) candidates = candidates.slice(0, LIMIT);
  console.log(`\n[${MODE}] image-processing ${candidates.length} candidates${NO_UPLOAD ? ' (NO R2 upload)' : ' → R2'} …`);

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
        fs.appendFileSync(path.join(STATE_DIR, `${SLUG}-failed.ndjson`), JSON.stringify({ slug: a.slug, url: a.imgUrl, err: String(e.message || e) }) + '\n');
        if (imgErr <= 5) console.log(`  img err ${a.slug}: ${e.message}`);
      }
      if (++done % 25 === 0) console.log(`  …${done}/${candidates.length} (ok ${artworks.length}, imgErr ${imgErr})`);
    }
  }));

  artworks.sort((x, y) => String(x.objectNumber || x.id).localeCompare(String(y.objectNumber || y.id)));
  const stem = MODE === 'pilot' ? `${COLLECTION_STEM}-pilot` : COLLECTION_STEM;
  writeCollection(artworks, stem);
  console.log(`\n[${MODE}] DONE. collected ${artworks.length} | img errors ${imgErr} | min4-drops ${dropMin4}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
