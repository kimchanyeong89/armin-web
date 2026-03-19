/**
 * British Museum official site scraper (paintings search)
 * - Source: https://www.britishmuseum.org/collection/search?object=painting
 * - Output: public/data/the-british-museum-collection.json
 * - Collects first N items (default 100) with metadata
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SEARCH_URL = 'https://www.britishmuseum.org/collection/search?object=painting';
const OUTPUT_PATH = path.join(__dirname, '../public/data/the-british-museum-collection.json');
const MAX_ITEMS = 100;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function slugify(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function pickField(fields, keys) {
  for (const key of keys) {
    const entry = Object.entries(fields).find(([k]) => k.toLowerCase().includes(key));
    if (entry && entry[1]) return entry[1];
  }
  return '';
}

function extractYear(dateText) {
  if (!dateText) return '';
  const match = dateText.match(/(-?\d{1,4})/);
  return match ? Number(match[1]) : '';
}

async function collectLinks(page) {
  return page.evaluate(() => {
    const links = new Set();
    document.querySelectorAll('a[href*="/collection/object/"]').forEach((a) => {
      const href = a.getAttribute('href');
      if (href) links.add(href.startsWith('http') ? href : `https://www.britishmuseum.org${href}`);
    });
    return Array.from(links);
  });
}

async function scrapeDetail(context, url) {
  const detail = await context.newPage();
  try {
    await detail.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await detail.waitForTimeout(1000);

    const data = await detail.evaluate(() => {
      const getMeta = (name) => {
        const el = document.querySelector(`meta[property="${name}"]`) || document.querySelector(`meta[name="${name}"]`);
        return el ? el.getAttribute('content') : '';
      };

      const title = (document.querySelector('h1')?.textContent || '').trim() || getMeta('og:title');
      const image = getMeta('og:image');
      const description = getMeta('og:description') || getMeta('description');

      const fields = {};
      document.querySelectorAll('dl').forEach((dl) => {
        const dts = dl.querySelectorAll('dt');
        const dds = dl.querySelectorAll('dd');
        dts.forEach((dt, i) => {
          const key = (dt.textContent || '').trim();
          const val = (dds[i]?.textContent || '').trim();
          if (key) fields[key] = val;
        });
      });

      return { title, image, description, fields };
    });

    const fields = data.fields || {};
    const artist = pickField(fields, ['artist', 'maker', 'production']);
    const dateText = pickField(fields, ['date', 'date made', 'date range']);
    const medium = pickField(fields, ['medium', 'materials', 'materials and techniques']);
    const room = pickField(fields, ['room', 'gallery']);

    return {
      title: data.title || 'Untitled',
      artist: artist || 'Unknown',
      year: extractYear(dateText),
      date: dateText || '',
      image: data.image || '',
      medium: medium || '',
      sourceUrl: url,
      room: room || '',
      description: data.description || '',
    };
  } catch (err) {
    console.error('Failed detail:', url, err.message);
    return null;
  } finally {
    await detail.close();
  }
}

async function run() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const page = await context.newPage();

  console.log('Opening search page...');
  await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

  console.log('If Cloudflare check appears, solve it in the browser, then press Enter in this terminal.');
  await new Promise((resolve) => process.stdin.once('data', resolve));

  let links = await collectLinks(page);
  let lastCount = 0;

  while (links.length < MAX_ITEMS) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(1500);
    links = await collectLinks(page);
    if (links.length === lastCount) break;
    lastCount = links.length;
  }

  const targetLinks = links.slice(0, MAX_ITEMS);
  console.log(`Collected ${targetLinks.length} links`);

  const objects = [];
  for (let i = 0; i < targetLinks.length; i++) {
    const url = targetLinks[i];
    console.log(`(${i + 1}/${targetLinks.length}) ${url}`);
    const item = await scrapeDetail(context, url);
    if (item) {
      const idBase = slugify(item.title || url);
      const id = `the-british-museum-${idBase || `item-${i + 1}`}`;
      objects.push({ id, ...item });
    }
  }

  const payload = {
    galleryId: 'the-british-museum',
    galleryName: 'The British Museum',
    coverImage: objects.find(o => o.image)?.image || null,
    partnerDescription: "The British Museum's collection spans over two million years of human history and culture.",
    scrapedAt: new Date().toISOString(),
    totalObjects: objects.length,
    videoCount: 0,
    excludedCount: 0,
    failedCount: Math.max(0, targetLinks.length - objects.length),
    objects,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2));
  console.log(`Saved ${objects.length} objects -> ${OUTPUT_PATH}`);

  await browser.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
