#!/usr/bin/env node
// Scrape National Gallery "Search the collection" results for images and download them locally.
// Usage: node scripts/scrape-ng-room1.js "search query or URL" ./downloads 20

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

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

async function scrapeSearchPage(browser, url){
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle2' });
  const body = await page.content();
  await page.close();

  const $ = cheerio.load(body);
  const imgs = [];

  // National Gallery uses images inside figure img or meta og:image on item pages. On results page, thumbnails are inside .search-result__image img
  $('.search-result__image img').each((i, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src');
    if (src) imgs.push(src.startsWith('http') ? src : `https:${src}`);
  });

  // fallback: links to item pages; try to get og:image from those pages
  const itemLinks = $('.search-result__link').map((i, el) => $(el).attr('href')).get().filter(Boolean).map(h => h.startsWith('http') ? h : `https://www.nationalgallery.org.uk${h}`);

  return { imgs, itemLinks };
}

async function scrapeItemForImage(browser, itemUrl){
  try{
    const page = await browser.newPage();
    await page.goto(itemUrl, { waitUntil: 'networkidle2' });
    const body = await page.content();
    await page.close();

    const $ = cheerio.load(body);
    const og = $('meta[property="og:image"]').attr('content');
    if (og) return og.startsWith('http') ? og : `https:${og}`;
    const fig = $('figure img').first().attr('src');
    if (fig) return fig.startsWith('http') ? fig : `https:${fig}`;
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
  if (!arg) { console.error('Usage: node scripts/scrape-ng-room1.js "query or url" <outDir> <max>'); process.exit(1); }

  await ensureDir(outDir);

  // If arg looks like a URL, use it; otherwise build a search URL
  let startUrl = arg;
  if (!/^https?:\/\//i.test(arg)){
    const q = encodeURIComponent(arg);
    startUrl = `https://www.nationalgallery.org.uk/search?searchTerm=${q}`;
  }

  const browser = await puppeteer.launch();

  console.log('Scraping', startUrl);
  const { imgs: pageImgs, itemLinks } = await scrapeSearchPage(browser, startUrl);
  const found = new Set(pageImgs);

  // try item links to find higher-res images
  const limit = pLimit(5);
  await Promise.all(itemLinks.map(link => limit(async () => {
    if (found.size >= limitNum) return;
    const img = await scrapeItemForImage(browser, link);
    if (img) found.add(img);
  })));

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