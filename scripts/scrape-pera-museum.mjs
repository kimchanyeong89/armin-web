#!/usr/bin/env node
// Pera Museum (Istanbul) — Suna and İnan Kıraç Foundation collection scraper.
//
// Source: museum-OWN JSON endpoint (ASP.NET, no auth):
//   POST https://www.peramuseum.org/collection/getArtwork/{id}   (empty body; Content-Length required)
//   → { ATitle, AHTML1 (description), AHTML2 (artist/medium/dims/date <br>-lines), ImageURL1, LargeImageURL1 }
// Images: https://www.peramuseum.org/Repo/Collection/Images/{LargeImageURL1}  (1200–2400px JPEGs)
//
// The artwork ID space (~1–249, static since ~2021) holds BOTH Turkish and English rows for:
//   Orientalist paintings + Istanbul photographs (in-scope flat art) and Anatolian
//   weights/measures + Kütahya ceramics (3D — never match the medium keywords, so excluded).
// There is no list API → enumerate every ID. TR/EN rows of one work usually share the image
// file, or (for the late photo batch) share the exact title. We group rows into works via
// imgFile ∪ normTitle union, pick the most-English row as representative, and BACKFILL artist
// (often only on the TR row, e.g. "Thomas de Barbarin", "Jean Baptiste Vanmour") + date/dims.
//
// Known data corruption in the museum DB (verified by hand, ids static):
//   id 37 "İki Müzisyen Kız"  — legacy TR row pointing at the WRONG image (feast-of-trotters);
//   id 38 "sohbet"            — legacy TR row with wrong title (actually the Yeni Camii
//                               watercolour) — its title would chain-merge two different works;
//   → both EXCLUDED. Their works survive via EN rows 89 and 202.
//   id 195 TR "Yeni Cami ve İstanbul Limanı" pairs with EN 202 but shares neither image nor
//   title → MANUAL_PAIRS (donates the Jean-Baptiste Hilair attribution).
//   ids 141 ("aa") and 242 ("test_3d") are CMS test rows (no medium keywords → auto-excluded).
//
// Usage:
//   node scripts/scrape-pera-museum.mjs --classify # dry-run: scope/dedup/backfill table only (no images)
//   node scripts/scrape-pera-museum.mjs --probe    # ~20 works end-to-end (live R2) → pera-museum-collection-probe.json
//   node scripts/scrape-pera-museum.mjs --full     # all in-scope, resumable → pera-museum-collection.json

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

const SLUG = 'pera-museum';
const COLLECTION_STEM = `${SLUG}-collection`;
const BASE = 'https://www.peramuseum.org';
const IMG_BASE = `${BASE}/Repo/Collection/Images/`;
const UA = 'armin-museum-research/1.0';
const MAX_ID = 280; // enumeration verified empty past ~249; small margin
const R2_PUBLIC = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'armin-gallery-images';
const STATE_DIR = path.join(REPO, 'scripts/.state');
const PROGRESS = path.join(STATE_DIR, `${SLUG}-progress.json`);
const FAILED = path.join(STATE_DIR, `${SLUG}-failed.ndjson`);

const EXCLUDE_IDS = new Set([37, 38]); // corrupt legacy TR rows — see header
const MANUAL_PAIRS = { 195: 202 };     // TR row → EN row (no shared image/title)
// Museum's own catalogue text (AHTML1 of id 92) attributes "Two Musician Girls" to Osman Hamdi
// Bey ("one of Osman Hamdi Bey's five works included in the ... Collection"); the structured
// fields of row 89 omit it. Guide-sanctioned single cross-validation, museum's own words.
const MANUAL_ARTIST = { 89: 'Osman Hamdi Bey', 94: 'Fausto Zonaro' }; // 94: TR title is "Kayıkta Sefa, Fausto Zonaro"
// Deterministic fixups for Turkish attribution qualifiers (name cores stay raw).
const ARTIST_FIXUPS = [
  [/^Ressamı belirsiz \(Fransız Okulu\)$/i, 'French School'],
  [/^Ressamı belirsiz.*$/i, ''],                       // "painter unknown" → treat as absent
  [/\s*\(([^)]+?)['’]den\)/g, ' (after $1)'],          // "(X'den)" → "(after X)"
  [/\bOkulu\b/g, 'School'],                            // "Vanmour Okulu" → "Vanmour School"
];
const MEDIUM_TR2EN = {
  'tuval üstüne yağlıboya': 'Oil on canvas',
  'kağıt üstüne suluboya': 'Watercolor on paper',
  'kağıt üstüne karışık teknik': 'Mixed media on paper',
  'tuval üstüne pastel': 'Pastel on canvas',
  'parşömen üstüne pastel': 'Pastel on parchment',
  'bakır üstüne emaye': 'Enamel on copper',
  'albümin kâğıt': 'Albumen paper',
  'albümin kağıt': 'Albumen paper',
  'bromid kâğıt': 'Bromide paper',
  'bromid kağıt': 'Bromide paper',
};

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
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/&ndash;/g, '–').replace(/&mdash;/g, '—').replace(/&hellip;/g, '…')
  .replace(/&rsquo;/g, '’').replace(/&lsquo;/g, '‘')
  .replace(/&acirc;/g, 'â').replace(/&ucirc;/g, 'û').replace(/&icirc;/g, 'î')
  .replace(/&uuml;/g, 'ü').replace(/&ouml;/g, 'ö').replace(/&ccedil;/g, 'ç')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
const stripTags = (s) => decodeEntities((s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// ---------- state (enumeration cache + uploaded images) ----------
function loadState() {
  try { return JSON.parse(fs.readFileSync(PROGRESS, 'utf8')); } catch { return { rows: {}, images: {} }; }
}
function saveState(st) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(PROGRESS, JSON.stringify(st));
}

// ---------- fetch one artwork row ----------
async function getArtwork(id) {
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(`${BASE}/collection/getArtwork/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=UTF-8', 'Content-Length': '0', 'User-Agent': UA },
      });
      const txt = await r.text();
      try { return JSON.parse(txt); } catch { return null; } // HTML error page = no record at this id
    } catch (e) { if (att === 3) throw e; await sleep(800 * att); }
  }
}

// ---------- AHTML2 parser: <br>-lines = [artist?] / medium(+dims)(+date) / dims? / date? ----------
const PHOTO_RE = /\b(albumen|bromide|gelatin silver|photograph)\b/i;
const PAINT_RE = /\b(oil on|watercolou?r|gouache|tempera|pastel|enamel on|canvas|mixed (?:media|technique) on)\b/i;
const PRINT_RE = /\b(engraving|lithograph|etching|woodcut|aquatint|mezzotint)\b/i;
const TR_PHOTO_RE = /albümin|bromid/i;
const TR_PAINT_RE = /yağlıboya|suluboya|karışık teknik|emaye|tuval üstüne|parşömen üstüne/i;
const TR_MARK_RE = /üstüne|kâğıt|kağıt|tuval|albümin|bromid|parşömen/i; // medium-line language flag

const DIMS_RE = /([\d.,]+\s*x\s*[\d.,]+(?:\s*cm)?\.?|\b[\d.,]+\s*cm\b\.?)/i;
const CENTURY_RE = /((?:first half|second half|(?:first|second|third|last)\s+quarter|early|mid|late|beginning|end)[\s\w-]*?)?\b(\d{1,2})\s*(?:st|nd|rd|th)\s*centur(?:y|ies)/i;
const YEAR_RE = /\b(1[2-9]\d{2})\b/;
// bare-date line, tolerant of "(1725 ?)", "1733 ?", "Circa 1840", "May 1805", "1891 – 1910", "1762-71"
const isDateLine = (line) => {
  const l = line.replace(/[()?]/g, ' ').replace(/\.\s*$/, '').replace(/\s+/g, ' ').trim();
  return CENTURY_RE.test(l)
    || /^(?:c(?:irca)?\.?\s*)?1[2-9]\d{2}(?:\s*[–—-]\s*\d{2,4})?$/i.test(l)
    || /^(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+1[2-9]\d{2}$/i.test(l)
    || /^(?:1[2-9]\d{2})\s*(?:civarı)?$/i.test(l);
};

function parseYear(dateStr) {
  const y = (dateStr || '').match(YEAR_RE);
  if (y) return parseInt(y[1], 10);
  const c = (dateStr || '').match(CENTURY_RE);
  if (c) {
    const base = (parseInt(c[2], 10) - 1) * 100;
    const q = (c[1] || '').toLowerCase();
    if (q.includes('quarter')) {
      if (q.includes('last')) return base + 75;
      if (q.includes('third')) return base + 50;
      if (q.includes('second')) return base + 25;
      return base;
    }
    if (q.includes('second half')) return base + 50;
    if (q.includes('late') || q.includes('end')) return base + 75;
    if (q.includes('mid')) return base + 40;
    return base; // first half / early / beginning / bare century → earliest estimate
  }
  return null;
}

function parseHtml2(html2) {
  const lines = (html2 || '')
    .split(/<br\s*\/?\s*>|<\/p>/i)
    .map(stripTags)
    .map((l) => l.replace(/^[,;\s]+|[,;\s]+$/g, ''))
    .filter(Boolean);

  const artistParts = [];
  let medium = '', dimensions = '', date = '';
  let category = null;
  let lang = 'en';
  let seenMedium = false;

  for (const line of lines) {
    const cat = PHOTO_RE.test(line) || TR_PHOTO_RE.test(line) ? 'photograph'
      : PAINT_RE.test(line) || TR_PAINT_RE.test(line) ? 'painting'
      : PRINT_RE.test(line) ? 'print' : null;
    if (cat) {
      seenMedium = true;
      if (!category) {
        category = cat;
        if (TR_MARK_RE.test(line)) lang = 'tr';
      }
      let rest = line;
      const dm = rest.match(DIMS_RE);
      if (dm) { dimensions = dimensions || dm[1].replace(/\.\s*$/, '').trim(); rest = rest.replace(dm[1], ' '); }
      const cm = rest.match(CENTURY_RE);
      if (cm) { date = date || cm[0].trim(); rest = rest.replace(cm[0], ' '); }
      const ym = rest.match(/(?:\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+)?(?:c\.?\s*)?\b1[2-9]\d{2}(?:\s*[–—-]\s*\d{2,4})?\s*\??\s*\.?\s*$/i);
      if (ym) { date = date || ym[0].replace(/\.\s*$/, '').trim(); rest = rest.slice(0, ym.index); }
      medium = medium || rest.replace(/\s+/g, ' ').replace(/[,;.\s]+$/g, '').trim();
      continue;
    }
    const isDims = DIMS_RE.test(line) && !/[a-zçğışüö]{4,}\s+[a-zçğışüö]{4,}\s+[a-zçğışüö]{4,}/i.test(line.replace(DIMS_RE, ''));
    if (isDims) { if (!dimensions) dimensions = line.replace(/\.\s*$/, ''); continue; }
    if (isDateLine(line)) { if (!date) date = line.replace(/[()]/g, '').trim(); continue; }
    if (!seenMedium) artistParts.push(line); // lines before the medium line = artist
  }

  let artist = artistParts.join(' ').replace(/\s+/g, ' ').trim();
  for (const [re, sub] of ARTIST_FIXUPS) artist = artist.replace(re, sub).trim();
  return { artist, medium, dimensions, date, category, lang, year: parseYear(date) };
}

// ---------- title utils ----------
const foldTr = (s) => (s || '')
  .replace(/İ/g, 'i').replace(/I/g, 'i').replace(/ı/g, 'i')
  .replace(/Ş|ş/g, 's').replace(/Ğ|ğ/g, 'g').replace(/Ç|ç/g, 'c')
  .replace(/Ö|ö/g, 'o').replace(/Ü|ü/g, 'u')
  .normalize('NFD').replace(/[̀-ͯ]/g, '');
const normTitle = (s) => foldTr(s).toLowerCase().replace(/[^a-z0-9]+/g, '');
const slugify = (s) => foldTr(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
// crude "how English is this title" score for representative picking
const enScore = (t) => (t.match(/\b(the|of|and|a|in|with|from|his|her)\b/gi) || []).length - (t.match(/[çğışüöâ’]/gi) || []).length;

// ---------- B&W reproductive-print gate (Hasler-Süsstrunk; prints ONLY — photos/paintings/drawings never gated) ----------
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
      return;
    } catch (e) { if (att === 4) throw e; await sleep(500 * att); }
  }
}

async function processImage(w) {
  const src = await dl(w.original_imageUrl);
  const meta = await sharp(src).metadata().catch(() => ({}));
  if (meta.width && Math.max(meta.width, meta.height) < 600) throw new Error(`thumb ${meta.width}x${meta.height}`);
  if (w.category === 'print') {
    const cf = await colorfulness(src);
    if (cf >= 0 && cf < 20) return { skipBW: true, cf };
  }
  const { buffer } = await autocropToWebp(src);
  const key = `artworks/${COLLECTION_STEM}/${w.id}-${sha(w.original_imageUrl).slice(0, 8)}-imageUrl.webp`;
  await uploadR2(key, buffer);
  return { imageUrl: `${R2_PUBLIC}/${key}` };
}

// ---------- main ----------
async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const st = loadState();

  // 1) enumerate ID space (cached in progress file; resumable)
  const todo = [];
  for (let id = 1; id <= MAX_ID; id++) if (!(id in st.rows)) todo.push(id);
  if (todo.length) console.log(`[enum] fetching ${todo.length} of ${MAX_ID} ids (rest cached)…`);
  let fetched = 0;
  for (const id of todo) {
    const d = await getArtwork(id);
    st.rows[id] = d ? { t: d.ATitle, h1: d.AHTML1, h2: d.AHTML2, img: d.LargeImageURL1, img1: d.ImageURL1 } : null;
    if (++fetched % 25 === 0) { saveState(st); console.log(`  …${fetched}/${todo.length}`); }
    await sleep(280); // ~3.5 rps
  }
  saveState(st);

  // 2) parse + scope filter (flat-art rows in either language; 3D/test rows never match)
  const cands = [];
  for (const [idStr, row] of Object.entries(st.rows)) {
    const numId = parseInt(idStr, 10);
    if (!row || !row.t || EXCLUDE_IDS.has(numId) || !(row.img || row.img1)) continue;
    const p = parseHtml2(row.h2);
    if (!p.category) continue;
    cands.push({
      numId,
      title: decodeEntities(row.t).replace(/\s+/g, ' ').trim(),
      imgFile: row.img || row.img1,
      thumbFile: row.img1 || row.img,
      desc: stripTags(row.h1),
      ...p,
    });
  }

  // 3) group TR/EN rows of the same work: shared image file ∪ shared normalized title ∪ manual pairs
  const parent = new Map();
  const find = (k) => { let r = k; while (parent.get(r) !== r) r = parent.get(r); parent.set(k, r); return r; };
  const union = (a, b) => { parent.set(find(a), find(b)); };
  for (const c of cands) parent.set(c.numId, c.numId);
  const byImg = new Map(), byTitle = new Map();
  for (const c of cands) {
    const ik = c.imgFile, tk = normTitle(c.title);
    if (byImg.has(ik)) union(c.numId, byImg.get(ik)); else byImg.set(ik, c.numId);
    if (byTitle.has(tk)) union(c.numId, byTitle.get(tk)); else byTitle.set(tk, c.numId);
  }
  for (const [a, b] of Object.entries(MANUAL_PAIRS)) {
    if (parent.has(+a) && parent.has(+b)) union(+a, +b);
  }
  const groups = new Map();
  for (const c of cands) {
    const r = find(c.numId);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(c);
  }

  // 4) representative + backfill from siblings (artist usually lives on the TR row)
  const works = [];
  for (const rows of groups.values()) {
    rows.sort((a, b) =>
      (a.lang === 'en' ? 0 : 1) - (b.lang === 'en' ? 0 : 1)
      || enScore(b.title) - enScore(a.title)
      || (/detay/i.test(a.imgFile) ? 1 : 0) - (/detay/i.test(b.imgFile) ? 1 : 0)
      || b.numId - a.numId);
    const rep = { ...rows[0] };
    for (const sib of rows.slice(1)) {
      if (!rep.artist && sib.artist) rep.artist = sib.artist;
      if (!rep.dimensions && sib.dimensions) rep.dimensions = sib.dimensions;
      if (rep.year == null && sib.year != null) { rep.date = rep.date || sib.date; rep.year = sib.year; }
      if (!rep.desc && sib.desc && sib.lang === 'en') rep.desc = sib.desc;
      if (/detay/i.test(rep.imgFile) && !/detay/i.test(sib.imgFile) && sib.lang === rep.lang) {
        rep.imgFile = sib.imgFile; rep.thumbFile = sib.thumbFile;
      }
    }
    if (MANUAL_ARTIST[rep.numId] && !rep.artist) rep.artist = MANUAL_ARTIST[rep.numId];
    if (rep.lang === 'tr' || TR_MARK_RE.test(rep.medium)) {
      const key = rep.medium.toLowerCase().replace(/\s+/g, ' ').trim();
      rep.medium = MEDIUM_TR2EN[key] || rep.medium;
    }
    works.push(rep);
  }

  const noYear = works.filter((w) => w.year == null);
  const ready = works.filter((w) => w.year != null).sort((a, b) => a.numId - b.numId); // min-4 guard
  const tally = {};
  for (const w of ready) tally[w.category] = (tally[w.category] || 0) + 1;
  console.log(`[scope] in-scope rows: ${cands.length} → unique works: ${works.length} → with year: ${ready.length}`, tally);
  if (noYear.length) console.log(`[scope] dropped (no parsable year): ${noYear.map((w) => `${w.numId}:${w.title.slice(0, 35)}`).join(' | ')}`);

  const batch = MODE === 'probe' ? ready.slice(0, PROBE_TARGET) : ready;

  // 5) images → R2 (resumable via st.images)
  console.log(`[${MODE}] processing ${batch.length} works…`);
  const artworks = [];
  let imgErr = 0, bwSkip = 0;
  for (const w of batch) {
    const id = `${SLUG}-${w.numId}`;
    const work = {
      id,
      numId: w.numId,
      title: w.title,
      artist: w.artist || 'Unknown',
      category: w.category,
      original_imageUrl: IMG_BASE + encodeURIComponent(w.imgFile),
      thumbnailUrl: IMG_BASE + encodeURIComponent(w.thumbFile),
    };
    try {
      let imageUrl = st.images[id];
      if (!imageUrl) {
        const res = await processImage({ ...work, id });
        if (res.skipBW) { bwSkip++; console.log(`  [skip B&W print] ${id} cf=${res.cf.toFixed(1)}`); continue; }
        imageUrl = res.imageUrl;
        st.images[id] = imageUrl;
        saveState(st);
        await sleep(300);
      }
      artworks.push({
        id,
        objectNumber: '',
        title: w.title,
        artist: work.artist,
        date: w.date,
        year: w.year,
        medium: w.medium,
        dimensions: w.dimensions,
        category: w.category,
        description: w.desc,
        imageUrl,
        thumbnailUrl: work.thumbnailUrl,
        onDisplay: false,
        displayLocation: '',
        sourceUrl: `${BASE}/artwork/${slugify(w.title) || 'work'}/15/${w.numId}`,
        metadata: { api_id: w.numId },
        original_imageUrl: work.original_imageUrl,
      });
    } catch (e) {
      imgErr++;
      fs.appendFileSync(FAILED, JSON.stringify({ id, url: work.original_imageUrl, err: String(e.message || e) }) + '\n');
      console.log(`  [img err] ${id}: ${e.message}`);
    }
  }

  // 6) write collection JSON
  const stem = MODE === 'probe' ? `${COLLECTION_STEM}-probe` : COLLECTION_STEM;
  const outTally = {};
  for (const a of artworks) outTally[a.category] = (outTally[a.category] || 0) + 1;
  const payload = {
    museum: 'Pera Museum',
    collection: 'Suna and İnan Kıraç Foundation Collection',
    website: 'https://www.peramuseum.org/collection',
    scraped_date: new Date().toISOString().slice(0, 10),
    total_count: artworks.length,
    source_type: 'json-endpoint',
    category_breakdown: outTally,
    artworks,
  };
  const out = path.join(REPO, 'public/data', `${stem}.json`);
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));

  // fill-rate report
  const cov = (f) => artworks.filter((a) => a[f] != null && String(a[f]).trim() !== '').length;
  const named = artworks.filter((a) => a.artist && a.artist !== 'Unknown').length;
  console.log(`\n[write] ${out}`);
  console.log(`[${MODE}] DONE: ${artworks.length} works (${JSON.stringify(outTally)}) | imgErr ${imgErr} | bwSkip ${bwSkip}`);
  console.log(`[fill] title ${cov('title')}/${artworks.length} | artist(named) ${named} | year ${cov('year')} | medium ${cov('medium')} | dims ${cov('dimensions')} | desc ${cov('description')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
