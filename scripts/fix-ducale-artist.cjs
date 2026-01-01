#!/usr/bin/env node
/**
 * Fix Palazzo Ducale - extract artist from original SICAP pages
 * Artist is in table: AMBITO CULTURALE → Denominazione → [artist name]
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../public/data/palazzo-ducale-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/fix-ducale-artist-progress.json');

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

async function extractArtist(page, sourceUrl) {
  try {
    await page.goto(sourceUrl, { waitUntil: 'load', timeout: 20000 });
    await delay(1500);
    
    const artist = await page.evaluate(() => {
      // Look for table structure with AMBITO CULTURALE or AUTHOR section
      const tables = document.querySelectorAll('table');
      
      for (const table of tables) {
        const text = table.innerText;
        
        // Check if this table contains author info
        if (text.includes('AMBITO CULTURALE') || text.includes('Denominazione')) {
          // Look for Denominazione row
          const rows = table.querySelectorAll('tr');
          for (const row of rows) {
            const cells = row.querySelectorAll('td');
            for (let i = 0; i < cells.length; i++) {
              if (cells[i].innerText.trim() === 'Denominazione' && cells[i + 1]) {
                const artistName = cells[i + 1].innerText.trim();
                if (artistName && artistName.length > 0) {
                  return artistName;
                }
              }
            }
          }
        }
      }
      
      // Alternative: look in page text
      const pageText = document.body.innerText;
      const lines = pageText.split('\n').map(l => l.trim());
      
      for (let i = 0; i < lines.length; i++) {
        if (lines[i] === 'Denominazione' && lines[i + 1]) {
          const nextLine = lines[i + 1].trim();
          if (nextLine && nextLine.length > 0 && nextLine !== 'Denominazione') {
            return nextLine;
          }
        }
      }
      
      return null;
    });
    
    return artist;
  } catch (e) {
    return null;
  }
}

async function main() {
  console.log('🎨 Fixing Palazzo Ducale artist information...\n');
  
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const progress = loadProgress();
  
  // Find items with Unknown artist
  const needsFix = [];
  data.artworks.forEach((obj, idx) => {
    if (progress.processed[obj.sourceUrl]) return;
    if (obj.artist === 'Unknown') {
      needsFix.push({ obj, idx });
    }
  });
  
  console.log(`📋 Need to fix: ${needsFix.length} items`);
  
  if (needsFix.length === 0) {
    console.log('✅ All artists already extracted!');
    return;
  }
  
  const toProcess = TEST_MODE ? needsFix.slice(0, MAX_TEST) : needsFix;
  
  const browser = await chromium.launch({ headless: true });
  
  let fixed = 0;
  let noArtist = 0;
  const BATCH_SIZE = 5;
  
  try {
    for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
      const batch = toProcess.slice(i, i + BATCH_SIZE);
      console.log(`\n[${i + 1}-${Math.min(i + BATCH_SIZE, toProcess.length)}/${toProcess.length}] Processing batch... (fixed: ${fixed}, no artist: ${noArtist})`);
      
      // Process batch in parallel
      const promises = batch.map(async ({ obj, idx }) => {
        const page = await browser.newPage();
        try {
          const artist = await extractArtist(page, obj.sourceUrl);
          return { obj, idx, artist };
        } finally {
          await page.close();
        }
      });
      
      const results = await Promise.all(promises);
      
      for (const { obj, idx, artist } of results) {
        if (artist && artist !== 'Unknown') {
          data.artworks[idx].artist = artist;
          console.log(`  ✓ ${obj.title?.substring(0, 30)} → ${artist}`);
          fixed++;
        } else {
          console.log(`  - ${obj.title?.substring(0, 30)} - no artist found`);
          noArtist++;
        }
        
        progress.processed[obj.sourceUrl] = true;
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
    
    console.log(`\n✅ Done! Fixed: ${fixed}, No artist found: ${noArtist}`);
    
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
