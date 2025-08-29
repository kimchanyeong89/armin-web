#!/usr/bin/env node
// Scrape National Gallery Room page for item links, then visit each item to extract
// title, artist, date, dimensions, and og:image. Outputs a JSON file.
// Usage:
//   node scripts/scrape-ng-room2.cjs <roomUrl> <outJson> [max]
// Example:
//   node scripts/scrape-ng-room2.cjs \
//     https://www.nationalgallery.org.uk/visiting/floorplans/level-2/room-2 \
//     scripts/output/ng-room2.json 50

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

function absolute(url, base){
  if (!url) return null;
  if (url.startsWith('http')) return url;
  if (url.startsWith('//')) return `https:${url}`;
  try { return new URL(url, base).toString(); } catch { return null; }
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

async function tryAcceptCookies(page){
  try { await page.waitForSelector('#onetrust-accept-btn-handler', { timeout: 5000 }); await page.click('#onetrust-accept-btn-handler'); await page.waitForTimeout(300); } catch {}
}

async function extractRoomItemLinks(page){
  // Collect candidate painting links on the room page; we'll validate per-item later by checking Location = Room 2
  const items = await page.$$eval('a[href*="/paintings/"]', (els) => {
    const base = location.origin;
    const seen = new Set();
    const out = [];
    for (const a of els){
      let href = a.getAttribute('href');
      if (!href) continue;
      if (!href.startsWith('http')) href = base + href;
      if (!href.includes('/paintings/')) continue;
      // Skip obvious hub/collection promo pages that are not single artwork records
      const badSlugs = ['search-the-collection','must-sees','latest-arrivals','picture-of-the-month','residency-programmes'];
      if (badSlugs.some(s => href.endsWith('/' + s))) continue;
      if (seen.has(href)) continue;
      seen.add(href);
      const title = (a.getAttribute('title') || a.textContent || '').trim();
      out.push({ href, title });
    }
    return out;
  });
  return items;
}

async function extractItemMeta(browser, itemUrl){
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');
  await page.goto(itemUrl, { waitUntil: 'networkidle2', timeout: 90000 });
  await tryAcceptCookies(page);
  // try to wait a bit for content
  try { await page.waitForSelector('main', { timeout: 15000 }); } catch {}

  let data = await page.evaluate(() => {
    function text(el){ return (el && (el.textContent || '').trim()) || ''; }
    const out = { title: '', artist: '', date: '', dimension: '', location: '', ogImage: '' };
    function cleanTitle(raw, artist, dateStr){
      const s = (raw || '').trim();
      if (!s) return s;
      // If quoted title exists, extract
      const mQ = s.match(/'([^']+)'/);
      if (mQ) return mQ[1].trim();
      // Drop leading artist prefix like "Artist, Title, 1511"
      if (artist && s.toLowerCase().startsWith(artist.toLowerCase()+',')){
        const after = s.slice(artist.length + 1).trim();
        // remove trailing commas/years
        return after.replace(/,\s*\d{3,4}.*$/, '').trim();
      }
      // Remove trailing year phrases
      return s.replace(/,\s*(about\s*)?\d{3,4}([–-]\d{1,4})?.*$/i, '').trim();
    }
    // Title
  const h1 = text(document.querySelector('h1')) || text(document.querySelector('[itemprop="name"], .page-title h1'));
  out.title = h1;
    // Artist
    out.artist = text(document.querySelector('[itemprop="creator"], a[href*="/artists/"]'));
    // Date & Dimensions from dt/dd
    const dls = Array.from(document.querySelectorAll('dt'));
    for (const dt of dls){
      const key = text(dt).toLowerCase();
      const dd = dt.nextElementSibling;
      const val = text(dd);
      // Only accept actual artwork 'Date', ignore 'Artist dates'
      const isArtistDates = key.includes('artist') && key.includes('date');
      if (!isArtistDates && (key === 'date' || (/\bdate\b/.test(key) && !key.includes('artist'))) && !out.date) {
        out.date = val;
      }
      if ((key.includes('dimensions') || key.includes('dimension')) && !out.dimension) out.dimension = val;
      if ((key.includes('location') || key.includes('room')) && !out.location) out.location = val;
    }
    // Fallbacks
    if (!out.date){
      const dateEl = document.querySelector('[itemprop="dateCreated"], time[itemprop="dateCreated"], time[datetime]');
      out.date = text(dateEl);
    }
    if (!out.artist){
      const metaBy = document.querySelector('meta[name="author"]');
      if (metaBy) out.artist = metaBy.getAttribute('content') || '';
    }
    // Prefer og:image unless it's the known placeholder; else fallback to main > figure img
    const ogImg = document.querySelector('meta[property="og:image"]');
    out.ogImage = ogImg ? (ogImg.getAttribute('content') || '') : '';
    const isPlaceholder = /imaginarium\.png/i.test(out.ogImage || '');
    if (!out.ogImage || isPlaceholder){
      const visImg = document.querySelector('main figure img[src*="/media/"]') || document.querySelector('main img[src*="/media/"]') || document.querySelector('main img[data-src*="/media/"]');
      if (visImg) out.ogImage = visImg.getAttribute('src') || visImg.getAttribute('data-src') || out.ogImage;
    }
    // Final cleanup for title: ensure we only keep the work title
    out.title = cleanTitle(out.title, out.artist, out.date);
    return out;
  });

  // If no image was captured via DOM, try querying meta again after a short wait
  if (!data.ogImage) {
    try {
      await page.waitForTimeout(500);
      const retryUrl = await page.evaluate(() => {
  const visImg = document.querySelector('figure img[src*="/media/"]') || document.querySelector('img[src*="/media/"]') || document.querySelector('img[data-src*="/media/"]');
  if (visImg) return visImg.getAttribute('src') || visImg.getAttribute('data-src') || '';
  const ogImg = document.querySelector('meta[property="og:image"]');
  return ogImg ? (ogImg.getAttribute('content') || '') : '';
      });
      if (retryUrl) data.ogImage = retryUrl;
    } catch {}
  }

  await page.close();
  return data;
}

async function main(){
  const roomUrl = process.argv[2] || 'https://www.nationalgallery.org.uk/visiting/floorplans/level-2/room-2';
  const outJson = process.argv[3] || path.join('scripts', 'output', 'ng-room2.json');
  const max = parseInt(process.argv[4] || '50', 10);

  const browser = await puppeteer.launch({ headless: 'new', timeout: 120000 });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1366, height: 900 });
  await page.goto(roomUrl, { waitUntil: 'networkidle2', timeout: 90000 });
  await tryAcceptCookies(page);
  try { await page.waitForSelector('a[href*="/paintings/"]', { timeout: 20000 }); } catch {}

  const links = (await extractRoomItemLinks(page)).slice(0, max);
  await page.close();

  const items = [];
  const blocklist = new Set([
    // Known not-in-Room-2 at the time of writing; avoid false positives from hub page links
    'sebastiano-del-piombo-portrait-of-a-lady'
  ]);
  let idx = 0;
  for (const it of links){
    idx += 1;
    const href = absolute(it.href, roomUrl);
    const slug = slugFromPaintingUrl(href) || `room2-${String(idx).padStart(3,'0')}`;
    try {
      const meta = await extractItemMeta(browser, href);
  const loc = (meta.location || '').toLowerCase();
  // Match "Room 2" with word boundary after 2 to avoid matching Room 20, 21, etc.
  const isRoom2 = /(^|\b)room\s*2(\b|$)/i.test(loc);
      if (!isRoom2) {
        console.log('skip (not room 2):', slug, 'loc=', meta.location);
        continue;
      }
      if (blocklist.has(slug)) {
        console.log('skip (blocklisted for room 2):', slug);
        continue;
      }
      items.push({
        id: slug,
        name: meta.title || it.title || slug,
        artist: meta.artist || '',
        date: meta.date || '',
        dimension: meta.dimension || '',
        image: absolute(meta.ogImage, href),
        sourceUrl: href,
        roomId: '2'
      });
      console.log('ok:', slug);
    } catch (e){
      console.warn('fail:', slug, e.message);
    }
  }

  const payload = { room: '2', source: roomUrl, count: items.length, items };
  const outDir = path.dirname(outJson);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outJson, JSON.stringify(payload, null, 2));
  console.log('Wrote', outJson);
  await browser.close();
}

main().catch(err => { console.error(err); process.exit(1); });

