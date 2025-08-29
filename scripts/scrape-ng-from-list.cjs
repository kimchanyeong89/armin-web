#!/usr/bin/env node
// Scrape National Gallery painting metadata/images from a provided list of painting URLs.
// Usage:
//   node scripts/scrape-ng-from-list.cjs <listPath> <outJson> <roomId> [max]

const fs = require('fs');
const path = require('path');
let got = require('got');
if (got.default) got = got.default;
const cheerio = require('cheerio');

const LIST_PATH = process.argv[2];
const OUT_JSON = process.argv[3] || path.join('scripts', 'output', 'ng-room.json');
const ROOM_ID = String(process.argv[4] || '').trim();
const MAX = parseInt(process.argv[5] || '999', 10);

if (!LIST_PATH || !ROOM_ID) {
  console.error('Usage: node scripts/scrape-ng-from-list.cjs <listPath> <outJson> <roomId> [max]');
  process.exit(1);
}

function absolute(url, base) {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  if (url.startsWith('//')) return `https:${url}`;
  try { return new URL(url, base).toString(); } catch { return null; }
}

function cleanTitle(raw, artist) {
  let s = (raw || '').trim();
  if (!s) return s;
  const mQ = s.match(/'([^']+)'/);
  if (mQ) {
    s = mQ[1].trim();
  } else if (artist && s.toLowerCase().startsWith(artist.toLowerCase() + ',')) {
    s = s.slice(artist.length + 1).trim();
  }
  s = s.replace(/,\s*(about\s*)?\d{3,4}([–-]\d{1,4})?.*$/i, '').trim();
  s = s.replace(/\s+/g, ' ').trim();
  if (/\(\s*$/.test(s)) s = s.replace(/\(\s*$/, '').trim();
  if (/[,;:.]\s*$/.test(s)) s = s.replace(/[,;:.]\s*$/, '').trim();
  return s;
}

async function fetchHtml(url) {
  const res = await got(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36' } });
  return res.body;
}

function extractDl($, root) {
  const out = { date: '', dimension: '', location: '' };
  $(root).find('dt').each((_, dt) => {
    const key = $(dt).text().trim().toLowerCase();
    const val = $(dt).next('dd').text().trim();
    const isArtistDates = key.includes('artist') && key.includes('date');
    if (!isArtistDates && (key === 'date' || (key.includes('date') && !key.includes('artist'))) && !out.date) out.date = val;
    if ((key.includes('dimensions') || key.includes('dimension')) && !out.dimension) out.dimension = val;
    if ((key.includes('location') || key.includes('room')) && !out.location) out.location = val;
  });
  return out;
}

function pickImage($, baseUrl, expectedTitle) {
  try {
    const ld = [];
    $('script[type="application/ld+json"]').each((_, el) => {
      const txt = $(el).contents().text();
      if (!txt) return;
      try { const obj = JSON.parse(txt); ld.push(obj); } catch {}
    });
    for (const node of ld) {
      if (node && node.image) {
        if (typeof node.image === 'string') return absolute(node.image, baseUrl);
        if (Array.isArray(node.image) && node.image.length) return absolute(node.image[0], baseUrl);
        if (node.image && node.image.url) return absolute(node.image.url, baseUrl);
      }
      if (node && Array.isArray(node['@graph'])) {
        for (const g of node['@graph']) {
          if (g && g.image) {
            if (typeof g.image === 'string') return absolute(g.image, baseUrl);
            if (Array.isArray(g.image) && g.image.length) return absolute(g.image[0], baseUrl);
            if (g.image && g.image.url) return absolute(g.image.url, baseUrl);
          }
        }
      }
    }
  } catch {}
  let img = $('meta[property="og:image"]').attr('content') || '';
  const isPlaceholder = /imaginarium\.png/i.test(img || '');
  if (!img || isPlaceholder) {
    const candidates = [];
    $('main img[src*="/media/"], main img[data-src*="/media/"]').each((_, el) => {
      const $el = $(el);
      const src = $el.attr('src') || $el.attr('data-src') || '';
      if (!src) return;
      const alt = ($el.attr('alt') || '').trim();
      const mW = src.match(/[?&]width=(\d+)/);
      const width = mW ? parseInt(mW[1], 10) : 0;
      const t = (expectedTitle || '').toLowerCase();
      const a = alt.toLowerCase();
      let score = 0;
      if (t && a) {
        const tn = t.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
        const an = a.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
        if (tn && an && an.includes(tn)) score += 3;
      }
      score += Math.min(width / 400, 2);
      candidates.push({ src, width, score });
    });
    if (candidates.length) {
      candidates.sort((x, y) => y.score - x.score || y.width - x.width);
      img = candidates[0].src || img;
    }
  }
  return absolute(img, baseUrl);
}

async function extractPainting(url) {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  const h1 = $('h1').first().text().trim() || $('[itemprop="name"], .page-title h1').first().text().trim();
  const artist = $('[itemprop="creator"], a[href*="/artists/"]').first().text().trim();
  const dl = extractDl($, $.root());
  const title = cleanTitle(h1, artist);
  const image = pickImage($, url, title);
  return { title, artist, date: dl.date, dimension: dl.dimension, location: dl.location, image };
}

function slugFromPaintingUrl(u) {
  try {
    const { pathname } = new URL(u);
    const i = pathname.indexOf('/paintings/');
    if (i >= 0) return pathname.slice(i + '/paintings/'.length).replace(/\/$/, '') || null;
  } catch {}
  return null;
}

function loadList(p) {
  const raw = fs.readFileSync(p, 'utf8');
  try {
    const data = JSON.parse(raw);
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.items)) return data.items;
  } catch {}
  // Fallback: newline-delimited
  return raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}

(async function main(){
  const urls = loadList(LIST_PATH).filter(u => typeof u === 'string' && u.includes('/paintings/'));
  const limited = urls.slice(0, MAX);
  const items = [];
  const isNumericRoom = /^\d+$/.test(ROOM_ID);
  const matchRoom = (loc) => {
    if (!loc) return true; // if page doesn't expose location, keep
    if (isNumericRoom) {
      const re = new RegExp(`(^|\\b)room\\s*${ROOM_ID}(\\b|$)`, 'i');
      return re.test(loc);
    }
    // Special mapping: Central Hall => roomId 'C'
    if (ROOM_ID.toLowerCase() === 'c') {
      if (/\bcentral\s*hall\b/i.test(loc)) return true;
      if (/(^|\b)room\s*c(\b|$)/i.test(loc)) return true;
      return false;
    }
    // Fallback: generic "room <id>" match
    const re = new RegExp(`(^|\\b)room\\s*${ROOM_ID}(\\b|$)`, 'i');
    return re.test(loc);
  };

  for (const href of limited) {
    try {
      const meta = await extractPainting(href);
  const loc = (meta.location || '').toLowerCase();
  if (!matchRoom(loc)) continue; // skip if explicitly different room
      const id = slugFromPaintingUrl(href);
      if (!id) continue;
      items.push({
        id,
        name: meta.title,
        artist: meta.artist,
        date: meta.date,
        dimension: meta.dimension,
        image: meta.image,
        sourceUrl: href,
        roomId: String(ROOM_ID)
      });
    } catch (e) {
      // ignore one-off failures
    }
  }
  // Deduplicate by id
  const dedup = [];
  const seen = new Set();
  for (const it of items) { if (!seen.has(it.id)) { seen.add(it.id); dedup.push(it); } }
  // Sort stable
  dedup.sort((a,b)=> (a.name||'').localeCompare((b.name||'')));
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify({ room: String(ROOM_ID), source: LIST_PATH, count: dedup.length, items: dedup }, null, 2));
  console.log('Wrote', OUT_JSON, 'with', dedup.length, 'items from', dedup.length, 'links');
})().catch(err => { console.error(err); process.exit(1); });
