#!/usr/bin/env node
/**
 * Fix Grenoble Paintings - extract real image URLs from Navigart
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../public/data/musee-grenoble-paintings-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/fix-grenoble-images-progress.json');

const TEST_MODE = process.argv.includes('--test');
const MAX_TEST = 10;

const delay = ms => new Promise(r => setTimeout(r, ms));

function loadProgress() {
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  } catch {
    return { processed: {} };
  }
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function extractImageUrl(page, sourceUrl) {
  try {
    await page.goto(sourceUrl, { waitUntil: 'load', timeout: 20000 });
    await delay(2500);
    
    // Get page HTML and extract image URL directly
    const html = await page.content();
    
    // Match navigart image URLs
    const matches = html.match(/https:\/\/images\.navigart\.fr\/\d+\/[A-Z0-9]+\/[A-Z0-9]+\/[A-Z0-9]+\.jpg/gi);
    
    if (matches && matches.length > 0) {
      // Get the first unique match and convert to 1000 size
      let imageUrl = matches[0];
      imageUrl = imageUrl.replace(/\/\d+\//, '/1000/');
      return imageUrl;
    }
    
    return null;
  } catch (e) {
    return null;
  }
}

// Parallel batch processing
async function processBatch(items, browser, batchSize = 5) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const promises = batch.map(async (item) => {
      const page = await browser.newPage();
      try {
        const newImageUrl = await extractImageUrl(page, item.obj.sourceUrl);
        return { ...item, newImageUrl };
      } finally {
        await page.close();
      }
    });
    const batchResults = await Promise.all(promises);
    results.push(...batchResults);
  }
  return results;
}

async function main() {
  console.log('🎨 Fixing Grenoble Paintings images...\n');
  
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const arr = Array.isArray(data) ? data : (data.artworks || data.objects || []);
  const progress = loadProgress();
  
  // Find items with base64 or missing images
  const needsFix = [];
  arr.forEach((obj, idx) => {
    if (progress.processed[obj.id || obj.sourceUrl]) return;
    const img = obj.image || obj.imageUrl || '';
    if (img.startsWith('data:') || !img) {
      needsFix.push({ obj, idx });
    }
  });
  
  console.log(`📋 Need to fix: ${needsFix.length} images`);
  
  if (needsFix.length === 0) {
    console.log('✅ All images already fixed!');
    return;
  }
  
  const toProcess = TEST_MODE ? needsFix.slice(0, MAX_TEST) : needsFix;
  
  const browser = await chromium.launch({ headless: true });
  
  let fixed = 0;
  let failed = 0;
  const BATCH_SIZE = 5;
  
  try {
    for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
      const batch = toProcess.slice(i, i + BATCH_SIZE);
      console.log(`\n[${i + 1}-${Math.min(i + BATCH_SIZE, toProcess.length)}/${toProcess.length}] Processing batch... (fixed: ${fixed}, failed: ${failed})`);
      
      // Process batch in parallel
      const promises = batch.map(async ({ obj, idx }) => {
        const page = await browser.newPage();
        try {
          const newImageUrl = await extractImageUrl(page, obj.sourceUrl);
          return { obj, idx, newImageUrl };
        } finally {
          await page.close();
        }
      });
      
      const results = await Promise.all(promises);
      
      for (const { obj, idx, newImageUrl } of results) {
        if (newImageUrl) {
          if (Array.isArray(data)) {
            data[idx].image = newImageUrl;
            data[idx].imageUrl = newImageUrl;
          } else if (data.artworks) {
            data.artworks[idx].image = newImageUrl;
            data.artworks[idx].imageUrl = newImageUrl;
          } else if (data.objects) {
            data.objects[idx].image = newImageUrl;
            data.objects[idx].imageUrl = newImageUrl;
          }
          console.log(`  ✓ ${obj.title?.substring(0, 40) || obj.id}`);
          fixed++;
        } else {
          console.log(`  ✗ ${obj.title?.substring(0, 40) || obj.id} - no image found`);
          failed++;
        }
        progress.processed[obj.id || obj.sourceUrl] = true;
      }
      
      // Save periodically
      if ((i + BATCH_SIZE) % 20 === 0 || i + BATCH_SIZE >= toProcess.length) {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        saveProgress(progress);
        console.log(`  💾 Saved progress (${fixed} fixed so far)`);
      }
    }
    
    // Final save
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    saveProgress(progress);
    
    console.log(`\n✅ Done! Fixed: ${fixed}, Failed: ${failed}`);
    
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
