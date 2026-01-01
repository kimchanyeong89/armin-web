#!/usr/bin/env node
/**
 * Sir John Soane's Museum - Paintings Collection Scraper v2
 * 471 paintings - with batch processing and browser restart
 * 
 * Usage:
 *   node scripts/scrape-soane.cjs --test    # Test with first 10 items
 *   node scripts/scrape-soane.cjs           # Full scrape
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../public/data/soane-paintings.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/soane-progress.json');

const TEST_MODE = process.argv.includes('--test');
const BASE_URL = 'https://collections.soane.org';
const BATCH_SIZE = 50; // Restart browser every 50 items

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
    }
  } catch (e) {}
  return { artworks: [], lastIndex: 0, scrapedIds: [] };
}

function saveProgress(data) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2));
}

async function scrapeDetailPage(page, objectId) {
  const url = `${BASE_URL}/object-${objectId}`;
  
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(800);
    
    const artwork = {
      id: objectId.toUpperCase(),
      title: '',
      artist: '',
      year: null,
      medium: '',
      dimensions: '',
      description: '',
      image: '',
      accessionNumber: objectId.toUpperCase(),
      location: '',
      sourceUrl: url
    };
    
    // Get body text for parsing
    const bodyText = await page.$eval('body', el => el.innerText);
    const lines = bodyText.split('\n').map(l => l.trim()).filter(l => l);
    
    // Find artist (line with dates in parentheses)
    for (const line of lines) {
      if (line.match(/\(\d{4}\s*[-–]\s*\d{4}\)|\(fl\.\s*\d{4}|\(\d{4}\s*[-–]\s*\)/)) {
        artwork.artist = line;
        break;
      }
    }
    
    // Get title from page title
    const pageTitle = await page.title();
    artwork.title = pageTitle.replace(/ - Sir John Soane.*Museum/g, '').trim();
    
    // Find date (standalone year or year range)
    for (const line of lines) {
      if (line.match(/^\d{4}$/) || line.match(/^c\.\d{4}/) || line.match(/^\d{4}-\d{4}$/) || line.match(/^\d{4}\s*[-–]\s*\d{4}$/)) {
        artwork.year = line;
        break;
      }
    }
    
    // Find medium
    for (const line of lines) {
      if (line.match(/^Oil on|^Watercolour|^Ink|^Pencil|^Canvas|^Paper|^Gouache|^Pastel|^Tempera|^Fresco|^Engraving|^Etching|^Lithograph|^Pen and/i)) {
        artwork.medium = line;
        break;
      }
    }
    
    // Find dimensions
    for (const line of lines) {
      if (line.match(/^Height:\s*[\d.]+\s*(cm|mm)/i)) {
        artwork.dimensions = line;
        break;
      }
    }
    
    // Find location
    for (const line of lines) {
      if (line.startsWith('On display:')) {
        artwork.location = line.replace('On display:', '').trim();
        break;
      }
    }
    
    // Get image
    const imgSrc = await page.$eval('img[src*="object_images"], img[src*="fullview"]', 
      img => img.src
    ).catch(() => '');
    artwork.image = imgSrc;
    
    return artwork;
  } catch (error) {
    console.log(`  ⚠️ Error scraping ${objectId}: ${error.message.substring(0, 50)}`);
    return null;
  }
}

async function scrapeBatch(objectIds, startIdx, batchSize, progress) {
  console.log(`\n🔄 Starting batch: ${startIdx} to ${startIdx + batchSize - 1}...`);
  
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1400, height: 900 },
  });
  
  const page = await context.newPage();
  let scrapedCount = 0;
  let lastIdx = startIdx;
  
  try {
    const endIdx = Math.min(startIdx + batchSize, objectIds.length);
    
    for (let i = startIdx; i < endIdx; i++) {
      const objectId = objectIds[i];
      lastIdx = i;
      
      // Skip if already scraped
      if (progress.scrapedIds.includes(objectId)) {
        console.log(`[${i + 1}/${objectIds.length}] ${objectId} - already scraped`);
        continue;
      }
      
      console.log(`[${i + 1}/${objectIds.length}] Scraping ${objectId}...`);
      
      try {
        const artwork = await scrapeDetailPage(page, objectId);
        
        if (artwork && artwork.title) {
          progress.artworks.push(artwork);
          progress.scrapedIds.push(objectId);
          scrapedCount++;
          console.log(`  ✓ ${artwork.title.substring(0, 50)}...`);
          console.log(`    ${artwork.artist || 'Unknown'} | ${artwork.year || 'No date'}`);
        }
      } catch (itemErr) {
        console.log(`  ⚠️ Item error: ${itemErr.message.substring(0, 40)}`);
      }
      
      // Save progress every 10 items
      if ((i + 1) % 10 === 0) {
        progress.lastIndex = i + 1;
        saveProgress(progress);
        console.log(`  💾 Progress saved: ${progress.artworks.length} items`);
      }
      
      await delay(500);
    }
  } catch (batchErr) {
    console.log(`  ❌ Batch error at ${lastIdx}: ${batchErr.message.substring(0, 40)}`);
  } finally {
    try {
      await browser.close();
    } catch (e) {}
  }
  
  return { scrapedCount, lastIdx: lastIdx + 1 };
}

async function main() {
  console.log('🏛️ Sir John Soane\'s Museum - Paintings Scraper v2');
  console.log(TEST_MODE ? '📍 테스트 모드 (10개)\n' : '📍 전체 모드 (471개)\n');
  
  // Generate object IDs P1-P471
  const objectIds = [];
  for (let i = 1; i <= 471; i++) {
    objectIds.push(`p${i}`);
  }
  console.log(`📋 Generated ${objectIds.length} object IDs (P1-P471)`);
  
  const progress = loadProgress();
  const maxItems = TEST_MODE ? 10 : objectIds.length;
  const startIdx = progress.lastIndex || 0;
  
  console.log(`📦 Starting from index ${startIdx}, target: ${maxItems} items`);
  
  // Process in batches
  let currentIdx = startIdx;
  while (currentIdx < maxItems) {
    try {
      const result = await scrapeBatch(objectIds, currentIdx, BATCH_SIZE, progress);
      console.log(`\n✅ Batch complete: ${result.scrapedCount} items scraped`);
      currentIdx = result.lastIdx;
    } catch (err) {
      console.error(`❌ Batch error: ${err.message}`);
      currentIdx += BATCH_SIZE; // Skip to next batch on error
    }
    
    progress.lastIndex = currentIdx;
    saveProgress(progress);
    
    if (currentIdx < maxItems) {
      console.log(`⏳ Restarting browser for next batch...`);
      await delay(3000);
    }
  }
  
  // Save final results
  const results = {
    museum: "Sir John Soane's Museum",
    museumId: 'soane-museum',
    location: 'London, UK',
    collection: 'Paintings and framed watercolours and prints',
    type: 'permanent',
    scrapedAt: new Date().toISOString(),
    totalArtworks: progress.artworks.length,
    artworksWithImages: progress.artworks.filter(a => a.image).length,
    artworks: progress.artworks
  };
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
  
  console.log('\n=== 완료 ===');
  console.log(`작품: ${results.totalArtworks}`);
  console.log(`이미지: ${results.artworksWithImages}`);
  console.log(`저장: ${OUTPUT_FILE}`);
}

main();
