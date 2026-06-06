#!/usr/bin/env node
// Scraper — National Gallery of Iceland (Listasafn Íslands), slug `ngi-reykjavik`.
// Source: museum-own Prismic CMS (repo listasafn-islands) + Next.js SSG site. No auth.
//
// Two-endpoint recipe (see scripts/SOURCE_RESEARCH_national-gallery-iceland.md):
//   (1) Enumerate all artwork UIDs via Prismic content API (lang=is, 488 docs).
//   (2) Per-UID full metadata via Next.js page-data JSON (carries the `sarpur` block).
//
// Phases:
//   node scripts/scrape-ngi-reykjavik.mjs --meta            # enumerate + fetch all detail records → meta cache
//   node scripts/scrape-ngi-reykjavik.mjs --build           # classify + write collection JSON (no images yet, imageUrl=original)
//   node scripts/scrape-ngi-reykjavik.mjs --images          # download → autocrop → R2 upload → set imageUrl=R2
//   node scripts/scrape-ngi-reykjavik.mjs --images --limit=N # pilot: only first N flat-art records
//
// Metadata is parsed from the DETAIL record (pageProps.content.sarpur), never a list shortcut.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { autocropToWebp } from './lib/autocrop.mjs';

const require = createRequire(import.meta.url);
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config({ path: path.resolve(fileURLToPath(import.meta.url), '../../.env.local') });

const SLUG = 'ngi-reykjavik';
const COLLECTION_STEM = `${SLUG}-collection`;
const REPO = path.resolve(fileURLToPath(import.meta.url), '../..');
const STATE_DIR = path.join(REPO, 'scripts', '.state');
const META_PATH = path.join(STATE_DIR, `${SLUG}-meta.json`);
const JSON_PATH = path.join(REPO, 'public', 'data', `${COLLECTION_STEM}.json`);
const FAILED_LOG = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);

const PRISMIC = 'https://listasafn-islands.cdn.prismic.io/api/v2';
const SITE = 'https://www.listasafn.is';
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) armin-museum-research/1.0';

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : d; };
const LIMIT = opt('limit') ? Number(opt('limit')) : null;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

async function getJSON(url, tries = 4) {
  for (let i = 1; i <= tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) { if (i === tries) throw e; await sleep(600 * i); }
  }
}

// ---- category derivation (fields are Icelandic) -------------------------------------
// Returns one of: painting | drawing | print | photograph | sculpture(EXCLUDE) | other
// Priority handles records whose `method` carries BOTH Teiknun+Málun (a coloured drawing):
// the `category` taxonomy (Olíumálverk / Teiknun / Grafík / Skúlptúr) is the stronger signal.
function deriveCategory(sarpur) {
  const cat = (sarpur.category || []).join(' | ').toLowerCase();
  const method = (sarpur.method || []).join(' | ').toLowerCase();
  const material = (sarpur.material || []).join(' | ').toLowerCase();
  const all = `${cat} ${method} ${material}`;

  // sculpture / 3D — exclude. (lej- = Einar Jónsson sculpture museum.)
  if (/skúlptúr|höggmynd|gifssteyp|brons|lágmynd|relíef|stytta/.test(all)) return 'sculpture';

  // photograph
  if (/ljósmynd|ljósmyndun/.test(all)) return 'photograph';

  // print / graphics (Þrykk = print; Grafík = graphics; æting/akvatinta/sáldþrykk/dúkrista/tréskurð/steinprent)
  if (/grafík|þrykk|æting|akvatinta|sáldþrykk|dúkrist|tréskurð|steinprent|lithograf|ætingar/.test(all)) return 'print';

  // painting — strongest paint signals from the LÍ category taxonomy
  if (/olíumálverk|málaralist|akrýl|tempera|vatnslitamynd|vatnslitir|gvass/.test(cat)) return 'painting';

  // drawing
  if (/teiknun|teikning|vaxlitamynd|krítarmynd|blýantsteikn/.test(cat)) return 'drawing';

  // method-based fallbacks (when category taxonomy is sparse)
  if (/tækni\/teiknun/.test(method)) return 'drawing';
  if (/tækni\/málun/.test(method)) {
    // a method that ALSO has Teiknun and paper material is a coloured drawing, not an oil painting
    if (/teiknun/.test(method) && /pappír/.test(material) && !/olíulitur|striga|canvas/.test(material)) return 'drawing';
    return 'painting';
  }
  return 'other';
}

const ICE_MAT = [
  // map common Icelandic material tokens → readable medium (best-effort; original kept in metadata)
  [/olíulitur/i, 'oil'], [/akrýl/i, 'acrylic'], [/tempera/i, 'tempera'],
  [/vatnslit/i, 'watercolour'], [/gvass/i, 'gouache'], [/prentlitur/i, 'print ink'],
  [/vaxlitur/i, 'wax crayon'], [/krít/i, 'chalk'], [/blýant/i, 'pencil'],
  [/blek/i, 'ink'], [/pappír/i, 'paper'], [/striga|léreft/i, 'canvas'],
  [/tré\b|viður/i, 'wood'], [/masonít/i, 'masonite'],
];
function readableMedium(sarpur) {
  // keep the source material/method strings, but also synthesise a short readable medium.
  const raw = [...(sarpur.material || []), ...(sarpur.method || [])];
  const toks = new Set();
  const joined = raw.join(' ');
  for (const [re, en] of ICE_MAT) if (re.test(joined)) toks.add(en);
  const readable = [...toks].join(', ');
  // Prefer the raw source material string (last segment after '/') for fidelity, fall back to readable.
  const srcMaterial = (sarpur.material || []).map(m => m.split('/').pop().trim()).filter(Boolean).join('; ');
  return { medium: srcMaterial || readable, readable };
}

function parseYear(yearStr) {
  if (!yearStr) return null;
  const m = String(yearStr).match(/\d{3,4}/);
  return m ? parseInt(m[0], 10) : null;
}

// ---- Phase: META (enumerate + fetch all detail records) -----------------------------
async function getBuildId() {
  const html = await (await fetch(`${SITE}/list/safneign/li-4863/`, { headers: { 'User-Agent': UA } })).text();
  const m = html.match(/"buildId":"([^"]+)"/);
  if (!m) throw new Error('could not read buildId from live page');
  return m[1];
}

async function phaseMeta() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const ref = (await getJSON(PRISMIC)).refs[0].ref;
  const buildId = await getBuildId();
  console.log(`[meta] master ref=${ref}  buildId=${buildId}`);

  // enumerate
  const uids = [];
  let page = 1, totalPages = 1;
  do {
    const u = `${PRISMIC}/documents/search?ref=${encodeURIComponent(ref)}&q=${encodeURIComponent('[[at(document.type,"artwork")]]')}&lang=is&pageSize=100&page=${page}`;
    const d = await getJSON(u);
    totalPages = d.total_pages;
    for (const r of d.results) uids.push(r.uid);
    if (page === 1) console.log(`[meta] total_results_size=${d.total_results_size} total_pages=${totalPages}`);
    page++;
    await sleep(700);
  } while (page <= totalPages);
  console.log(`[meta] enumerated ${uids.length} uids`);

  // fetch detail per uid
  const records = [];
  let done = 0, fail = 0;
  fs.writeFileSync(FAILED_LOG, '');
  for (const uid of uids) {
    const url = `${SITE}/_next/data/${buildId}/is/list/safneign/${uid}.json`;
    try {
      const d = await getJSON(url);
      const content = (d.pageProps || {}).content || {};
      records.push({ uid, content });
    } catch (e) {
      fail++;
      fs.appendFileSync(FAILED_LOG, JSON.stringify({ uid, stage: 'meta', err: String(e) }) + '\n');
    }
    if (++done % 50 === 0) console.log(`  …meta ${done}/${uids.length} (fail ${fail})`);
    await sleep(550);
  }
  fs.writeFileSync(META_PATH, JSON.stringify({ buildId, ref, scraped_date: new Date().toISOString().slice(0, 10), records }, null, 2));
  console.log(`[meta] wrote ${records.length} detail records → ${META_PATH} (fail ${fail})`);
}

// ---- Phase: BUILD (classify → collection JSON, imageUrl=original for now) ------------
function buildArtwork(rec) {
  const c = rec.content || {};
  const s = c.sarpur || {};
  const uid = rec.uid;
  const title = (c.title || s.name || '').trim();
  const artists = (s.artists || []).map(a => (a.name || '').trim()).filter(Boolean);
  const artist = artists.join('; ');
  const year = parseYear(s.year);
  const category = deriveCategory(s);
  const img = c.image;
  const imgUrl = (img && typeof img === 'object') ? img.url : null;
  const { medium } = readableMedium(s);
  const dimensions = (s.size || '').split('\n')[0].trim(); // first line = bare size; 2nd = "with frame"

  return {
    rec, uid, title, artist, year, category, imgUrl, medium, dimensions, sarpur: s,
  };
}

function phaseBuild() {
  const meta = JSON.parse(fs.readFileSync(META_PATH, 'utf8'));
  const built = meta.records.map(buildArtwork);

  // classification stats
  const byCat = {};
  for (const b of built) byCat[b.category] = (byCat[b.category] || 0) + 1;
  console.log('[build] raw category distribution (all 488):', JSON.stringify(byCat));

  // SCOPE: flat visual art only. Exclude sculpture + other. Keep painting/drawing/print/photograph.
  const FLAT = new Set(['painting', 'drawing', 'print', 'photograph']);
  const dropped = { sculpture: 0, other: 0, no_image: 0, missing_required: 0 };
  const artworks = [];

  for (const b of built) {
    if (b.category === 'sculpture') { dropped.sculpture++; continue; }
    if (!FLAT.has(b.category)) { dropped.other++; continue; }
    if (!b.imgUrl) { dropped.no_image++; continue; }            // no displayable image → drop
    // min-4 guarantee (title, artist, year, category). Never placeholder-fill.
    if (!b.title || !b.artist || b.year == null || !b.category) { dropped.missing_required++; continue; }

    const s = b.sarpur;
    artworks.push({
      id: b.uid,
      objectNumber: s.listasafnidId || '',
      title: b.title,
      artist: b.artist,                                         // source form, not reordered
      date: (s.year || '').trim(),
      year: b.year,
      medium: b.medium,
      dimensions: b.dimensions,
      category: b.category,
      description: ([s.exhibitionText, s.summary, s.description].find(v => typeof v === 'string' && v.trim()) || '').trim(),
      imageUrl: b.imgUrl,                                       // ← replaced with R2 URL in --images
      thumbnailUrl: b.imgUrl,
      onDisplay: false,
      displayLocation: '',
      sourceUrl: `${SITE}/list/safneign/${b.uid}/`,
      metadata: {
        sarpurObjectID: s.objectID || '',
        imageId: s.imageId || '',
        mainType: s.mainType || [],
        secondaryType: s.secondaryType || [],
        sarpurCategory: s.category || [],
        method: s.method || [],
        material: s.material || [],
        copyright: s.copyright || [],
        source: s.source || '',
        artistDates: (s.artists || []).map(a => ({ name: a.name, birthYear: a.birthYear, deathYear: a.deathYear })),
      },
      original_imageUrl: b.imgUrl,
    });
  }

  const out = {
    museum: 'National Gallery of Iceland',
    collection: 'Collection',
    website: 'https://www.listasafn.is/en/art/collection/',
    scraped_date: meta.scraped_date,
    total_count: artworks.length,
    source_type: 'prismic-cms',
    artworks,
  };
  fs.writeFileSync(JSON_PATH, JSON.stringify(out, null, 2));

  const inScopeCat = {};
  for (const a of artworks) inScopeCat[a.category] = (inScopeCat[a.category] || 0) + 1;
  console.log(`[build] dropped: ${JSON.stringify(dropped)}`);
  console.log(`[build] in-scope collected: ${artworks.length} → ${JSON.stringify(inScopeCat)}`);
  console.log(`[build] wrote ${JSON_PATH}`);
}

// ---- Phase: IMAGES (download → autocrop → R2) ---------------------------------------
const s3 = new S3Client({
  region: 'auto', endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

async function dlBuf(url, tries = 4) {
  for (let i = 1; i <= tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return Buffer.from(await r.arrayBuffer());
    } catch (e) { if (i === tries) throw e; await sleep(600 * i); }
  }
}

async function phaseImages() {
  const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  let arr = data.artworks;
  if (LIMIT) arr = arr.slice(0, LIMIT);
  console.log(`[images] processing ${arr.length}${LIMIT ? ` (pilot limit ${LIMIT})` : ''} of ${data.artworks.length}`);

  let ok = 0, fail = 0, done = 0, tooSmall = 0;
  for (const a of arr) {
    // already on R2? skip (resumable)
    if (a.imageUrl.includes('.r2.dev/')) { ok++; done++; continue; }
    const src = a.original_imageUrl;
    // fetch the original master (strip the ?auto query → full-res), fall back to display url
    const masterUrl = src.split('?')[0];
    try {
      let buf;
      try { buf = await dlBuf(masterUrl); } catch { buf = await dlBuf(src); }
      // verify it's a real full-size image, not a thumbnail
      const { buffer, cropped, shrink } = await autocropToWebp(buf);
      // dimension sanity via sharp metadata on the cropped webp
      const sharp = require('sharp');
      const meta = await sharp(buffer).metadata();
      if (Math.max(meta.width || 0, meta.height || 0) < 600) {
        tooSmall++;
        fs.appendFileSync(FAILED_LOG, JSON.stringify({ uid: a.id, stage: 'images', err: `too small ${meta.width}x${meta.height}` }) + '\n');
        a.__drop = true;
        if (++done % 25 === 0) console.log(`  …img ${done}/${arr.length} (ok ${ok} fail ${fail} small ${tooSmall})`);
        continue;
      }
      const hash8 = sha256(src).slice(0, 8);
      const key = `artworks/${COLLECTION_STEM}/${a.id}-${hash8}-imageUrl.webp`;
      let put = false;
      for (let att = 1; att <= 4 && !put; att++) {
        try {
          await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buffer, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000' }));
          put = true;
        } catch (e) { if (att === 4) throw e; await sleep(500 * att); }
      }
      a.imageUrl = `${R2_PUBLIC}/${key}`;
      ok++;
    } catch (e) {
      fail++;
      fs.appendFileSync(FAILED_LOG, JSON.stringify({ uid: a.id, stage: 'images', err: String(e) }) + '\n');
      a.__drop = true;
    }
    if (++done % 25 === 0) console.log(`  …img ${done}/${arr.length} (ok ${ok} fail ${fail} small ${tooSmall})`);
    await sleep(450);
  }

  // drop records whose image failed/too-small (only when not a partial pilot run)
  const before = data.artworks.length;
  data.artworks = data.artworks.filter(a => !a.__drop);
  for (const a of data.artworks) delete a.__drop;
  data.total_count = data.artworks.length;
  fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2));
  console.log(`[images] done: ok ${ok}, fail ${fail}, tooSmall ${tooSmall}. records ${before} → ${data.artworks.length}`);
}

(async () => {
  if (flag('meta')) await phaseMeta();
  if (flag('build')) phaseBuild();
  if (flag('images')) await phaseImages();
  if (!flag('meta') && !flag('build') && !flag('images')) {
    console.log('usage: --meta | --build | --images [--limit=N]');
  }
})().catch(e => { console.error(e); process.exit(1); });
