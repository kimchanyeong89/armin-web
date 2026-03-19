#!/usr/bin/env node
/**
 * National Museum Wales - Paintings/Drawings/Watercolours Scraper
 * Scrapes Art collection and filters for Drawing, Watercolour, Painting categories
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../public/data/museum-wales-paintings.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/museum-wales-paintings-progress.json');

// Target categories to include
const TARGET_CATEGORIES = ['Drawing', 'Watercolour', 'Painting'];

// Base URL - Art collection with images
const BASE_URL = 'https://museum.wales/collections/online/?field0=with_images&value0=1&field1=database&value1=art&view=grid&page=';

const DELAY_MS = Number(process.env.DELAY_MS || 500);
const SAVE_INTERVAL = 100;
const MAX_PAGES = Number(process.env.MAX_PAGES || 2000);

const delay = ms => new Promise(r => setTimeout(r, ms));
const ts = () => new Date().toLocaleTimeString('ko-KR', { hour12: false });
const log = msg => console.log('[' + ts() + '] ' + msg);

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    }
  } catch (e) {}
  return { artworks: [], scrapedIds: new Array(), lastPage: 0, totalPages: 0, listIds: [] };
}

function saveProgress(progress) {
  const dir = path.dirname(PROGRESS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function saveOutput(artworks) {
  const out = {
    museum: 'National Museum Wales',
    museumId: 'museum-wales',
    collection: 'Paintings, Drawings & Watercolours',
    collectionId: 'museum-wales-paintings',
    location: 'Cardiff, Wales, UK',
    type: 'permanent',
    targetCategories: TARGET_CATEGORIES,
    scrapedAt: new Date().toISOString(),
    totalArtworks: artworks.length,
    objects: artworks
  };
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(out, null, 2));
}

async function extractGridItems(page) {
  return await page.evaluate(function() {
    var items = [];
    var searchResults = document.querySelectorAll('.search_result');
    searchResults.forEach(function(item) {
      var link = item.querySelector('a.result_box_image');
      if (!link) return;
      var href = link.getAttribute('href') || '';
      var uuidMatch = href.match(/object\/([a-f0-9-]+)\//);
      if (!uuidMatch) return;
      var uuid = uuidMatch[1];
      var img = item.querySelector('.media_dams img');
      var imageUrl = '';
      if (img) {
        var src = img.getAttribute('src') || img.src || '';
        imageUrl = src.startsWith('http') ? src : 'https://museum.wales' + src;
      }
      var titleEl = item.querySelector('h3 a');
      var title = titleEl ? titleEl.textContent.trim() : '';
      var sourceUrl = 'https://museum.wales/collections/online/object/' + uuid + '/';
      items.push({ id: uuid, title: title, image: imageUrl, sourceUrl: sourceUrl });
    });
    return items;
  });
}

async function extractItemDetail(page, item) {
  try {
    await page.goto(item.sourceUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(300);

    const details = await page.evaluate(function() {
      var result = {
        artist: '',
        date: '',
        medium: '',
        categories: [],
        dimensions: ''
      };

      var fields = document.querySelectorAll('.object_field');
      fields.forEach(function(field) {
        var labelEl = field.querySelector('h4');
        var valueEl = field.querySelector('.object_field_value');
        if (!labelEl) return;
        var label = labelEl.textContent.trim().toLowerCase();
        var value = valueEl ? valueEl.textContent.trim() : '';
        if (label.includes('artist') || label.includes('maker') || label.includes('creator') || label.includes('author')) {
          if (!result.artist) result.artist = value;
        } else if (label.includes('date') || label.includes('period')) {
          if (!result.date) result.date = value;
        } else if (label.includes('medium') || label.includes('technique') || label.includes('material')) {
          if (!result.medium) result.medium = value;
        } else if (label.includes('measurement') || label.includes('dimension')) {
          result.dimensions = value;
        }
      });

      var catEl = document.querySelector('.object_categories');
      if (catEl) {
        var catLinks = catEl.querySelectorAll('a');
        result.categories = Array.from(catLinks).map(function(a) { return a.textContent.trim(); });
      }
      if (!result.categories || result.categories.length === 0) {
        var catText = document.querySelector('.categories, .category, [class*="categor"]');
        if (catText) result.categories = [catText.textContent.trim()];
      }

      return result;
    });

    return Object.assign({}, item, details);
  } catch (e) {
    return item;
  }
}

async function main() {
  log('Starting Wales Museum Paintings/Drawings/Watercolours scraper');

  const progress = loadProgress();
  const scrapedIds = new Set(progress.scrapedIds || []);
  const artworks = progress.artworks || [];

  log('Loaded ' + artworks.length + ' existing items, last page: ' + (progress.lastPage || 0));

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1400, height: 900 }
  });

  try {
    const listPage = await context.newPage();
    const detailPage = await context.newPage();

    // Get total pages
    await listPage.goto(BASE_URL + '1', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await delay(1000);

    const totalPages = await listPage.evaluate(function() {
      var paginationText = document.querySelector('.pagination, .pager, nav[aria-label*="page"]') &&
        document.querySelector('.pagination, .pager, nav[aria-label*="page"]').textContent || '';
      var m = paginationText.match(/of\s+(\d+)/);
      if (m) return parseInt(m[1], 10);
      // Try last page link
      var lastLink = document.querySelector('a.last, a[title*="last"], li.last a');
      if (lastLink) {
        var href = lastLink.href || '';
        var pm = href.match(/page=(\d+)/);
        if (pm) return parseInt(pm[1], 10);
      }
      // Count pager items
      var pagerLinks = document.querySelectorAll('.pager__item a, .pagination a');
      var maxPage = 1;
      pagerLinks.forEach(function(a) {
        var pm = (a.href || '').match(/page=(\d+)/);
        if (pm) maxPage = Math.max(maxPage, parseInt(pm[1], 10));
      });
      return maxPage;
    });

    log('Total pages detected: ' + totalPages);
    progress.totalPages = totalPages;

    const startPage = (progress.lastPage || 0) + 1;
    const maxPages = Math.min(totalPages || MAX_PAGES, MAX_PAGES);

    for (let pageNum = startPage; pageNum <= maxPages; pageNum++) {
      log('Page ' + pageNum + '/' + maxPages + ' | collected: ' + artworks.length);

      await listPage.goto(BASE_URL + pageNum, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await delay(DELAY_MS);

      const gridItems = await extractGridItems(listPage);
      log('  Found ' + gridItems.length + ' grid items');

      for (const item of gridItems) {
        if (scrapedIds.has(item.id)) continue;

        const fullItem = await extractItemDetail(detailPage, item);
        scrapedIds.add(item.id);

        // Only include items from target categories
        const cats = fullItem.categories || [];
        const hasTargetCat = cats.some(function(c) { return TARGET_CATEGORIES.indexOf(c) !== -1; });
        if (hasTargetCat) {
          artworks.push(fullItem);
        }

        await delay(150);
      }

      progress.lastPage = pageNum;
      progress.scrapedIds = Array.from(scrapedIds);
      progress.artworks = artworks;

      if (pageNum % Math.ceil(SAVE_INTERVAL / 10) === 0 || pageNum === maxPages) {
        saveProgress(progress);
        saveOutput(artworks);
        log('  Saved: ' + artworks.length + ' target items (checked ' + scrapedIds.size + ' total)');
      }
    }

    await listPage.close();
    await detailPage.close();

  } finally {
    await browser.close();
  }

  saveProgress(progress);
  saveOutput(artworks);
  log('DONE! ' + artworks.length + ' items saved to museum-wales-paintings.json');
}

main().catch(function(err) {
  console.error('Fatal:', err.message);
  process.exitCode = 1;
});
