#!/usr/bin/env node
// Jordan National Gallery of Fine Arts (Amman) — collection scraper.
// Source: museum-OWN WordPress site (custom theme `jngfa`), no API for artworks —
//   the /collection/ page inlines the full artist roster (~1,141 artist pages), and each
//   /artist/{slug}/ page inlines every artwork as a fancybox anchor with data attributes:
//     <a id="{slug}" href="{FULL-SIZE IMG}" data-fancybox="artwork"
//        data-caption="{TITLE}" data-artist="{ARTIST}" data-year="{YEAR}" data-content="{MEDIUM}">
//   Full-size images live on the museum CDN (wp-content/uploads, often 2000-2500px).
//   No dimensions anywhere on the site (verified on 30-artist sample) → dimensions = "".
//
// SCOPE: flat works only. Medium strings are short English labels ("Oil on canvas",
//   "Etching 15/15", "Iron", …). 3D (iron/bronze/ceramic/wood/…) excluded.
//   B&W-print policy: category=print with Hasler-Süsstrunk colorfulness < 20 is skipped at
//   download (paintings/drawings/photographs/calligraphy are NEVER gated).
//
// Usage:
//   node scripts/scrape-jngfa-amman.mjs --probe   # ~20 in-scope works end-to-end (R2 upload), probe JSON
//   node scripts/scrape-jngfa-amman.mjs --full    # all artists, resumable, collection JSON

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

const SLUG = 'jngfa-amman';
const COLLECTION_STEM = `${SLUG}-collection`;
const BASE = 'https://nationalgallery.org';
const UA = 'armin-museum-research/1.0';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const PROGRESS = path.join(STATE_DIR, `${SLUG}-progress.json`);
const FAILED = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);

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
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#8217;/g, '’')
  .replace(/&#8216;/g, '‘').replace(/&#8211;/g, '–').replace(/&#8212;/g, '—')
  .replace(/&#8220;/g, '“').replace(/&#8221;/g, '”')
  .replace(/&hellip;/g, '…').replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).trim();
const clean = (s) => decodeEntities(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// ---------- fetch ----------
async function getText(url) {
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) { if (att === 3) throw e; await sleep(800 * att); }
  }
}

// ---------- artist roster (from /collection/) ----------
async function fetchArtistUrls() {
  const html = await getText(`${BASE}/collection/`);
  const urls = [...new Set(html.match(/https:\/\/nationalgallery\.org\/artist\/[a-zA-Z0-9_%.-]+\//g) || [])];
  if (urls.length < 500) throw new Error(`roster too small: ${urls.length} artist links (expected ~1,141)`);
  return urls.sort();
}

// ---------- scope classifier (English medium labels) ----------
// Returns category or null (out of scope / 3D / unknown).
function classify(mediumRaw) {
  const t = (mediumRaw || '').toLowerCase();
  if (!t) return null;
  if (/\bvideo|film\b|moving image|animation/.test(t)) return 'video';
  if (/calligraph/.test(t)) return 'calligraphy';
  // photographs (precise terms BEFORE generic "print")
  if (/photograph|photography|c-print|c print|chromogenic|gelatin silver|silver gelatin|lambda print|archival pigment|polaroid/.test(t)) return 'photograph';
  // prints (multiples; includes giclée editions, "Graphic N/M")
  if (/etching|litho|linoleum|linocut|gicl[eé]e|silkscreen|silk screen|serigraph|screen ?print|woodcut|wood cut|wood engraving|monoprint|monotype|engraving|aquatint|mezzotint|drypoint|photogravure|offset|stencil|graphic|\bprint\b/.test(t)) return 'print';
  // paintings (collect all; "on canvas/wood/board" carriers stay painting)
  if (/\boil\b|acrylic|watercolou?r|aquarelle|tempera|gouache|fresco|enamel on|lacquer on|mixed media on canvas|on canvas/.test(t)) return 'painting';
  // drawings (unique works on paper)
  if (/drawing|pastel|charcoal|pencil|crayon|sanguine|chalk|lavis|felt pen|marker|china ink|\bink\b|pen on|sketch/.test(t)) return 'drawing';
  // flat mixed media / collage on paper
  if (/collage|mixed media on [a-z ]*(paper|cardboard|carton|board)|^mixed media$|mixed technique/.test(t.trim())) return 'mixed_media_2d';
  // hard 3D / out of scope (checked last so "acrylic on wood"/"woodcut" stay in-scope)
  // iron, bronze, copper, ceramic, tapestry, … → null
  return null;
}
const EXCLUDE_3D = /iron|bronze|brass|steel|copper|aluminum|aluminium|marble|granite|\bstone\b|ceramic|porcelain|terracotta|\bclay\b|plaster|fiber ?glass|resin|\bglass\b|crystal|\bneon\b|installation|sculpture|tapestry|weaving|carpet|\bwool\b|textile|embroidery|silver|jewell?ery|\bwood\b/;

// ---------- artist page parsing ----------
function parseArtistPage(html, artistUrl) {
  const name = clean((html.match(/<h2 class="slider-title">([\s\S]*?)<\/h2>/) || [])[1] || '');
  const natLine = clean((html.match(/<h4 class="bold">([\s\S]*?)<\/h4>/) || [])[1] || '');
  const works = [];
  // anchor block: <a id=".." href=".." data-fancybox="artwork" data-caption=".." data-artist=".." data-year=".." data-content=".." class="box ..">
  const anchorRe = /<a\s+(?:id="([^"]*)"\s+)?href="([^"]+)"\s*data-fancybox="artwork"([\s\S]*?)class="box/g;
  let m;
  while ((m = anchorRe.exec(html))) {
    const attrs = {};
    for (const a of m[3].matchAll(/data-(caption|artist|year|content)="([^"]*)"/g)) attrs[a[1]] = a[2];
    works.push({
      anchorId: m[1] || '',
      imgUrl: m[2],
      caption: clean(attrs.caption),
      artist: clean(attrs.artist) || name,
      yearStr: clean(attrs.year),
      medium: clean(attrs.content),
    });
  }
  return { name, natLine, works };
}

function buildId(artistUrl, anchorId, imgUrl) {
  let slug = decodeURIComponent(artistUrl.replace(/\/+$/, '').split('/').pop() || '');
  if (!/^[a-z0-9-]+$/i.test(slug)) slug = `ar-${sha(slug).slice(0, 8)}`; // Arabic slugs → short hash
  const part = anchorId && /^[a-z0-9-]+$/i.test(anchorId) ? anchorId : sha(imgUrl).slice(0, 8);
  return `${SLUG}-${slug}-${part}`.toLowerCase();
}

function stripQuotes(t) {
  return t.replace(/^["“”‘’']+/, '').replace(/["“”‘’']+$/, '').trim();
}

// ---------- B&W print gate (Hasler-Süsstrunk, from audit/curate-grayscale-prints.mjs) ----------
async function colorfulness(buf) {
  try {
    const { data } = await sharp(buf, { limitInputPixels: false }).resize(80, 80, { fit: 'inside' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const rg = [], yb = [];
    for (let i = 0; i < data.length; i += 3) { const R = data[i], G = data[i + 1], B = data[i + 2]; rg.push(R - G); yb.push(0.5 * (R + G) - B); }
    const m = (a) => a.reduce((s, v) => s + v, 0) / a.length;
    const sd = (a) => { const mu = m(a); return Math.sqrt(m(a.map((v) => (v - mu) ** 2))); };
    return Math.sqrt(sd(rg) ** 2 + sd(yb) ** 2) + 0.3 * Math.sqrt(m(rg) ** 2 + m(yb) ** 2);
  } catch { return -1; }
}

// ---------- image pipeline ----------
async function dl(url) {
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 5000) throw new Error(`tiny ${buf.length}b`);
      return buf;
    } catch (e) { if (att === 3) throw e; await sleep(700 * att); }
  }
}

async function uploadR2(key, buffer) {
  for (let att = 1; att <= 4; att++) {
    try {
      await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buffer, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000' }));
      return true;
    } catch (e) { if (att === 4) throw e; await sleep(500 * att); }
  }
}

// returns { imageUrl } | { skip: reason }
async function processImage(id, imgUrl, category) {
  const src = await dl(imgUrl);
  const meta = await sharp(src, { limitInputPixels: false }).metadata().catch(() => ({}));
  if (meta.width && Math.max(meta.width, meta.height) < 600) return { skip: `small ${meta.width}x${meta.height}` };
  if (category === 'print') {
    const c = await colorfulness(src);
    if (c >= 0 && c < 20) return { skip: `bw-print colorfulness=${c.toFixed(1)}` };
  }
  const { buffer } = await autocropToWebp(src); // default: pure webp(2048/q85), no trim
  const key = `artworks/${COLLECTION_STEM}/${id}-${sha(imgUrl).slice(0, 8)}-imageUrl.webp`;
  await uploadR2(key, buffer);
  return { imageUrl: `${R2_PUBLIC}/${key}` };
}

// ---------- progress ----------
function loadProgress() {
  if (MODE === 'full' && fs.existsSync(PROGRESS)) {
    const p = JSON.parse(fs.readFileSync(PROGRESS, 'utf8'));
    console.log(`[resume] ${Object.keys(p.doneArtists).length} artists done, ${p.artworks.length} works collected`);
    return p;
  }
  return { doneArtists: {}, artworks: [] };
}
function saveProgress(p) {
  fs.writeFileSync(PROGRESS, JSON.stringify(p));
}

function writeCollection(artworks, stem) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'Jordan National Gallery of Fine Arts',
    collection: 'Collection',
    website: 'https://nationalgallery.org/collection/',
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
  console.log(`[${MODE}] fetching artist roster from /collection/ …`);
  const artistUrls = await fetchArtistUrls();
  console.log(`[${MODE}] ${artistUrls.length} artist pages`);

  const prog = loadProgress();
  const seenIds = new Set(prog.artworks.map((w) => w.id));
  const stats = { pages: 0, anchors: 0, outScope: 0, min4: 0, bwSkip: 0, smallSkip: 0, imgErr: 0, pageErr: 0 };
  const unknownMedia = new Map();
  let stop = false;

  const todo = artistUrls.filter((u) => !prog.doneArtists[u]);
  let idx = 0;
  const CONC = 3;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (idx < todo.length && !stop) {
      const url = todo[idx++];
      let html;
      try { html = await getText(url); } catch (e) {
        stats.pageErr++;
        fs.appendFileSync(FAILED, JSON.stringify({ type: 'artist-page', url, err: String(e.message || e) }) + '\n');
        prog.doneArtists[url] = -1;
        continue;
      }
      const { name, natLine, works } = parseArtistPage(html, url);
      stats.pages++; stats.anchors += works.length;
      let kept = 0;
      for (const w of works) {
        if (stop) break;
        const category = classify(w.medium);
        if (!category) {
          stats.outScope++;
          if (w.medium && !EXCLUDE_3D.test(w.medium.toLowerCase())) {
            unknownMedia.set(w.medium, (unknownMedia.get(w.medium) || 0) + 1);
          }
          continue;
        }
        const title = stripQuotes(w.caption);
        const artist = w.artist || name;
        let year = (w.yearStr.match(/\d{4}/) || [])[0];
        if (!year) year = ((w.imgUrl.split('/').pop() || '').match(/(?:19|20)\d{2}/) || [])[0];
        if (!title || !artist || !year) { stats.min4++; continue; }
        const id = buildId(url, w.anchorId, w.imgUrl);
        if (seenIds.has(id)) continue;
        try {
          const res = await processImage(id, w.imgUrl, category);
          if (res.skip) {
            if (res.skip.startsWith('bw-print')) stats.bwSkip++; else stats.smallSkip++;
            continue;
          }
          seenIds.add(id);
          prog.artworks.push({
            id,
            objectNumber: (() => { const stem = (w.imgUrl.split('/').pop() || '').replace(/\.[a-z]+$/i, '').replace(/-scaled$/, ''); return /^[A-Z]{2,}_[A-Z0-9_]+$/.test(stem) ? stem : ''; })(),
            title,
            artist,
            date: w.yearStr || String(year),
            year: parseInt(year, 10),
            medium: w.medium,
            dimensions: '',
            category,
            description: '',
            imageUrl: res.imageUrl,
            thumbnailUrl: w.imgUrl,
            onDisplay: false,
            displayLocation: '',
            sourceUrl: w.anchorId ? `${url}#${w.anchorId}` : url,
            metadata: natLine ? { artist_origin: natLine } : {},
            original_imageUrl: w.imgUrl,
          });
          kept++;
          if (MODE === 'probe' && prog.artworks.length >= PROBE_TARGET) { stop = true; }
        } catch (e) {
          stats.imgErr++;
          fs.appendFileSync(FAILED, JSON.stringify({ type: 'image', id, url: w.imgUrl, err: String(e.message || e) }) + '\n');
        }
        await sleep(150);
      }
      prog.doneArtists[url] = kept;
      if (MODE === 'full' && stats.pages % 10 === 0) saveProgress(prog);
      if (stats.pages % 25 === 0) console.log(`  …${stats.pages}/${todo.length} pages | works ${prog.artworks.length} | out-scope ${stats.outScope} | bw-skip ${stats.bwSkip} | imgErr ${stats.imgErr}`);
      await sleep(250);
    }
  }));

  if (MODE === 'full') saveProgress(prog);
  prog.artworks.sort((a, b) => a.id.localeCompare(b.id));
  writeCollection(prog.artworks, MODE === 'probe' ? `${COLLECTION_STEM}-probe` : COLLECTION_STEM);
  console.log(`\n[${MODE}] DONE.`, stats);
  if (unknownMedia.size) {
    console.log('[classify] top unknown (non-3D) media skipped:');
    [...unknownMedia.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).forEach(([k, v]) => console.log(`   ${v}  ${k.slice(0, 80)}`));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
