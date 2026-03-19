#!/usr/bin/env node
/**
 * Wales Museum - Extended Art Scraper
 * Adds new categories not in existing museum-wales-paintings.json:
 * - Works on paper, Print, Pastel, Etching, Gouache, etc.
 * 
 * Key optimization: pre-seeds scrapedIds from existing JSON
 * so already-collected items are skipped.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const EXISTING_FILE = path.join(__dirname, '../public/data/museum-wales-paintings.json');
const NEW_ITEMS_FILE = path.join(__dirname, '../public/data/museum-wales-extended-new.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/museum-wales-extended-progress.json');
const LOG_FILE = path.join(__dirname, '../logs/wales-extended.log');

// EXPANDED categories (beyond existing Painting/Drawing/Watercolour)
const TARGET_CATEGORIES = [
  'Watercolour', 'Drawing', 'Painting',  // existing
  'Works on paper', 'Works On Paper',    // new target!
  'Print', 'Prints', 'Etching', 'Engraving', 'Lithograph', 'Aquatint',
  'Mezzotint', 'Woodcut', 'Screenprint', 'Monotype', 'Linocut',
  'Pastel', 'Gouache', 'Chalk', 'Charcoal', 'Pen and ink',
  'Sketch', 'Collage', 'Mixed media',
];

const BASE_URL = 'https://museum.wales/collections/online/?field0=with_images&value0=1&field1=database&value1=art&view=grid&page=';

const DELAY_MS = Number(process.env.DELAY_MS || 300);
const MAX_PAGES = Number(process.env.MAX_PAGES || 2000);
const SAVE_INTERVAL = 50;

const delay = ms => new Promise(r => setTimeout(r, ms));
const ts = () => new Date().toLocaleTimeString('ko-KR', { hour12: false });
const log = msg => {
  const line = '[' + ts() + '] ' + msg;
  console.log(line);
  try {
    const dir = path.dirname(LOG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch(e) {}
};

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    }
  } catch (e) {}
  return { newArtworks: [], checkedIds: [], lastPage: 0, totalPages: 0 };
}

function saveProgress(progress) {
  const dir = path.dirname(PROGRESS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function saveNewItems(artworks) {
  const out = {
    collectionId: 'museum-wales-extended',
    targetCategories: TARGET_CATEGORIES,
    scrapedAt: new Date().toISOString(),
    totalArtworks: artworks.length,
    objects: artworks
  };
  fs.writeFileSync(NEW_ITEMS_FILE, JSON.stringify(out, null, 2));
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
    await delay(200);

    const details = await page.evaluate(function() {
      var result = { artist: '', artistDates: '', medium: '', categories: [], dimensions: '', accessionNumber: '' };

      // Artist
      var creatorEl = document.querySelector('.creation_name a');
      if (creatorEl) {
        var raw = creatorEl.textContent.trim();
        if (raw.includes(',')) {
          var parts = raw.split(',');
          var surname = parts[0].trim();
          var forenames = parts.slice(1).join(',').trim();
          result.artist = forenames.split(' ').map(function(w) {
            return w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : '';
          }).join(' ') + ' ' + surname.charAt(0).toUpperCase() + surname.slice(1).toLowerCase();
        } else {
          result.artist = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
        }
      }
      
      // artistDates
      var bibEl = document.querySelector('.bibliography');
      if (bibEl && /\d{4}/.test(bibEl.textContent)) result.artistDates = bibEl.textContent.trim();
      
      // Medium (technique)
      var techEls = document.querySelectorAll('.technique');
      var skipMedium = /^(oil painting|watercolour painting|oil on canvas|acrylic painting|fine art|works on paper|paintings|drawings|watercolours|prints)$/i;
      Array.from(techEls).forEach(function(el) {
        var val = el.textContent.trim();
        if (val && !result.medium && !skipMedium.test(val)) result.medium = val;
      });
      if (!result.medium && techEls.length > 0) result.medium = techEls[0].textContent.trim();
      
      // Dimensions
      var dims = [];
      var measEls = document.querySelectorAll('.measurement');
      measEls.forEach(function(m) {
        var strong = m.querySelector('strong');
        if (!strong) return;
        var label = strong.textContent.toLowerCase();
        var text = m.textContent.replace(strong.textContent, '').trim();
        var val = parseFloat(text);
        if (isNaN(val)) return;
        if (label.includes('height')) dims.push('H: ' + val + ' cm');
        else if (label.includes('width')) dims.push('W: ' + val + ' cm');
        else if (label.includes('depth')) dims.push('D: ' + val + ' cm');
      });
      if (dims.length) result.dimensions = dims.join(', ');

      // Accession number
      var fields = document.querySelectorAll('.object_field');
      fields.forEach(function(field) {
        var h4 = field.querySelector('h4');
        if (!h4) return;
        var label = h4.textContent.trim().toLowerCase();
        var valEl = field.querySelector('.object_field_value');
        if (!valEl) return;
        var val = valEl.textContent.trim();
        if (label.includes('item number') || label.includes('accession')) {
          if (!result.accessionNumber) result.accessionNumber = val;
        }
      });
      
      // Date  
      var dateFieldMatch = null;
      fields.forEach(function(field) {
        var h4 = field.querySelector('h4');
        if (!h4) return;
        var label = h4.textContent.trim().toLowerCase();
        if ((label === 'date' || label.includes('item date')) && !dateFieldMatch) {
          var valEl = field.querySelector('.object_field_value');
          if (valEl) dateFieldMatch = valEl.textContent.trim();
        }
      });
      if (dateFieldMatch) {
        var ym = dateFieldMatch.match(/\b(\d{4})\b/);
        if (ym) result.year = ym[1];
      }

      // Categories
      var catEl = document.querySelector('.object_categories');
      if (catEl) {
        result.categories = Array.from(catEl.querySelectorAll('a')).map(function(a) { return a.textContent.trim(); });
      }
      
      return result;
    });

    return Object.assign({}, item, details);
  } catch (e) {
    return item;
  }
}

async function main() {
  log('=== Wales Extended Art Scraper ===');
  
  // Load existing items (to skip them)
  const existing = JSON.parse(fs.readFileSync(EXISTING_FILE, 'utf8'));
  const existingIds = new Set(existing.objects.map(o => o.id));
  log('Existing items (to skip): ' + existingIds.size);
  
  const progress = loadProgress();
  // checkedIds: items we've newly visited (not in existing)
  const checkedIds = new Set(progress.checkedIds || []);
  const scrapedIds = new Set([...checkedIds, ...existingIds]);
  const newArtworks = progress.newArtworks || [];
  
  log('Progress: lastPage=' + (progress.lastPage || 0) + ', newArtworks=' + newArtworks.length);
  
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
    await listPage.goto(BASE_URL + '1', { waitUntil: 'networkidle', timeout: 60000 });
    await delay(1000);
    
    const totalPages = await listPage.evaluate(function() {
      var lastLink = document.querySelector('a[title="Go to last page"], li.pager__item--last a, a.last_page');
      if (lastLink) {
        var pm = (lastLink.href || '').match(/page=(\d+)/);
        if (pm) return parseInt(pm[1], 10);
      }
      var pagerLinks = document.querySelectorAll('.pager__item a, .pagination a, [class*="pager"] a');
      var maxPage = 1;
      pagerLinks.forEach(function(a) {
        var pm = (a.href || '').match(/page=(\d+)/);
        if (pm) maxPage = Math.max(maxPage, parseInt(pm[1], 10));
      });
      return maxPage;
    });
    
    // Also check total results count for pages estimate
    const totalResults = await listPage.evaluate(function() {
      var el = document.querySelector('.search_num_results');
      if (el) {
        var m = el.textContent.match(/(\d[\d,]+)/);
        return m ? parseInt(m[1].replace(/,/g, ''), 10) : 0;
      }
      return 0;
    });
    
    const gridItemCount = await listPage.$$eval('.search_result', els => els.length);
    const estimatedTotalPages = gridItemCount > 0 ? Math.ceil(totalResults / gridItemCount) : (totalPages || 1000);
    
    log('Results: ' + totalResults + ', Items/page: ' + gridItemCount + ', Pages: ~' + estimatedTotalPages);
    progress.totalPages = estimatedTotalPages;
    
    const startPage = (progress.lastPage || 0) + 1;
    const maxPages = Math.min(estimatedTotalPages || MAX_PAGES, MAX_PAGES);
    
    for (let pageNum = startPage; pageNum <= maxPages; pageNum++) {
      if (pageNum % 50 === 0 || pageNum === startPage) {
        log('Page ' + pageNum + '/' + maxPages + ' | new items: ' + newArtworks.length + ' | checked: ' + scrapedIds.size);
      }
      
      await listPage.goto(BASE_URL + pageNum, { waitUntil: 'networkidle', timeout: 60000 });
      await delay(DELAY_MS);
      
      const gridItems = await extractGridItems(listPage);
      
      // Only process items NOT already in existing data
      const newItems = gridItems.filter(item => !scrapedIds.has(item.id));
      
      for (const item of newItems) {
        const fullItem = await extractItemDetail(detailPage, item);
        scrapedIds.add(item.id);
        checkedIds.add(item.id);
        
        const cats = fullItem.categories || [];
        const hasTargetCat = cats.some(function(c) {
          // Use partial match: handles bilingual categories like "Gweithiau ar bapur | Works on paper"
          return TARGET_CATEGORIES.some(function(t) { return c.toLowerCase().includes(t.toLowerCase()); });
        });
        
        // Include any new item with a matching category
        if (hasTargetCat) {
          newArtworks.push(fullItem);
          if (newArtworks.length % 20 === 0) {
            log('  Found ' + newArtworks.length + ' new items | cur: ' + fullItem.title + ' [' + cats.slice(0,3).join(', ') + ']');
          }
        }
        
        await delay(150);
      }
      
      progress.lastPage = pageNum;
      progress.checkedIds = Array.from(checkedIds);
      progress.newArtworks = newArtworks;
      
      if (pageNum % SAVE_INTERVAL === 0 || pageNum === maxPages) {
        saveProgress(progress);
        saveNewItems(newArtworks);
        log('  Saved: ' + newArtworks.length + ' new items');
      }
    }
    
    await listPage.close();
    await detailPage.close();
  } finally {
    await browser.close();
  }
  
  saveProgress(progress);
  saveNewItems(newArtworks);
  log('DONE! ' + newArtworks.length + ' new items saved to museum-wales-extended-new.json');
}

main().catch(function(err) {
  log('Fatal: ' + err.message);
  console.error(err);
  process.exitCode = 1;
});
