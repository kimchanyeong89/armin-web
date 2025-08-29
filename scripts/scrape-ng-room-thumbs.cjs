#!/usr/bin/env node
// Scrape a National Gallery floorplan room page for painting links and thumbnails only.
// Saves thumbnails locally and writes index.json with {id, title, itemUrl, thumbPath, remoteImageUrl}.
// Usage: node scripts/scrape-ng-room-thumbs.cjs <roomUrl> <outDir> [max] [roomNumber]

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { pipeline } = require('stream');
const { promisify } = require('util');
const streamPipeline = promisify(pipeline);
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

async function ensureDir(dir){
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function absolute(url, base){
  if (!url) return null;
  if (url.startsWith('http')) return url;
  if (url.startsWith('//')) return `https:${url}`;
  try{ return new URL(url, base).toString(); }catch{ return null; }
}

function slugFromPaintingUrl(u){
  try {
    const { pathname } = new URL(u);
    const i = pathname.indexOf('/paintings/');
    if (i >= 0) {
      const slug = pathname.slice(i + '/paintings/'.length).replace(/\/$/, '');
      return slug || null;
    }
  } catch {}
  return null;
}

async function tryAcceptCookies(page){
  try{ await page.waitForSelector('#onetrust-accept-btn-handler', { timeout: 5000 }); await page.click('#onetrust-accept-btn-handler'); await page.waitForTimeout(300);}catch{}
}

async function extractRoomItems(page){
  // Return array of { href, thumb, title }
  const items = await page.$$eval('a[href*="/paintings/"]', (els) => {
    const base = location.origin;
    const seen = new Set();
    const out = [];
    for (const a of els){
      let href = a.getAttribute('href');
      if (!href) continue;
      if (!href.startsWith('http')) href = base + href;
      if (!href.includes('/paintings/')) continue;
      if (seen.has(href)) continue;
      seen.add(href);
      const img = a.querySelector('img');
      const thumb = img ? (img.getAttribute('src') || img.getAttribute('data-src')) : null;
      const title = a.getAttribute('title') || (img && img.getAttribute('alt')) || a.textContent.trim();
      out.push({ href, thumb, title });
    }
    return out;
  });
  return items;
}

async function getRemoteImageUrl(browser, itemUrl){
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');
  await page.goto(itemUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  const og = await page.$eval('meta[property="og:image"]', el => el.getAttribute('content')).catch(() => null);
  await page.close();
  return og;
}

async function download(url, dest){
  const res = await fetch(url, { timeout: 20000 });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  await streamPipeline(res.body, fs.createWriteStream(dest));
}

async function main(){
  const roomUrl = process.argv[2];
  const outDir = process.argv[3] || './downloads/room';
  const max = parseInt(process.argv[4] || '20', 10);
  const roomNumber = (process.argv[5] || '1').toString();
  if (!roomUrl) { console.error('Usage: node scripts/scrape-ng-room-thumbs.cjs <roomUrl> <outDir> [max] [roomNumber]'); process.exit(1); }

  await ensureDir(outDir);

  const browser = await puppeteer.launch({ headless: 'new', timeout: 120000 });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1366, height: 800 });
  await page.goto(roomUrl, { waitUntil: 'networkidle2', timeout: 90000 });
  await tryAcceptCookies(page);
  try { await page.waitForSelector('a[href*="/paintings/"]', { timeout: 20000 }); } catch {}

  const items = (await extractRoomItems(page)).slice(0, max);
  await page.close();

  console.log(`Found ${items.length} painting links on room page`);
  const results = [];
  let idx = 0;
  for (const it of items){
    idx += 1;
    const href = absolute(it.href, roomUrl);
    const slug = slugFromPaintingUrl(href) || `room${roomNumber}-${String(idx).padStart(3,'0')}`;
    const title = it.title || slug;
    const thumbAbs = absolute(it.thumb, roomUrl);
    // get og:image for remote master link
    const remote = await getRemoteImageUrl(browser, href);
    const remoteAbs = absolute(remote, href);
    let thumbFile = null;
    if (thumbAbs){
      const ext = path.extname(thumbAbs).split('?')[0] || '.jpg';
      thumbFile = `ng-room${roomNumber}-${slug}-thumb${ext}`;
      const dest = path.join(outDir, thumbFile);
      try {
        console.log('Downloading thumb', thumbAbs, '->', thumbFile);
        await download(thumbAbs, dest);
      } catch(e){ console.warn('Thumb failed', thumbAbs, e.message); thumbFile = null; }
    }
    results.push({ id: slug, title, itemUrl: href, thumbPath: thumbFile ? path.join(outDir, thumbFile) : null, remoteImageUrl: remoteAbs, room: roomNumber });
  }

  const indexPath = path.join(outDir, 'index.json');
  fs.writeFileSync(indexPath, JSON.stringify({ room: roomNumber, source: roomUrl, items: results }, null, 2));
  console.log('Wrote', indexPath);

  await browser.close();
}

main().catch(err => { console.error(err); process.exit(1); });
