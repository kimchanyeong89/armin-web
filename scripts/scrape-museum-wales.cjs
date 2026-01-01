#!/usr/bin/env node
/**
 * National Museum Wales - Collections Scraper
 * 
 * Scrapes Art and Industry collections from museum.wales
 * Each collection has 10,000+ items with images
 * 
 * Usage:
 *   node scripts/scrape-museum-wales.cjs --test    # Test with first 3 pages
 *   node scripts/scrape-museum-wales.cjs           # Full scrape
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../public/data');
const PROGRESS_FILE = path.join(__dirname, '../downloads/museum-wales-progress.json');

const TEST_MODE = process.argv.includes('--test');
const TEST_PAGES = 3;
const ITEMS_PER_PAGE = 12;
const SAVE_INTERVAL = 50;
const BATCH_SIZE = 100; // Restart browser every 100 pages

const COLLECTIONS = [
  {
    id: 'art',
    name: 'Art Collection',
    baseUrl: 'https://museum.wales/collections/online/?field0=with_images&value0=1&field1=database&value1=art&view=grid&page=',
    outputFile: 'museum-wales-art.json'
  },
  {
    id: 'industry',
    name: 'Industry Collection', 
    baseUrl: 'https://museum.wales/collections/online/?field0=with_images&value0=1&field1=database&value1=industry&view=grid&page=',
    outputFile: 'museum-wales-industry.json'
  }
];

const delay = ms => new Promise(r => setTimeout(r, ms));
const timestamp = () => new Date().toLocaleTimeString('ko-KR', { hour12: false });
const log = (prefix, msg) => console.log(`[${timestamp()}] [${prefix}] ${msg}`);

// ═══════════════════════════════════════════════════════════════
// Progress Management
// ═══════════════════════════════════════════════════════════════
function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    }
  } catch (e) {}
  return {};
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

// ═══════════════════════════════════════════════════════════════
// Extract items from grid page
// ═══════════════════════════════════════════════════════════════
async function extractGridItems(page) {
  return await page.evaluate(() => {
    const items = [];
    const searchResults = document.querySelectorAll('.search_result');
    
    searchResults.forEach(item => {
      // Get link and extract UUID from href
      const link = item.querySelector('a.result_box_image');
      if (!link) return;
      
      const href = link.getAttribute('href');
      const uuidMatch = href.match(/object\/([a-f0-9-]+)\//);
      if (!uuidMatch) return;
      
      const uuid = uuidMatch[1];
      
      // Get image URL from img src
      const img = item.querySelector('.media_dams img');
      const imageUrl = img ? (img.src.startsWith('http') ? img.src : 'https://museum.wales' + img.getAttribute('src')) : '';
      
      // Get title from h3
      const titleEl = item.querySelector('h3 a');
      const title = titleEl ? titleEl.textContent.trim() : '';
      
      // Get item number (result_identifier)
      const itemNumberEl = item.querySelector('.result_identifier');
      const itemNumber = itemNumberEl ? itemNumberEl.textContent.trim() : '';
      
      // Get result type (ART, INDUSTRY)
      const typeEl = item.querySelector('.result_type');
      const resultType = typeEl ? typeEl.textContent.trim() : '';
      
      // Get source URL
      const sourceUrl = 'https://museum.wales/collections/online/object/' + uuid + '/';
      
      items.push({
        id: uuid,
        title,
        itemNumber,
        image: imageUrl,
        resultType,
        sourceUrl
      });
    });
    
    return items;
  });
}

// ═══════════════════════════════════════════════════════════════
// Extract detail from item page
// ═══════════════════════════════════════════════════════════════
async function extractItemDetails(page, item) {
  try {
    await page.goto(item.sourceUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(500);
    
    const details = await page.evaluate(() => {
      const result = {
        collectionArea: '',
        measurements: '',
        categories: [],
        artist: '',
        date: '',
        description: '',
        medium: '',
        materials: []
      };
      
      // Get all field sections
      const fields = document.querySelectorAll('.object_field');
      
      fields.forEach(field => {
        const labelEl = field.querySelector('h4');
        const valueEl = field.querySelector('.object_field_value');
        
        if (!labelEl) return;
        
        const label = labelEl.textContent.trim().toLowerCase();
        const value = valueEl ? valueEl.textContent.trim() : '';
        
        if (label.includes('collection area')) {
          result.collectionArea = value;
        } else if (label.includes('measurement')) {
          result.measurements = value;
        } else if (label.includes('artist') || label.includes('maker') || label.includes('creator')) {
          result.artist = value;
        } else if (label.includes('date') || label.includes('period')) {
          result.date = value;
        } else if (label.includes('description')) {
          result.description = value;
        } else if (label.includes('medium') || label.includes('technique')) {
          result.medium = value;
        } else if (label.includes('material')) {
          const materials = valueEl ? Array.from(valueEl.querySelectorAll('a')).map(a => a.textContent.trim()) : [];
          result.materials = materials.length > 0 ? materials : (value ? [value] : []);
        }
      });
      
      // Get categories - they're usually in button/link form
      const categoryEl = document.querySelector('.object_categories');
      if (categoryEl) {
        const categoryLinks = categoryEl.querySelectorAll('a');
        result.categories = Array.from(categoryLinks).map(a => a.textContent.trim());
      }
      
      return result;
    });
    
    return { ...item, ...details };
  } catch (e) {
    log('DETAIL', `⚠️ Error on ${item.id}: ${e.message.substring(0, 40)}`);
    return item;
  }
}

// ═══════════════════════════════════════════════════════════════
// Scrape a collection
// ═══════════════════════════════════════════════════════════════
async function scrapeCollection(collection) {
  log(collection.id.toUpperCase(), `🚀 Starting ${collection.name}...`);
  
  // Load progress
  const allProgress = loadProgress();
  const progress = allProgress[collection.id] || {
    artworks: [],
    scrapedIds: [],
    lastPage: 0,
    totalPages: 0
  };
  
  // Launch browser
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1400, height: 900 }
  });
  
  try {
    // First, get total pages
    const listPage = await context.newPage();
    await listPage.goto(collection.baseUrl + '1', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await delay(1000);
    
    // Get total pages from pagination
    const totalPages = await listPage.evaluate(() => {
      const paginationText = document.querySelector('.pagination')?.textContent || '';
      const match = paginationText.match(/of\s+(\d+)/);
      return match ? parseInt(match[1], 10) : 1;
    });
    
    progress.totalPages = totalPages;
    log(collection.id.toUpperCase(), `📊 Total pages: ${totalPages}`);
    
    const maxPages = TEST_MODE ? TEST_PAGES : totalPages;
    const startPage = progress.lastPage > 0 ? progress.lastPage : 1;
    
    log(collection.id.toUpperCase(), `📍 Starting from page ${startPage}, max: ${maxPages}`);
    
    // Create detail page
    const detailPage = await context.newPage();
    
    // Process pages
    for (let pageNum = startPage; pageNum <= maxPages; pageNum++) {
      log(collection.id.toUpperCase(), `📄 Page ${pageNum}/${maxPages}...`);
      
      // Go to list page
      await listPage.goto(collection.baseUrl + pageNum, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await delay(800);
      
      // Extract items from grid
      const gridItems = await extractGridItems(listPage);
      log(collection.id.toUpperCase(), `   Found ${gridItems.length} items on page`);
      
      // Get details for each item (skip already scraped)
      for (const item of gridItems) {
        if (progress.scrapedIds.includes(item.id)) {
          continue;
        }
        
        // Get full details
        const fullItem = await extractItemDetails(detailPage, item);
        
        progress.artworks.push(fullItem);
        progress.scrapedIds.push(item.id);
        
        // Save every SAVE_INTERVAL items
        if (progress.artworks.length % SAVE_INTERVAL === 0) {
          progress.lastPage = pageNum;
          allProgress[collection.id] = progress;
          saveProgress(allProgress);
          log(collection.id.toUpperCase(), `   💾 Saved: ${progress.artworks.length} items`);
        }
        
        await delay(200);
      }
      
      progress.lastPage = pageNum;
    }
    
    await listPage.close();
    await detailPage.close();
    
  } finally {
    await browser.close();
  }
  
  // Save final progress
  allProgress[collection.id] = progress;
  saveProgress(allProgress);
  
  // Create output file
  const outputData = {
    museum: "National Museum Wales",
    museumId: 'museum-wales',
    collection: collection.name,
    collectionId: collection.id,
    location: 'Cardiff, Wales, UK',
    type: 'permanent',
    scrapedAt: new Date().toISOString(),
    totalArtworks: progress.artworks.length,
    artworksWithCategories: progress.artworks.filter(a => a.categories && a.categories.length > 0).length,
    objects: progress.artworks
  };
  
  const outputPath = path.join(OUTPUT_DIR, collection.outputFile);
  fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
  
  log(collection.id.toUpperCase(), `✅ Done! ${progress.artworks.length} items saved to ${collection.outputFile}`);
  
  return progress.artworks.length;
}

// ═══════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════
async function main() {
  console.log('🏛️ National Museum Wales - Collections Scraper');
  console.log(TEST_MODE ? '📍 테스트 모드 (3페이지)\n' : '📍 전체 모드\n');
  
  const results = {};
  
  for (const collection of COLLECTIONS) {
    try {
      results[collection.id] = await scrapeCollection(collection);
    } catch (e) {
      log('ERROR', `${collection.id}: ${e.message}`);
      results[collection.id] = 0;
    }
  }
  
  console.log('\n=== 결과 ===');
  for (const [id, count] of Object.entries(results)) {
    console.log(`${id}: ${count} items`);
  }
}

main().catch(console.error);
