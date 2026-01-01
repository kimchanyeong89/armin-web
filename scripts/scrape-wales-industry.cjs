#!/usr/bin/env node
/**
 * National Museum Wales - Industry Collection Scraper (Parallel Version)
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../public/data');
const PROGRESS_FILE = path.join(__dirname, '../downloads/museum-wales-industry-progress.json');

const TEST_MODE = process.argv.includes('--test');
const TEST_PAGES = 3;
const SAVE_INTERVAL = 50;

const COLLECTION = {
  id: 'industry',
  name: 'Industry Collection',
  baseUrl: 'https://museum.wales/collections/online/?field0=with_images&value0=1&field1=database&value1=industry&view=grid&page=',
  outputFile: 'museum-wales-industry.json'
};

const delay = ms => new Promise(r => setTimeout(r, ms));
const timestamp = () => new Date().toLocaleTimeString('ko-KR', { hour12: false });
const log = msg => console.log(`[${timestamp()}] [INDUSTRY] ${msg}`);

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    }
  } catch (e) {}
  return { artworks: [], scrapedIds: [], lastPage: 0, totalPages: 0 };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function extractGridItems(page) {
  return await page.evaluate(() => {
    const items = [];
    const searchResults = document.querySelectorAll('.search_result');
    
    searchResults.forEach(item => {
      const link = item.querySelector('a.result_box_image');
      if (!link) return;
      
      const href = link.getAttribute('href');
      const uuidMatch = href.match(/object\/([a-f0-9-]+)\//);
      if (!uuidMatch) return;
      
      const uuid = uuidMatch[1];
      const img = item.querySelector('.media_dams img');
      const imageUrl = img ? (img.src.startsWith('http') ? img.src : 'https://museum.wales' + img.getAttribute('src')) : '';
      const titleEl = item.querySelector('h3 a');
      const title = titleEl ? titleEl.textContent.trim() : '';
      const itemNumberEl = item.querySelector('.result_identifier');
      const itemNumber = itemNumberEl ? itemNumberEl.textContent.trim() : '';
      const typeEl = item.querySelector('.result_type');
      const resultType = typeEl ? typeEl.textContent.trim() : '';
      const sourceUrl = 'https://museum.wales/collections/online/object/' + uuid + '/';
      
      items.push({ id: uuid, title, itemNumber, image: imageUrl, resultType, sourceUrl });
    });
    
    return items;
  });
}

async function extractItemDetails(page, item) {
  try {
    await page.goto(item.sourceUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(500);
    
    const details = await page.evaluate(() => {
      const result = { collectionArea: '', measurements: '', categories: [], artist: '', date: '', description: '', medium: '', materials: [] };
      
      const fields = document.querySelectorAll('.object_field');
      fields.forEach(field => {
        const labelEl = field.querySelector('h4');
        const valueEl = field.querySelector('.object_field_value');
        if (!labelEl) return;
        
        const label = labelEl.textContent.trim().toLowerCase();
        const value = valueEl ? valueEl.textContent.trim() : '';
        
        if (label.includes('collection area')) result.collectionArea = value;
        else if (label.includes('measurement')) result.measurements = value;
        else if (label.includes('artist') || label.includes('maker') || label.includes('creator')) result.artist = value;
        else if (label.includes('date') || label.includes('period')) result.date = value;
        else if (label.includes('description')) result.description = value;
        else if (label.includes('medium') || label.includes('technique')) result.medium = value;
        else if (label.includes('material')) {
          const materials = valueEl ? Array.from(valueEl.querySelectorAll('a')).map(a => a.textContent.trim()) : [];
          result.materials = materials.length > 0 ? materials : (value ? [value] : []);
        }
      });
      
      const categoryEl = document.querySelector('.object_categories');
      if (categoryEl) {
        const categoryLinks = categoryEl.querySelectorAll('a');
        result.categories = Array.from(categoryLinks).map(a => a.textContent.trim());
      }
      
      return result;
    });
    
    return { ...item, ...details };
  } catch (e) {
    return item;
  }
}

async function main() {
  log(`🚀 Starting Industry Collection... (${TEST_MODE ? 'TEST' : 'FULL'})`);
  
  const progress = loadProgress();
  
  const browser = await chromium.launch({ headless: true, args: ['--disable-blink-features=AutomationControlled'] });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    viewport: { width: 1400, height: 900 }
  });
  
  try {
    const listPage = await context.newPage();
    await listPage.goto(COLLECTION.baseUrl + '1', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await delay(1000);
    
    const totalPages = await listPage.evaluate(() => {
      const paginationText = document.querySelector('.pagination')?.textContent || '';
      const match = paginationText.match(/of\s+(\d+)/);
      return match ? parseInt(match[1], 10) : 1;
    });
    
    progress.totalPages = totalPages;
    log(`📊 Total pages: ${totalPages}`);
    
    const maxPages = TEST_MODE ? TEST_PAGES : totalPages;
    const startPage = progress.lastPage > 0 ? progress.lastPage : 1;
    
    log(`📍 Starting from page ${startPage}, max: ${maxPages}`);
    
    const detailPage = await context.newPage();
    
    for (let pageNum = startPage; pageNum <= maxPages; pageNum++) {
      log(`📄 Page ${pageNum}/${maxPages}...`);
      
      await listPage.goto(COLLECTION.baseUrl + pageNum, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await delay(800);
      
      const gridItems = await extractGridItems(listPage);
      log(`   Found ${gridItems.length} items`);
      
      for (const item of gridItems) {
        if (progress.scrapedIds.includes(item.id)) continue;
        
        const fullItem = await extractItemDetails(detailPage, item);
        progress.artworks.push(fullItem);
        progress.scrapedIds.push(item.id);
        
        if (progress.artworks.length % SAVE_INTERVAL === 0) {
          progress.lastPage = pageNum;
          saveProgress(progress);
          log(`   💾 Saved: ${progress.artworks.length} items`);
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
  
  saveProgress(progress);
  
  const outputData = {
    museum: "National Museum Wales",
    museumId: 'museum-wales',
    collection: COLLECTION.name,
    collectionId: COLLECTION.id,
    location: 'Cardiff, Wales, UK',
    type: 'permanent',
    scrapedAt: new Date().toISOString(),
    totalArtworks: progress.artworks.length,
    artworksWithCategories: progress.artworks.filter(a => a.categories && a.categories.length > 0).length,
    objects: progress.artworks
  };
  
  fs.writeFileSync(path.join(OUTPUT_DIR, COLLECTION.outputFile), JSON.stringify(outputData, null, 2));
  log(`✅ Done! ${progress.artworks.length} items saved`);
}

main().catch(console.error);
