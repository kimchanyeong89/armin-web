#!/usr/bin/env node
// MoCA Busan (부산현대미술관) — collection scraper.
// Source: museum's OWN municipal CMS board (busan.go.kr "humanframe"), no auth.
//   List:   https://www.busan.go.kr/moca/collection1?bbsNo=9&curPage={1..39}  (9 items/page, 345 total)
//   Detail: https://www.busan.go.kr/moca/collection1/view?bbsNo=9&dataNo={dataNo}
//   Image:  https://www.busan.go.kr/comm/getFile?srvcId=PAVILION&upperNo={dataNo}&fileTy=ATTACH&fileNo=1  (~1800px)
// Category lives ONLY on the list page (<span class="hidden">평면</span>); all other metadata
//   (작품명/등록번호/작가/제작년도/재료 및 기법/작품규격/내용) is parsed from the DETAIL page.
//
// SCOPE: flat art only. 입체·설치 (sculpture/installation) is excluded at the list stage.
//   평면→painting/drawing/print/mixed_media_2d/calligraphy by medium; 사진→photograph;
//   단채널영상/다채널영상/영상설치/뉴미디어→video (skip if medium is clearly a 3D object).
//   B&W gate: category=print with colorfulness<20 is skipped (drawings/photographs never gated).
//
// Usage:
//   node scripts/scrape-moca-busan.mjs --probe   # ~20 in-scope works end-to-end → moca-busan-collection-probe.json
//   node scripts/scrape-moca-busan.mjs --full    # all in-scope, resumable → moca-busan-collection.json

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

const SLUG = 'moca-busan';
const COLLECTION_STEM = `${SLUG}-collection`;
const BASE = 'https://www.busan.go.kr';
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
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&middot;/g, '·').replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).trim();
const stripTags = (html) => decodeEntities(
  String(html || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')           // hwpEditor JSON lives in an HTML comment
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
).replace(/[ \t ]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();

async function fetchText(url) {
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) { if (att === 3) throw e; await sleep(800 * att); }
  }
}

// ---------- list pages: dataNo + category (category exists ONLY here) ----------
function parseListPage(html) {
  const items = [];
  const re = /<a href="\/moca\/collection1\/view\?[^"]*dataNo=(\d+)"[^>]*data-no="\1">([\s\S]*?)<\/a>\s*<\/li>/g;
  let m;
  while ((m = re.exec(html))) {
    const [, dataNo, block] = m;
    const cat = (block.match(/<span class="hidden">([^<]+)<\/span>/) || [])[1] || '';
    const img = (block.match(/<img src="([^"]*)"/) || [])[1] || '';
    const hasImage = /upperNo=\d+/.test(img);
    items.push({ dataNo, sourceCategory: decodeEntities(cat), hasImage });
  }
  return items;
}

async function fetchAllListItems() {
  const first = await fetchText(`${BASE}/moca/collection1?bbsNo=9&curPage=1`);
  const total = parseInt((first.match(/총\s*<strong[^>]*>([\d,]+)<\/strong>/) || [, '0'])[1].replace(/,/g, ''), 10);
  const lastPage = Math.max(1, ...[...first.matchAll(/curPage=(\d+)/g)].map((x) => +x[1]));
  console.log(`[list] total=${total} works, pages=${lastPage}`);
  const items = parseListPage(first);
  for (let p = 2; p <= lastPage; p++) {
    await sleep(300);
    items.push(...parseListPage(await fetchText(`${BASE}/moca/collection1?bbsNo=9&curPage=${p}`)));
    if (p % 10 === 0) console.log(`  list page ${p}/${lastPage} (${items.length} items)`);
  }
  console.log(`[list] collected ${items.length}/${total} items`);
  return items;
}

// ---------- category mapping ----------
// fallback when the list page has no category tag: the registration number encodes it
// (e.g. "25359평62" → 평면, "19124뉴23" → 뉴미디어)
const REG_CHAR = { '평': '평면', '사': '사진', '입': '입체·설치', '영': '영상설치', '다': '다채널영상', '단': '단채널영상', '뉴': '뉴미디어' };
const regCategory = (objectNumber) => REG_CHAR[(String(objectNumber).match(/[평사입영다단뉴]/) || [])[0]] || '';

function mapCategory(sourceCategory, medium) {
  const m = (medium || '');
  switch (sourceCategory) {
    case '입체·설치': return null; // out of scope
    case '사진': return 'photograph';
    case '단채널영상':
    case '다채널영상':
    case '영상설치': return 'video';
    case '뉴미디어': { // moving-image works + flat works on paper; VR/interactive/light/sound installations are 3D
      if (/(비디오|영상|애니메이션|필름|video|film)/i.test(m) && !/(VR|버추얼|가상\s*현실|virtual\s*reality)/i.test(m)) return 'video';
      if (/(종이|드로잉)/.test(m) && !/(모니터|설치|인스톨|컴퓨터|전자|VR)/i.test(m)) return 'mixed_media_2d'; // e.g. Nam June Paik "Random Access" flat collages
      return null;
    }
    case '평면': {
      if (/(서예|서각|캘리)/.test(m)) return 'calligraphy';
      if (/(판화|석판|실크\s*스크린|스크린\s*프린트|세리그라|에칭|동판|목판|리노|애쿼틴트|인그레이빙)/.test(m)) return 'print';
      if (/(연필|목탄|콘테|드로잉|색연필|펜\b|마커|크레용)/.test(m)) return 'drawing';
      if (/(유채|유화|아크릴|캔버스|템페라|과슈|수채|수묵|채색|먹|안료|장지|한지|광목|린넨|패널|나무에|혼합재료|혼합기법|에나멜|래커|우레탄\s*도료|스프레이)/.test(m)) return 'painting';
      if (/(사진|프린트|인화)/.test(m)) return 'photograph';
      if (/(영상|비디오)/.test(m)) return 'video';
      return 'mixed_media_2d';
    }
    default: return null; // unknown source category → conservative skip
  }
}

// ---------- detail page: full metadata ----------
function parseDetail(html, dataNo) {
  const fields = {};
  const re = /<dl class="exhCont\s*">\s*<dt>\s*([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g;
  let m;
  while ((m = re.exec(html))) {
    const label = stripTags(m[1]).replace(/\s+/g, '');
    fields[label] = m[2];
  }
  const get = (kw) => {
    const key = Object.keys(fields).find((k) => k.includes(kw));
    return key ? stripTags(fields[key]) : '';
  };
  const title = get('작품명');
  const objectNumber = get('등록번호');
  const artist = get('작가');
  const dateStr = get('제작년도');
  const medium = get('재료');
  const dimensions = get('작품규격').replace(/\s+/g, ' ');
  let description = get('내용').replace(/\n+/g, ' ').trim();
  if (description.length > 600) description = description.slice(0, 597).trimEnd() + '…';
  const yearMatch = dateStr.match(/(19|20)\d{2}/);
  const year = yearMatch ? parseInt(yearMatch[0], 10) : null;
  const img = (html.match(/getFile\?srvcId=PAVILION&amp;upperNo=(\d+)&amp;fileTy=ATTACH&amp;fileNo=(\d+)/) || [])[0];
  const imageUrl = img ? `${BASE}/comm/${decodeEntities(img)}` : null;
  return { dataNo, title, objectNumber, artist, dateStr, year, medium, dimensions, description, imageUrl };
}

// ---------- colorfulness (Hasler-Süsstrunk) — gate for B&W reproductive prints only ----------
async function colorfulness(buf) {
  const { data } = await sharp(buf, { limitInputPixels: false }).resize(80, 80, { fit: 'inside' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const rg = [], yb = [];
  for (let i = 0; i < data.length; i += 3) { const R = data[i], G = data[i + 1], B = data[i + 2]; rg.push(R - G); yb.push(0.5 * (R + G) - B); }
  const m = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const sd = (a) => { const mu = m(a); return Math.sqrt(m(a.map((v) => (v - mu) ** 2))); };
  return Math.sqrt(sd(rg) ** 2 + sd(yb) ** 2) + 0.3 * Math.sqrt(m(rg) ** 2 + m(yb) ** 2);
}

// ---------- image: download, validate, autocrop→webp, upload R2 ----------
async function dl(url) {
  for (let att = 1; att <= 3; att++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 5000) throw new Error(`tiny ${buf.length}b`);
      return buf;
    } catch (e) { if (att === 3) throw e; await sleep(800 * att); }
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

async function processImage(detail, category, id) {
  const src = await dl(detail.imageUrl);
  const meta = await sharp(src).metadata();
  if (Math.max(meta.width || 0, meta.height || 0) < 600) throw new Error(`too small ${meta.width}x${meta.height}`);
  if (category === 'print') {
    const c = await colorfulness(src);
    if (c < 20) throw new Error(`bw-print colorfulness=${c.toFixed(1)}`);
  }
  const { buffer } = await autocropToWebp(src);
  const hash8 = sha(detail.imageUrl).slice(0, 8);
  const key = `artworks/${COLLECTION_STEM}/${id}-${hash8}-imageUrl.webp`;
  await uploadR2(key, buffer);
  return `${R2_PUBLIC}/${key}`;
}

// ---------- persistence ----------
function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS, 'utf8')); } catch { return { artworks: {} }; }
}
function saveProgress(prog) {
  fs.writeFileSync(PROGRESS, JSON.stringify(prog));
}
function writeCollection(artworks, stem) {
  const cats = {};
  for (const w of artworks) cats[w.category] = (cats[w.category] || 0) + 1;
  const payload = {
    museum: 'Museum of Contemporary Art Busan',
    collection: 'Collection',
    website: 'https://www.busan.go.kr/moca/collection1?bbsNo=9',
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
  const listItems = await fetchAllListItems();

  const tally = {};
  for (const it of listItems) tally[it.sourceCategory] = (tally[it.sourceCategory] || 0) + 1;
  console.log('[list] source categories:', tally);

  // in-scope candidates: everything except 입체·설치; records without an image cannot ship
  let candidates = listItems.filter((it) => it.sourceCategory !== '입체·설치');
  const noImg = candidates.filter((it) => !it.hasImage).length;
  candidates = candidates.filter((it) => it.hasImage);
  console.log(`[scope] in-scope candidates=${candidates.length} (skipped 입체·설치=${tally['입체·설치'] || 0}, no-image=${noImg})`);
  if (MODE === 'probe') candidates = candidates.slice(0, PROBE_TARGET);

  const prog = MODE === 'full' ? loadProgress() : { artworks: {} };
  let done = 0, ok = 0, skip = 0, fail = 0;
  const artworks = [];
  for (const it of candidates) {
    done++;
    const id = `${SLUG}-${it.dataNo}`;
    if (prog.artworks[id]) { artworks.push(prog.artworks[id]); ok++; continue; }
    try {
      await sleep(280); // ~3.5 rps incl. image fetch
      const sourceUrl = `${BASE}/moca/collection1/view?bbsNo=9&dataNo=${it.dataNo}`;
      const detail = parseDetail(await fetchText(sourceUrl), it.dataNo);
      const srcCat = it.sourceCategory || regCategory(detail.objectNumber);
      const category = mapCategory(srcCat, detail.medium);
      if (!category) { skip++; continue; }                       // 뉴미디어 that is a 3D object, etc.
      if (!detail.title || !detail.artist || detail.year == null) { skip++; console.log(`  [min4-drop] ${id} title=${!!detail.title} artist=${!!detail.artist} year=${detail.year}`); continue; }
      if (!detail.imageUrl) { skip++; continue; }
      const imageUrl = await processImage(detail, category, id);
      const w = {
        id,
        objectNumber: detail.objectNumber,
        title: detail.title,
        artist: detail.artist,
        date: detail.dateStr,
        year: detail.year,
        medium: detail.medium,
        dimensions: detail.dimensions,
        category,
        description: detail.description,
        imageUrl,
        thumbnailUrl: detail.imageUrl,
        onDisplay: false,
        displayLocation: '',
        sourceUrl,
        metadata: { sourceCategory: it.sourceCategory, dataNo: it.dataNo },
        original_imageUrl: detail.imageUrl,
      };
      artworks.push(w);
      ok++;
      if (MODE === 'full') { prog.artworks[id] = w; if (ok % 20 === 0) saveProgress(prog); }
    } catch (e) {
      const msg = String(e.message || e);
      if (/bw-print/.test(msg)) { skip++; console.log(`  [skip] ${id}: ${msg}`); }
      else {
        fail++;
        fs.appendFileSync(FAILED, JSON.stringify({ id, dataNo: it.dataNo, err: msg }) + '\n');
        console.log(`  [fail] ${id}: ${msg}`);
      }
    }
    if (done % 25 === 0) console.log(`  …${done}/${candidates.length} (ok ${ok}, skip ${skip}, fail ${fail})`);
  }
  if (MODE === 'full') saveProgress(prog);

  artworks.sort((a, b) => Number(b.metadata.dataNo) - Number(a.metadata.dataNo));
  writeCollection(artworks, MODE === 'probe' ? `${COLLECTION_STEM}-probe` : COLLECTION_STEM);
  console.log(`[${MODE}] DONE. ok=${ok} skip=${skip} fail=${fail} / candidates=${candidates.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
