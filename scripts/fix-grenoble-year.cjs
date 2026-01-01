#!/usr/bin/env node
/**
 * Fix Grenoble Drawings/Photography - extract year from Navigart pages
 * Year format: "XIXe siècle", "XXe siècle", "1875", "vers 1844 - 1860"
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const COLLECTION = process.argv[2] || 'drawings'; // 'drawings' or 'photography'
const DATA_FILES = {
  'drawings': 'musee-grenoble-drawings-collection.json',
  'photography': 'musee-grenoble-photography-collection.json'
};

const DATA_FILE = path.join(__dirname, '../public/data', DATA_FILES[COLLECTION]);
const PROGRESS_FILE = path.join(__dirname, `../downloads/fix-grenoble-${COLLECTION}-year-progress.json`);

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
    await page.goto(sourceUrl, { waitUntil: 'load', timeout: 20000 });
    await delay(2000);
    
    const year = await page.evaluate(() => {
      const text = document.body.innerText;
      
      // Look for century format: "XIXe siècle", "XXe siècle", "XVIIe siècle"
      const centuryMatch = text.match(/(X{0,3}(?:IX|IV|V?I{0,3})e)\s*siècle/i);
      if (centuryMatch) {
        return centuryMatch[0];
      }
      
      // Look for year range: "vers 1844 - 1860", "1800-1850"
      const rangeMatch = text.match(/(?:vers\s+)?(\d{4})\s*[-–]\s*(\d{4})/i);
      if (rangeMatch) {
        return rangeMatch[0];
      }
      
      // Look for approximate year: "vers 1850"
      const approxMatch = text.match(/vers\s+(\d{4})/i);
      if (approxMatch) {
        return approxMatch[0];
      }
      
      // Look for single year in the artwork details
      const lines = text.split('\n').filter(l => l.trim());
      for (let i = 0; i < Math.min(lines.length, 20); i++) {
        const line = lines[i].trim();
        // Match standalone year or year at start/end of line
        if (/^(\d{4})$/.test(line)) {
          return line;
        }
      }
      
      return null;
    });
    
    return year;
  } catch (e) {
    return null;
  }
}

async function main() {
  console.log(`🎨 Fixing Grenoble ${COLLECTION} year information...\n`);
  
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const arr = data.artworks || data.objects || data;
  const progress = loadProgress();
  
  // Find items without year
  const needsFix = [];
  arr.forEach((obj, idx) => {
    if (progress.processed[obj.id || obj.sourceUrl]) return;
    if (!obj.year || obj.year === '') {
      needsFix.push({ obj, idx });
    }
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
      const promises = batch.map(async ({ obj, idx }) => {
        const page = await browser.newPage();
        try {
          const year = await extractYear(page, obj.sourceUrl);
          return { obj, idx, year };
        } finally {
          await page.close();
        }
      });
      
      const results = await Promise.all(promises);
      
      for (const { obj, idx, year } of results) {
        if (year) {
          if (data.artworks) {
            data.artworks[idx].year = year;
          } else if (data.objects) {
            data.objects[idx].year = year;
          } else {
            data[idx].year = year;
          }
          console.log(`  ✓ ${obj.title?.substring(0, 30)} → ${year}`);
          fixed++;
        } else {
          console.log(`  - ${obj.title?.substring(0, 30)} - no year found`);
          noYear++;
        }
        
        progress.processed[obj.id || obj.sourceUrl] = true;
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
