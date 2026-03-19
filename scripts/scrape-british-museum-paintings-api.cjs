/**
 * British Museum official site API scraper (paintings)
 * - Uses internal /api/_search endpoint (no per-item pages)
 * - Collects first N items (default 100) with metadata
 * - Output: public/data/the-british-museum-collection.json
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SEARCH_PAGE = 'https://www.britishmuseum.org/collection/search?object=painting';
const API_BASE = 'https://www.britishmuseum.org/api/_search';
const OUTPUT_PATH = path.join(__dirname, '../public/data/the-british-museum-collection.json');
const MAX_ITEMS = 100;
const WAIT_FOR_API_MS = 60000;

function extractItems(payload) {
  if (!payload || typeof payload !== 'object') return [];
  if (Array.isArray(payload)) return payload;

  const candidates = ['records', 'results', 'items', 'objects', 'data'];
  for (const key of candidates) {
    if (Array.isArray(payload[key])) return payload[key];
  }

  // Some APIs nest under `data.records` etc.
  for (const key of candidates) {
    if (payload.data && Array.isArray(payload.data[key])) return payload.data[key];
  }

  return [];
}

function getField(item, keys) {
  for (const key of keys) {
    if (item && item[key] !== undefined && item[key] !== null && String(item[key]).trim() !== '') {
      return item[key];
    }
  }
  return '';
}

function cleanText(value) {
  if (!value) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function extractYear(dateText) {
  if (!dateText) return '';
  const match = String(dateText).match(/(-?\d{1,4})/);
  return match ? Number(match[1]) : '';
}

function slugify(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function normalizeItem(item) {
  const title = cleanText(getField(item, ['title', 'object_name', 'summary_title', 'name']));
  const artist = cleanText(getField(item, ['artist', 'maker', 'production', 'creator', 'people']));
  const dateText = cleanText(getField(item, ['date', 'date_range', 'date_text', 'year']));
  const medium = cleanText(getField(item, ['medium', 'materials', 'materials_and_techniques']));
  const image = cleanText(getField(item, ['image', 'image_url', 'primary_image_url', 'thumbnail', 'thumb']));
  const objectId = cleanText(getField(item, ['object_id', 'objectId', 'id', 'museum_number']));
  const sourceUrl = cleanText(getField(item, ['url', 'link', 'object_url', 'object_link']));

  const idBase = slugify(title || objectId);
  const id = `the-british-museum-${idBase || objectId || Math.random().toString(36).slice(2, 8)}`;

  return {
    id,
    title: title || 'Untitled',
    artist: artist || 'Unknown',
    year: extractYear(dateText),
    date: dateText || '',
    image: image || '',
    medium: medium || '',
    sourceUrl: sourceUrl || (objectId ? `https://www.britishmuseum.org/collection/object/${objectId}` : ''),
  };
}

async function fetchPage(request, pageIndex) {
  const url = `${API_BASE}?object[]=painting&view=grid&sort=object_name__asc&page=${pageIndex}`;
  const res = await request.get(url);
  if (!res.ok()) {
    throw new Error(`API request failed: ${res.status()} ${res.statusText()}`);
  }
  return res.json();
}

async function run() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  console.log('Opening search page...');
  await page.goto(SEARCH_PAGE, { waitUntil: 'domcontentloaded', timeout: 60000 });

  let apiReady = false;
  const apiResponses = [];
  page.on('response', async (res) => {
    const url = res.url();
    if (url.startsWith(API_BASE)) {
      try {
        const json = await res.json();
        apiResponses.push(json);
        apiReady = true;
      } catch {
        // ignore
      }
    }
  });

  console.log('Waiting for API responses...');
  const start = Date.now();
  while (!apiReady && Date.now() - start < WAIT_FOR_API_MS) {
    await page.waitForTimeout(1000);
  }

  if (!apiReady) {
    throw new Error('API not reachable. Cloudflare challenge may be blocking. Please solve it in the browser and rerun.');
  }

  const request = page.request;
  const objects = [];
  let pageIndex = 0;

  while (objects.length < MAX_ITEMS) {
    const payload = await fetchPage(request, pageIndex);
    const items = extractItems(payload);

    if (!items.length) break;

    for (const item of items) {
      const normalized = normalizeItem(item);
      if (!normalized.image) continue; // only keep items with image
      objects.push(normalized);
      if (objects.length >= MAX_ITEMS) break;
    }

    pageIndex += 1;
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
    failedCount: 0,
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
