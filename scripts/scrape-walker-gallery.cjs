#!/usr/bin/env node
/**
 * Walker Art Gallery Collection Scraper
 * Liverpool Museums site (liverpoolmuseums.org.uk)
 * Uses Playwright to handle JS-rendered content
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../public/data/walker-art-gallery-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/walker-progress.json');

// Walker painting collection pages
const COLLECTION_URLS = [
  {
    url: 'https://www.liverpoolmuseums.org.uk/walker/collections/painting',
    category: 'Painting'
  },
  {
    url: 'https://www.liverpoolmuseums.org.uk/walker/collections/drawing',
    category: 'Drawing'
  },
  {
    url: 'https://www.liverpoolmuseums.org.uk/walker/collections/watercolour',
    category: 'Watercolour'
  }
];

// Fallback: general Walker search
const SEARCH_URL = 'https://www.liverpoolmuseums.org.uk/search?hf%5Bmuseums%5D%5B%5D=walker-art-gallery&hf%5Brecordtype%5D%5B%5D=object';

const DELAY_MS = Number(process.env.DELAY_MS || 1200);

const delay = ms => new Promise(r => setTimeout(r, ms));
const ts = () => new Date().toLocaleTimeString('ko-KR', { hour12: false });
const log = msg => console.log('[' + ts() + '] ' + msg);

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    }
  } catch (e) {}
  return { objects: [], seenIds: [] };
}

function saveProgress(progress) {
  const dir = path.dirname(PROGRESS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function saveOutput(objects) {
  const out = {
    galleryId: 'walker-art-gallery',
    galleryName: 'Walker Art Gallery',
    location: 'Liverpool, England, UK',
    scrapedAt: new Date().toISOString(),
    totalObjects: objects.length,
    objects: objects
  };
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(out, null, 2));
  log('Saved ' + objects.length + ' items to ' + path.basename(OUTPUT_FILE));
}

async function scrapeCollectionPage(page, url, category) {
  log('Loading: ' + url);

  let items = [];
  let pageNum = 1;

  while (true) {
    const pageUrl = pageNum === 1 ? url : url + '?page=' + pageNum;
    log('  Page ' + pageNum + ': ' + pageUrl);

    try {
      await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 45000 });
    } catch (e) {
      await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    }
    await delay(DELAY_MS);

    const pageItems = await page.evaluate(function(cat) {
      var results = [];

      // Try various selectors for collection items
      var selectors = [
        '.object-list__item',
        '.collection-item',
        '.search-result',
        '[data-component="ObjectCard"]',
        '.object-card',
        'article.item',
        '.collection-object'
      ];

      var items = null;
      for (var s of selectors) {
        var els = document.querySelectorAll(s);
        if (els.length > 0) { items = els; break; }
      }

      if (!items || items.length === 0) {
        // Try broader selectors
        items = document.querySelectorAll('a[href*="/collections/object/"]');
        if (items.length === 0) return results;

        // These are just links, extract from them
        var seen = new Set();
        items.forEach(function(a) {
          var href = a.href || a.getAttribute('href') || '';
          var objectMatch = href.match(/\/collections\/object\/(\d+)/);
          if (!objectMatch || seen.has(objectMatch[1])) return;
          seen.add(objectMatch[1]);

          var img = a.querySelector('img') || a.closest('article,div,li')?.querySelector('img');
          var title = a.textContent.trim() || (a.querySelector('h2,h3,h4,span') && a.querySelector('h2,h3,h4,span').textContent.trim()) || '';
          var imageUrl = img ? (img.src || img.getAttribute('data-src') || '') : '';

          if (!imageUrl || !title) return;

          results.push({
            id: 'walker-' + objectMatch[1],
            title: title.replace(/\s+/g, ' ').trim(),
            artist: '',
            year: null,
            image: imageUrl,
            sourceUrl: href.startsWith('http') ? href : 'https://www.liverpoolmuseums.org.uk' + href,
            category: cat
          });
        });
        return results;
      }

      items.forEach(function(item) {
        var linkEl = item.querySelector('a[href*="/collections/object/"]') || item.querySelector('a');
        if (!linkEl) return;

        var href = linkEl.href || linkEl.getAttribute('href') || '';
        var objectMatch = href.match(/\/collections\/object\/(\d+)/);
        if (!objectMatch) return;

        var img = item.querySelector('img');
        var imageUrl = img ? (img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || '') : '';

        var titleEl = item.querySelector('h2, h3, h4, .title, .object-title, [class*="title"]');
        var title = titleEl ? titleEl.textContent.trim() : (linkEl.textContent.trim() || '');

        var artistEl = item.querySelector('.artist, .maker, [class*="artist"], [class*="maker"]');
        var artist = artistEl ? artistEl.textContent.trim() : '';

        var dateEl = item.querySelector('.date, [class*="date"]');
        var date = dateEl ? dateEl.textContent.trim() : '';

        results.push({
          id: 'walker-' + objectMatch[1],
          title: title.replace(/\s+/g, ' ').trim(),
          artist: artist,
          year: date,
          image: imageUrl,
          sourceUrl: href.startsWith('http') ? href : 'https://www.liverpoolmuseums.org.uk' + href,
          category: cat
        });
      });

      return results;
    }, category);

    log('  Found ' + pageItems.length + ' items on page ' + pageNum);

    if (pageItems.length === 0) break;

    items = items.concat(pageItems.filter(function(item) { return !!item.image; }));

    // Check if there's a next page
    const hasNextPage = await page.evaluate(function() {
      var nextBtn = document.querySelector('a[rel="next"], a.pagination-next, [aria-label="Next page"], li.next a');
      return !!nextBtn;
    });

    if (!hasNextPage) break;
    pageNum++;
    if (pageNum > 100) break; // safety limit
  }

  return items;
}

async function scrapeObjectDetails(page, objectUrl) {
  try {
    await page.goto(objectUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(500);

    return await page.evaluate(function() {
      var img = document.querySelector('.object-image img, .hero-image img, main img');
      var imageUrl = img ? (img.src || img.getAttribute('data-src') || '') : '';

      var titleEl = document.querySelector('h1, .object-title');
      var title = titleEl ? titleEl.textContent.trim() : '';

      var artistEl = document.querySelector('.artist-name, [class*="artist"], dt:contains("Maker") + dd, .maker');
      var artist = artistEl ? artistEl.textContent.trim() : '';

      var dateEl = document.querySelector('.object-date, [class*="date"]');
      var date = dateEl ? dateEl.textContent.trim() : '';

      return { image: imageUrl, title: title, artist: artist, date: date };
    });
  } catch (e) {
    return null;
  }
}

async function main() {
  log('Starting Walker Art Gallery scraper');

  const progress = loadProgress();
  const seenIds = new Set(progress.seenIds || []);
  let objects = progress.objects || [];

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1400, height: 900 },
    extraHTTPHeaders: {
      'Accept-Language': 'en-GB,en;q=0.9'
    }
  });

  const page = await context.newPage();

  try {
    // Try collection-specific pages first
    for (const { url, category } of COLLECTION_URLS) {
      log('Scraping category: ' + category);
      const items = await scrapeCollectionPage(page, url, category);
      log('Got ' + items.length + ' items for ' + category);

      for (const item of items) {
        if (seenIds.has(item.id)) continue;
        seenIds.add(item.id);
        objects.push(item);
      }

      progress.objects = objects;
      progress.seenIds = Array.from(seenIds);
      saveProgress(progress);
    }

    // If we got very few items, try the general search
    if (objects.length < 50) {
      log('Low count (' + objects.length + '), trying general search...');
      const searchItems = await scrapeCollectionPage(page, SEARCH_URL, 'Painting');
      for (const item of searchItems) {
        if (seenIds.has(item.id)) continue;
        seenIds.add(item.id);
        objects.push(item);
      }
    }

    await page.close();
  } finally {
    await browser.close();
  }

  log('Total collected: ' + objects.length);
  saveOutput(objects);
}

main().catch(function(err) {
  console.error('Fatal:', err.message);
  process.exitCode = 1;
});
