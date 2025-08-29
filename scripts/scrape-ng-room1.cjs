#!/usr/bin/env node
// Scrape National Gallery "Search the collection" results for images and download them locally.
// Usage: node scripts/scrape-ng-room1.cjs "search query or URL" ./downloads 20

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

async function ensureDir(dir){
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const { pipeline } = require('stream');
const { promisify } = require('util');
const streamPipeline = promisify(pipeline);

async function download(url, dest){
  const res = await fetch(url, { timeout: 20000 });
  if (!res.ok) throw new Error(`Unexpected response ${res.status} ${res.statusText}`);
  await streamPipeline(res.body, fs.createWriteStream(dest));
}

async function tryAcceptCookies(page){
  try{
    // OneTrust default accept button id often used
    await page.waitForSelector('#onetrust-accept-btn-handler', { timeout: 5000 });
    await page.click('#onetrust-accept-btn-handler');
    await page.waitForTimeout(500);
    return true;
  }catch{}
  // Try other common selectors/texts
  try{
    const btn = await page.$x("//button[contains(., 'Accept') or contains(., '동의') or contains(., 'Agree')] ");
    if (btn && btn[0]) { await btn[0].click(); await page.waitForTimeout(500); return true; }
  }catch{}
  return false;
}

async function scrapeSearchPage(browser, url){
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1366, height: 768 });
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
  await tryAcceptCookies(page);
  // If it's a floorplan room page, extract painting links directly
  if (/\/visiting\/floorplans\//.test(url)){
    try { await page.waitForSelector('a[href*="/paintings/"]', { timeout: 20000 }); } catch {}
    const list = await page.$$eval('a[href*="/paintings/"]', (els) => {
      const base = location.origin;
      const set = new Set();
      for (const a of els) {
        let href = a.getAttribute('href');
        if (!href) continue;
        if (!href.startsWith('http')) href = base + href;
        if (href.includes('/paintings/')) set.add(href.split('#')[0]);
      }
      return Array.from(set);
    });
    await page.close();
    console.log(`Floorplan page: found ${list.length} painting links`);
    return { itemLinks: list };
  }
  // try to auto-scroll to load dynamic results
  try{
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let total = 0;
        const distance = 800;
        const timer = setInterval(() => {
          const h = document.body.scrollHeight;
          window.scrollBy(0, distance);
          total += distance;
          if (total >= h * 2) { // scroll beyond height twice
            clearInterval(timer);
            resolve();
          }
        }, 300);
      });
    });
  }catch{}
  // small wait for network idle after scroll
  try { await page.waitForNetworkIdle({ timeout: 15000 }); } catch {}
  // Extract painting links directly in the browser context
  const list = await page.$$eval('a[href*="/paintings/"]', (els) => {
    const base = location.origin;
    const set = new Set();
    for (const a of els) {
      let href = a.getAttribute('href');
      if (!href) continue;
      if (!href.startsWith('http')) href = base + href;
      if (href.includes('/paintings/')) set.add(href.split('#')[0]);
    }
    return Array.from(set);
  });
  await page.close();
  console.log(`Found ${list.length} candidate item links on results page`);
  return { itemLinks: list };
}

function extractRoomNumberFromText(text){
  const m = text.match(/\bRoom\s*(\d{1,3})\b/i);
  return m ? m[1] : null;
}

async function scrapeItemForImage(browser, itemUrl){
  try{
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');
    await page.goto(itemUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await tryAcceptCookies(page);
    // Grab body text for room extraction
    const { bodyText, ogUrl, figUrl } = await page.evaluate(() => {
      const getMeta = (sel) => {
        const el = document.querySelector(sel);
        return el && (el.content || el.getAttribute('content'));
      };
      const og = getMeta('meta[property="og:image"]');
      const fig = document.querySelector('figure img');
      const figSrc = fig && (fig.getAttribute('src') || fig.getAttribute('data-src'));
      return { bodyText: document.body.innerText || document.body.textContent || '', ogUrl: og || null, figUrl: figSrc || null };
    });
    const room = extractRoomNumberFromText((bodyText || '').replace(/\s+/g, ' '));
    const ogAbs = ogUrl ? (ogUrl.startsWith('http') ? ogUrl : `https:${ogUrl}`) : null;
    const figAbs = figUrl ? (figUrl.startsWith('http') ? figUrl : `https:${figUrl}`) : null;
    await page.close();
    const img = ogUrl || figUrl;
    const resolved = ogAbs || figAbs;
    if (resolved) return { img: resolved, room };
  }catch(e){
    // ignore
  }
  return null;
}

async function main(){
  const { default: pLimit } = await import('p-limit');
  const arg = process.argv[2];
  const outDir = process.argv[3] || './downloads';
  const limitNum = parseInt(process.argv[4] || '20', 10);
  const targetRoom = (process.argv[5] || process.env.ROOM || '1').toString();
  if (!arg) { console.error('Usage: node scripts/scrape-ng-room1.cjs "query or url" <outDir> <max>'); process.exit(1); }

  await ensureDir(outDir);

  // If arg looks like a URL, use it; otherwise build a search URL
  let startUrl = arg;
  if (!/^https?:\/\//i.test(arg)){
    const q = encodeURIComponent(arg);
    startUrl = `https://www.nationalgallery.org.uk/search?searchTerm=${q}`;
  }

  const browser = await puppeteer.launch({ headless: 'new', timeout: 120000 });

  console.log('Scraping', startUrl, `| target Room: ${targetRoom}`);
  const { itemLinks } = await scrapeSearchPage(browser, startUrl);
  const found = new Set();

  // try item links to find higher-res images
  const limit = pLimit(5);
  await Promise.all(itemLinks.map(link => limit(async () => {
    if (found.size >= limitNum) return;
    const res = await scrapeItemForImage(browser, link);
    if (res) {
      if (res.room === targetRoom) {
        found.add(res.img);
        console.log(`Room ${res.room} match:`, link);
      } else {
        // console.log(`Skip Room ${res.room || '-'}:`, link);
      }
    }
  })));
  console.log(`After filtering by Room ${targetRoom}, found ${found.size} image URLs`);

  await browser.close();

  // fallback: if still not enough, try pagination (naive)
  // not implementing complex pagination — user can supply a URL with page params if needed

  const list = Array.from(found).slice(0, limitNum);
  console.log(`Found ${list.length} images; downloading to ${outDir}`);

  let idx = 0;
  await Promise.all(list.map(url => limit(async () => {
    idx += 1;
    const ext = path.extname(url).split('?')[0] || '.jpg';
    const filename = `ng-room1-${String(idx).padStart(3,'0')}${ext}`;
    const dest = path.join(outDir, filename);
    try{
      console.log('Downloading', url, '->', filename);
      await download(url, dest);
    }catch(e){
      console.warn('Failed', url, e.message);
    }
  })));
  console.log('Done');
}

main().catch(err => { console.error(err); process.exit(1); });
