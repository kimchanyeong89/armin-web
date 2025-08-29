#!/usr/bin/env node
// Fast scraper for National Gallery Room 2 using HTTP + cheerio (no headless browser)
// Usage:
//   node scripts/scrape-ng-room2-fast.cjs <roomUrl> <outJson> [max]

const fs = require('fs');
const path = require('path');
let got = require('got');
if (got.default) got = got.default;
const cheerio = require('cheerio');
let pLimit = require('p-limit');
if (pLimit.default) pLimit = pLimit.default;

const ROOM_URL = process.argv[2] || 'https://www.nationalgallery.org.uk/visiting/floorplans/level-2/room-2';
const OUT_JSON = process.argv[3] || path.join('scripts', 'output', 'ng-room2.json');
const MAX = parseInt(process.argv[4] || '100', 10);
// Expected room number: infer from URL (room-<n>) or use CLI arg #5
let EXPECT_ROOM = process.argv[5] || null;
if (!EXPECT_ROOM) {
  const m = ROOM_URL.match(/room-(\d+)/i);
  if (m) EXPECT_ROOM = m[1];
}
if (!EXPECT_ROOM) EXPECT_ROOM = '2';

function absolute(url, base) {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  if (url.startsWith('//')) return `https:${url}`;
  try { return new URL(url, base).toString(); } catch { return null; }
}

function cleanTitle(raw, artist, dateStr) {
  const s = (raw || '').trim();
  if (!s) return s;
  const mQ = s.match(/'([^']+)'/); // 'Title'
  if (mQ) {
    s = mQ[1].trim();
  } else if (artist && s.toLowerCase().startsWith(artist.toLowerCase() + ',')) {
    s = s.slice(artist.length + 1).trim();
  }
  // strip trailing date snippets that sometimes follow title
  s = s.replace(/,\s*(about\s*)?\d{3,4}([–-]\d{1,4})?.*$/i, '').trim();
  // collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();
  // remove dangling '('
  if (/\(\s*$/.test(s)) s = s.replace(/\(\s*$/, '').trim();
  // remove trailing punctuation like commas/semicolons/colons/periods
  if (/[,;:.]\s*$/.test(s)) s = s.replace(/[,;:.]\s*$/, '').trim();
  return s;
}

async function fetchHtml(url) {
  const res = await got(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36' } });
  return res.body;
}

async function extractRoomLinks(roomUrl) {
  const tryExtract = async (urlToFetch) => {
    const html = await fetchHtml(urlToFetch);
    const $ = cheerio.load(html);
    const list = [];
    const seenLocal = new Set();
    $('a[href*="/paintings/"]').each((_, el) => {
      const href = absolute($(el).attr('href'), urlToFetch);
      if (!href) return;
      if (/\/paintings\/(search-the-collection|must-sees|latest-arrivals|picture-of-the-month|residency-programmes)\b/i.test(href)) return;
      if (seenLocal.has(href)) return;
      seenLocal.add(href);
      list.push(href);
    });
    return list;
  };

  // 1) Try the standard page
  let links = await tryExtract(roomUrl);
  // 2) Fallback to AMP variants if nothing found
  if (!links.length) {
    const ampCandidates = [];
    if (!roomUrl.includes('?amp')) ampCandidates.push(roomUrl + (roomUrl.includes('?') ? '&amp' : '?amp'));
    if (!roomUrl.endsWith('/amp')) ampCandidates.push(roomUrl.replace(/\/?$/, '/amp'));
    for (const ampUrl of ampCandidates) {
      try {
        const l2 = await tryExtract(ampUrl);
        if (l2.length) { links = l2; break; }
      } catch {}
    }
  }

  // Deduplicate and cap
  let uniq = Array.from(new Set(links));
  if (!uniq.length) {
    // Fallback: use existing JSON output as seed if available
    try {
      if (fs.existsSync(OUT_JSON)) {
        const raw = fs.readFileSync(OUT_JSON, 'utf8');
        const data = JSON.parse(raw);
        if (data && Array.isArray(data.items)) {
          uniq = Array.from(new Set(data.items.map(it => it.sourceUrl).filter(Boolean)));
        }
      }
    } catch {}
  }
  // Final fallback: seed file at scripts/seed/ng-room<room>.json
  if (!uniq.length) {
    try {
      const m = roomUrl.match(/room-(\d+)/i);
      const rid = m ? m[1] : EXPECT_ROOM;
      const seedPath = path.join('scripts', 'seed', `ng-room${rid}-seed.json`);
      if (fs.existsSync(seedPath)) {
        const raw = fs.readFileSync(seedPath, 'utf8');
        const data = JSON.parse(raw);
        if (data && Array.isArray(data.items)) {
          uniq = Array.from(new Set(data.items.filter(u => typeof u === 'string' && u.includes('/paintings/'))));
        }
      }
    } catch {}
  }
  return uniq.slice(0, MAX);
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
  // 1) Try JSON-LD image (most reliable per-work)
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
      // Some pages nest under @graph
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
  // Prefer og:image unless placeholder
  let img = $('meta[property="og:image"]').attr('content') || '';
  const isPlaceholder = /imaginarium\.png/i.test(img || '');
  if (!img || isPlaceholder) {
    // Build candidates from main content images
    const candidates = [];
    $('main img[src*="/media/"], main img[data-src*="/media/"]').each((_, el) => {
      const $el = $(el);
      const src = $el.attr('src') || $el.attr('data-src') || '';
      if (!src) return;
      const alt = ($el.attr('alt') || '').trim();
      // width hint from query param
      const mW = src.match(/[?&]width=(\d+)/);
      const width = mW ? parseInt(mW[1], 10) : 0;
      // score by alt/title similarity
      const t = (expectedTitle || '').toLowerCase();
      const a = alt.toLowerCase();
      let score = 0;
      if (t && a) {
        // loose contains ignoring punctuation
        const tn = t.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
        const an = a.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
        if (tn && an && an.includes(tn)) score += 3;
      }
      score += Math.min(width / 400, 2); // prefer larger image a bit
      candidates.push({ src, alt, width, score });
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
  const title = cleanTitle(h1, artist, dl.date);
  const image = pickImage($, url, title);
  return { title, artist, date: dl.date, dimension: dl.dimension, location: dl.location, image };
}

function slugFromPaintingUrl(u){
  try {
    const { pathname } = new URL(u);
    const i = pathname.indexOf('/paintings/');
    if (i >= 0){
      const slug = pathname.slice(i + '/paintings/'.length).replace(/\/$/, '');
      return slug || null;
    }
  } catch {}
  return null;
}

async function main(){
  const links = await extractRoomLinks(ROOM_URL);
  const limit = pLimit(6); // parallel but polite
  const results = await Promise.all(links.map(href => limit(async () => {
    try {
      const meta = await extractPainting(href);
      const loc = (meta.location || '').toLowerCase();
      const re = new RegExp(`(^|\\b)room\\s*${EXPECT_ROOM}(\\b|$)`, 'i');
      // Keep if location explicitly matches, or if location is unavailable (trust room list)
      if (loc && !re.test(loc)) return null;
      const id = slugFromPaintingUrl(href);
      return {
        id,
        name: meta.title,
        artist: meta.artist,
        date: meta.date,
        dimension: meta.dimension,
        image: meta.image,
        sourceUrl: href,
        roomId: String(EXPECT_ROOM)
      };
    } catch (e){
      return null;
    }
  })));

  const items = results.filter(Boolean);
  // Deduplicate by id
  const dedup = [];
  const seen = new Set();
  for (const it of items) { if (!seen.has(it.id)) { seen.add(it.id); dedup.push(it); } }
  // Sort by name for stability
  dedup.sort((a,b)=> (a.name||'').localeCompare(b.name||''));

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify({ room: String(EXPECT_ROOM), source: ROOM_URL, count: dedup.length, items: dedup }, null, 2));
  console.log('Wrote', OUT_JSON, 'with', dedup.length, 'items');
}

main().catch(err => { console.error(err); process.exit(1); });
