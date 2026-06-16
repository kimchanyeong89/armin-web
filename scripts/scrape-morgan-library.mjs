#!/usr/bin/env node
// The Morgan Library & Museum (New York) — collection scraper.
// Source: museum's OWN Drupal site, sitemap-driven HTML parsing (no API/JSON:API exposed).
//   Index : https://www.themorgan.org/sitemap.xml?page=1..9
//           → 14,782 /drawings/item/{nid} (Drawings Online — world-class master drawings)
//           →    525 /objects/item/{nid}  (mixed; mostly 3D — flat works only are kept)
//   Detail: Drupal field--name-field-* blocks (creator, object-title, display-date,
//           medium, dimensions, accession-number, classification, century-drawings, …)
//   Image : drawings → https://host.themorgan.org/drawings/download/{f}.jpg (~2500px,
//           fallback /drawings/large/ ~650px); objects → /sites/default/files/objects/{f}.jpg
//
// SCOPE: flat works only. /drawings/item default category=drawing (classification/medium
//   refine to print/painting). /objects/item kept ONLY when classification/medium positively
//   flat (painting/drawing/print/photograph/manuscript leaf) — "Object" (e.g. Stavelot
//   Triptych metalwork) is skipped. classification "miniature" skipped (portrait miniatures).
//   Monochrome gate: category=print AND colorfulness<20 → skip. Drawings NEVER colour-gated.
//
// Usage:
//   node scripts/scrape-morgan-library.mjs --probe   # ~15 works end-to-end (real R2 uploads)
//   node scripts/scrape-morgan-library.mjs --full    # everything, resumable
// State:
//   scripts/.state/morgan-library-progress.json  (NDJSON lines {nid,status,artwork|reason})
//   scripts/.state/morgan-library-failed.ndjson  (transient failures — retried on next run)

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

const SLUG = 'morgan-library';
const COLLECTION_STEM = `${SLUG}-collection`;
const BASE = 'https://www.themorgan.org';
const UA = 'armin-museum-research/1.0 (art directory; contact via site)';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const PROGRESS = path.join(STATE_DIR, `${SLUG}-progress.json`);   // NDJSON lines
const FAILED = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);

const MODE = process.argv.includes('--full') ? 'full' : 'probe';
const PROBE_TARGET = 15;
const CONC = 3;
const DELAY_MS = 320; // per worker per request → ~3-4 rps aggregate

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ---------- polite fetch ----------
async function get(url, asBuffer = false) {
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
      await sleep(DELAY_MS);
      if (r.status === 404) return { notFound: true };
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return { body: asBuffer ? Buffer.from(await r.arrayBuffer()) : await r.text() };
    } catch (e) {
      if (att === 3) throw e;
      await sleep(800 * att);
    }
  }
}

// ---------- sitemap enumeration ----------
async function enumerateItems() {
  const items = [];
  const seen = new Set();
  for (let p = 1; p <= 9; p++) {
    const { body } = await get(`${BASE}/sitemap.xml?page=${p}`);
    for (const m of body.matchAll(/themorgan\.org\/(drawings|objects)\/item\/(\d+)/g)) {
      const key = `${m[1]}/${m[2]}`;
      if (!seen.has(key)) { seen.add(key); items.push({ kind: m[1], nid: m[2] }); }
    }
  }
  return items;
}

// ---------- HTML field extraction ----------
const strip = (h) => (h || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/\s+/g, ' ').trim();

// label-hidden fields: value sits in the same div ("… field--label-hidden field--item">VALUE</div>)
function hiddenField(src, name) {
  const m = src.match(new RegExp(`<div class="field field--name-field-${name}[^"]*field--item">([\\s\\S]*?)</div>`));
  return m ? strip(m[1]) : '';
}
// label-inline / label-above fields: <div field--label>Label</div><div field--item>VALUE</div>
function labeledField(src, name) {
  const m = src.match(new RegExp(`field--name-field-${name}[^"]*field--label-(?:inline|above)">[\\s\\S]*?<div class="field--item">([\\s\\S]*?)</div>`));
  return m ? strip(m[1]) : '';
}

function parseYear(displayDate, century) {
  const m = (displayDate || '').match(/\d{4}/);
  if (m) return parseInt(m[0], 10);
  const c = (century || '').match(/(\d{1,2})(?:st|nd|rd|th)\s+century/i);
  if (c) return (parseInt(c[1], 10) - 1) * 100 + 1; // earliest estimate per guide
  return null;
}

// ---------- scope / category ----------
function classifyDrawingsItem(classification, medium) {
  const cls = classification.toLowerCase();
  const med = medium.toLowerCase();
  if (cls.includes('miniature')) return null;            // portrait miniatures excluded
  if (cls.includes('print') || /\b(etching|engraving|lithograph|woodcut|aquatint|mezzotint)\b/.test(cls)) return 'print';
  if (cls.includes('photograph')) return 'photograph';
  if (cls.includes('painting') || /\boil on (canvas|panel|board)\b/.test(med)) return 'painting';
  return 'drawing';                                       // Drawings Online default
}
function classifyObjectsItem(classification, medium) {
  const t = `${classification} ${medium}`.toLowerCase();
  if (/miniature/.test(classification.toLowerCase())) return null;
  if (/\bpainting\b/.test(t) || /\boil on (canvas|panel|board)\b/.test(t)) return 'painting';
  if (/\bdrawing|watercolor|pastel\b/.test(t)) return 'drawing';
  if (/\bprint|etching|engraving|lithograph|woodcut\b/.test(t)) return 'print';
  if (/\bphotograph\b/.test(t)) return 'photograph';
  if (/manuscript|illuminat|single leaf|cutting|leaf from/.test(t)) return 'manuscript';
  return null;                                            // "Object" / metalwork / 3D → out
}

// ---------- image URL discovery ----------
function findImageUrls(src, kind) {
  if (kind === 'drawings') {
    const m = src.match(/https?:\/\/host\.themorgan\.org\/drawings\/large\/([^"']+\.jpg)/i);
    if (!m) return null;
    return {
      full: `https://host.themorgan.org/drawings/download/${m[1]}`,
      fallback: m[0],
      thumb: m[0],
    };
  }
  // objects: prefer the explicit download link, else derive original from the styles path
  const dl = src.match(/href="(\/sites\/default\/files\/objects\/[^"]+\.jpe?g)"[^>]*download/i)
    || src.match(/<div class="field field--name-field-download[^>]*>[\s\S]*?href="([^"]+\.jpe?g)"/i);
  const style = src.match(/src="(\/sites\/default\/files\/styles\/[^"]+\/public\/objects\/[^"?]+\.jpe?g)[^"]*"/i);
  const full = dl ? new URL(dl[1], BASE).href
    : style ? new URL(style[1].replace(/\/styles\/[^/]+\/public\//, '/'), BASE).href : null;
  if (!full) return null;
  return { full, fallback: style ? new URL(style[1], BASE).href : full, thumb: style ? new URL(style[1], BASE).href : full };
}

// ---------- colorfulness (Hasler-Süsstrunk; copied from audit/curate-grayscale-prints.mjs) ----------
async function colorfulness(buf) {
  const { data } = await sharp(buf, { limitInputPixels: false }).resize(80, 80, { fit: 'inside' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const rg = [], yb = [];
  for (let i = 0; i < data.length; i += 3) { const R = data[i], G = data[i + 1], B = data[i + 2]; rg.push(R - G); yb.push(0.5 * (R + G) - B); }
  const m = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const sd = (a) => { const mu = m(a); return Math.sqrt(m(a.map((v) => (v - mu) ** 2))); };
  return Math.sqrt(sd(rg) ** 2 + sd(yb) ** 2) + 0.3 * Math.sqrt(m(rg) ** 2 + m(yb) ** 2);
}

// ---------- per-item pipeline ----------
async function processItem(it) {
  const sourceUrl = `${BASE}/${it.kind}/item/${it.nid}`;
  const page = await get(sourceUrl);
  if (page.notFound) return { status: 'skip', reason: 'page-404' };
  const src = page.body;

  const title = hiddenField(src, 'object-title')
    || strip((src.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || '');
  let artist = hiddenField(src, 'creator') || labeledField(src, 'artist');
  if (!artist) {
    const school = labeledField(src, 'school');
    if (school) artist = `${school} School`;
  }
  const displayDate = hiddenField(src, 'display-date');
  const century = labeledField(src, 'century-drawings');
  const year = parseYear(displayDate, century);
  const medium = hiddenField(src, 'medium');
  const dimensions = hiddenField(src, 'dimensions');
  const accession = hiddenField(src, 'accession-number');
  const creditLine = hiddenField(src, 'credit-line');
  const classification = labeledField(src, 'classification');
  const creatorDate = hiddenField(src, 'creator-date');
  let description = labeledField(src, 'notes');
  if (description.length > 500) description = description.slice(0, 497).trimEnd() + '…';

  const category = it.kind === 'drawings'
    ? classifyDrawingsItem(classification, medium)
    : classifyObjectsItem(classification, medium);
  if (!category) return { status: 'skip', reason: `out-of-scope (${classification || 'no classification'})` };
  if (!title || !artist || year == null) return { status: 'skip', reason: `min-4 (title=${!!title} artist=${!!artist} year=${year})` };

  const urls = findImageUrls(src, it.kind);
  if (!urls) return { status: 'skip', reason: 'no-image' };

  // download full-size, fall back to display size
  let buf = null, usedUrl = urls.full;
  try {
    const r = await get(urls.full, true);
    if (r.notFound) throw new Error('404');
    buf = r.body;
  } catch {
    if (urls.fallback !== urls.full) {
      const r2 = await get(urls.fallback, true);
      if (r2.notFound) return { status: 'skip', reason: 'image-404' };
      buf = r2.body; usedUrl = urls.fallback;
    } else return { status: 'skip', reason: 'image-404' };
  }
  if (buf.length < 5000) return { status: 'skip', reason: `tiny-image ${buf.length}b` };
  const meta = await sharp(buf).metadata().catch(() => ({}));
  if (meta.width && Math.max(meta.width, meta.height) < 600) return { status: 'skip', reason: `lowres ${meta.width}x${meta.height}` };

  if (category === 'print') {
    const c = await colorfulness(buf).catch(() => 99);
    if (c < 20) return { status: 'skip', reason: `grayscale-print c=${c.toFixed(1)}` };
  }

  const { buffer } = await autocropToWebp(buf); // webp(2048/q85), no trim (default)
  const id = `${SLUG}-${it.nid}`;
  const hash8 = sha(usedUrl).slice(0, 8);
  const key = `artworks/${COLLECTION_STEM}/${id}-${hash8}-imageUrl.webp`;
  for (let att = 1; att <= 4; att++) {
    try {
      await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buffer, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000' }));
      break;
    } catch (e) { if (att === 4) throw e; await sleep(500 * att); }
  }

  return {
    status: 'ok',
    artwork: {
      id,
      objectNumber: accession,
      title,
      artist,
      date: displayDate || century || String(year),
      year,
      medium,
      dimensions,
      category,
      description,
      imageUrl: `${R2_PUBLIC}/${key}`,
      thumbnailUrl: urls.thumb,
      onDisplay: false,
      displayLocation: '',
      sourceUrl,
      metadata: {
        node_id: it.nid, source_section: it.kind, classification,
        creator_date: creatorDate, credit_line: creditLine,
        src_width: meta.width || null, src_height: meta.height || null,
      },
      original_imageUrl: usedUrl,
    },
  };
}

// ---------- progress (NDJSON lines in the .json state file) ----------
function loadProgress() {
  const done = new Map();
  if (fs.existsSync(PROGRESS)) {
    for (const line of fs.readFileSync(PROGRESS, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try { const r = JSON.parse(line); done.set(`${r.kind}/${r.nid}`, r); } catch { /* tolerate cut line */ }
    }
  }
  return done;
}

function writeCollection(artworks, stem) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'The Morgan Library & Museum',
    collection: 'Drawings and Prints',
    website: 'https://www.themorgan.org/collection',
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
  console.log(`[${MODE}] enumerating sitemap …`);
  let items = await enumerateItems();
  const nDraw = items.filter((i) => i.kind === 'drawings').length;
  console.log(`[${MODE}] sitemap items: ${items.length} (drawings ${nDraw}, objects ${items.length - nDraw})`);

  if (MODE === 'probe') {
    // exercise both parsers: a window of drawings + a few objects
    items = [...items.filter((i) => i.kind === 'drawings').slice(0, 30),
             ...items.filter((i) => i.kind === 'objects').slice(0, 5)];
  }

  const done = loadProgress();
  const todo = items.filter((i) => !done.has(`${i.kind}/${i.nid}`));
  console.log(`[${MODE}] already done ${items.length - todo.length}, todo ${todo.length}`);

  let okCount = [...done.values()].filter((r) => r.status === 'ok').length;
  let processed = 0, failed = 0;
  let idx = 0;
  const probeStop = () => MODE === 'probe' && okCount >= PROBE_TARGET;

  await Promise.all(Array.from({ length: CONC }, async () => {
    while (idx < todo.length && !probeStop()) {
      const it = todo[idx++];
      try {
        const res = await processItem(it);
        fs.appendFileSync(PROGRESS, JSON.stringify({ kind: it.kind, nid: it.nid, ...res }) + '\n');
        if (res.status === 'ok') okCount++;
        else if (MODE === 'probe') console.log(`  [skip] ${it.kind}/${it.nid}: ${res.reason}`);
      } catch (e) {
        failed++;
        fs.appendFileSync(FAILED, JSON.stringify({ kind: it.kind, nid: it.nid, err: String(e.message || e), at: new Date().toISOString() }) + '\n');
        if (failed <= 10) console.log(`  [fail] ${it.kind}/${it.nid}: ${e.message}`);
      }
      if (++processed % 100 === 0) console.log(`  …${processed}/${todo.length} (ok total ${okCount}, failed this run ${failed})`);
    }
  }));

  const all = loadProgress();
  const artworks = [...all.values()].filter((r) => r.status === 'ok').map((r) => r.artwork);
  artworks.sort((a, b) => Number(a.metadata.node_id) - Number(b.metadata.node_id));

  const skips = {};
  for (const r of all.values()) if (r.status === 'skip') skips[r.reason.split(' ')[0]] = (skips[r.reason.split(' ')[0]] || 0) + 1;
  console.log(`\n[${MODE}] ok ${artworks.length} | skips:`, skips, `| failed this run ${failed}`);

  writeCollection(artworks, MODE === 'probe' ? `${COLLECTION_STEM}-probe` : COLLECTION_STEM);
}

main().catch((e) => { console.error(e); process.exit(1); });
