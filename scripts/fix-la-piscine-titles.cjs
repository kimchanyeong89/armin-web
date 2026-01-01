#!/usr/bin/env node
/**
 * Fix La Piscine titles - extract real titles from Grand Palais pages
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../public/data/la-piscine-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/fix-la-piscine-progress.json');

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

async function extractTitle(page, url) {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await delay(3000);
    
    // Wait for h1 to load
    await page.waitForSelector('h1', { timeout: 15000 }).catch(() => {});
    
    const title = await page.evaluate(() => {
      // Get all h1 elements
      const h1s = document.querySelectorAll('h1');
      for (const h1 of h1s) {
        const text = h1.innerText.trim();
        // Filter out navigation or generic titles
        if (text && 
            text !== 'Search' && 
            text !== 'GrandPalaisRmnPhoto' && 
            !text.includes('Search results') &&
            text.length > 3) {
          return text;
        }
      }
      
      // Fallback: meta og:title
      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle && ogTitle.content) {
        return ogTitle.content;
      }
      
      // Fallback: look for title in page content near the image
      const pageText = document.body.innerText;
      // Look for lines that look like artwork titles (before "Author" or "System identifier")
      const lines = pageText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      for (let i = 0; i < lines.length; i++) {
        if (lines[i] === 'Author' || lines[i] === 'System identifier') {
          // The title is likely the previous non-empty significant line
          for (let j = i - 1; j >= 0 && j >= i - 5; j--) {
            const line = lines[j];
            if (line.length > 5 && 
                line !== 'Search' && 
                !line.includes('ADD TO') &&
                !line.includes('Login') &&
                !line.includes('Newsletter')) {
              return line;
            }
          }
        }
      }
      
      return null;
    });
    
    return title;
  } catch (e) {
    console.error(`Error fetching ${url}:`, e.message);
    return null;
  }
}

async function main() {
  console.log('🎨 Fixing La Piscine titles...\n');
  
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const progress = loadProgress();
  
  // Find items that need title fix (title === mediaNumber)
  const needsFix = data.objects.filter((obj, idx) => {
    if (progress.processed[obj.id]) return false;
    return obj.title === obj.mediaNumber;
  });
  
  console.log(`📋 Need to fix: ${needsFix.length} titles`);
  
  if (needsFix.length === 0) {
    console.log('✅ All titles already fixed!');
    return;
  }
  
  const toProcess = TEST_MODE ? needsFix.slice(0, MAX_TEST) : needsFix;
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const page = await context.newPage();
  
  let fixed = 0;
  let failed = 0;
  
  try {
    for (let i = 0; i < toProcess.length; i++) {
      const obj = toProcess[i];
      const idx = data.objects.findIndex(o => o.id === obj.id);
      
      if ((i + 1) % 10 === 1 || i === 0) {
        console.log(`\n[${i + 1}/${toProcess.length}] Processing... (fixed: ${fixed}, failed: ${failed})`);
      }
      
      const newTitle = await extractTitle(page, obj.sourceUrl);
      
      if (newTitle && newTitle !== obj.mediaNumber) {
        data.objects[idx].title = newTitle;
        console.log(`  ✓ ${obj.mediaNumber} → "${newTitle}"`);
        fixed++;
      } else {
        console.log(`  ✗ ${obj.mediaNumber} - no title found`);
        failed++;
      }
      
      progress.processed[obj.id] = true;
      
      // Save periodically
      if ((i + 1) % 20 === 0) {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        saveProgress(progress);
        console.log(`  💾 Saved progress`);
      }
      
      await delay(800);
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
