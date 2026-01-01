#!/usr/bin/env node
/**
 * Fix Lyon MBA - extract year information from detail pages
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../public/data/mba-lyon-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/fix-lyon-year-progress.json');

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

async function extractYear(page, sourceUrl) {
  try {
    await page.goto(sourceUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await delay(2000);
    
    // Click accept cookies if present
    await page.click('button:has-text("Accept"), button:has-text("Accepter"), button:has-text("ACCEPT")').catch(() => {});
    await delay(1000);
    
    const year = await page.evaluate(() => {
      // Look for date/year in the page content
      const pageText = document.body.innerText;
      
      // Try to find a year in common patterns
      const patterns = [
        /Date[:\s]+(\d{4})/i,
        /Année[:\s]+(\d{4})/i,
        /Year[:\s]+(\d{4})/i,
        /vers\s+(\d{4})/i,
        /circa\s+(\d{4})/i,
        /c\.\s*(\d{4})/i,
        /(\d{4})\s*[-–]/,
      ];
      
      for (const pattern of patterns) {
        const match = pageText.match(pattern);
        if (match && match[1]) {
          const year = parseInt(match[1]);
          if (year >= 1000 && year <= 2025) {
            return match[1];
          }
        }
      }
      
      // Look in structured data
      const dateElements = document.querySelectorAll('[class*="date"], [data-field="date"], .notice-date, dt, dd');
      for (const el of dateElements) {
        const text = el.innerText.trim();
        const match = text.match(/(\d{4})/);
        if (match) {
          return match[1];
        }
      }
      
      return null;
    });
    
    return year;
  } catch (e) {
    // Silently fail for timeouts
    return null;
  }
}

async function main() {
  console.log('🎨 Fixing Lyon MBA year information...\n');
  
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const progress = loadProgress();
  
  // Find items without year
  const needsFix = data.artworks.filter((obj, idx) => {
    if (progress.processed[obj.id]) return false;
    return !obj.year || obj.year === null;
  });
  
  console.log(`📋 Need to fix: ${needsFix.length} items`);
  
  if (needsFix.length === 0) {
    console.log('✅ All years already extracted!');
    return;
  }
  
  const toProcess = TEST_MODE ? needsFix.slice(0, MAX_TEST) : needsFix;
  
  const browser = await chromium.launch({ headless: true });
  
  let fixed = 0;
  let noYear = 0;
  const BATCH_SIZE = 5;
  
  try {
    for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
      const batch = toProcess.slice(i, i + BATCH_SIZE);
      console.log(`\n[${i + 1}-${Math.min(i + BATCH_SIZE, toProcess.length)}/${toProcess.length}] Processing batch... (fixed: ${fixed}, no year: ${noYear})`);
      
      // Process batch in parallel
      const promises = batch.map(async (obj) => {
        const page = await browser.newPage();
        try {
          const year = await extractYear(page, obj.sourceUrl);
          return { obj, year };
        } finally {
          await page.close();
        }
      });
      
      const results = await Promise.all(promises);
      
      for (const { obj, year } of results) {
        const idx = data.artworks.findIndex(o => o.id === obj.id);
        
        if (year) {
          data.artworks[idx].year = year;
          console.log(`  ✓ ${obj.title?.substring(0, 30)} → ${year}`);
          fixed++;
        } else {
          console.log(`  - ${obj.title?.substring(0, 30)} - no year found`);
          noYear++;
        }
        
        progress.processed[obj.id] = true;
      }
      
      // Save periodically
      if ((i + BATCH_SIZE) % 20 === 0 || i + BATCH_SIZE >= toProcess.length) {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        saveProgress(progress);
        console.log(`  💾 Saved progress`);
      }
    }
    
    // Final save
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    saveProgress(progress);
    
    console.log(`\n✅ Done! Fixed: ${fixed}, No year found: ${noYear}`);
    
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
