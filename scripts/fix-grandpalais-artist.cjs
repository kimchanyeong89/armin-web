#!/usr/bin/env node
/**
 * Fix Grand Palais collections - extract artist and year from detail pages
 * Works for: Fabre, Mucem, and other Grand Palais scraped collections
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Configuration - which collection to fix
const COLLECTIONS = {
  'fabre': {
    file: 'musee-fabre-collection.json',
    name: 'Musée Fabre'
  },
  'mucem': {
    file: 'mucem-collection.json',
    name: 'Mucem'
  }
};

const collectionKey = process.argv[2] || 'fabre';
const config = COLLECTIONS[collectionKey];

if (!config) {
  console.log('Usage: node fix-grandpalais-artist.cjs <fabre|mucem>');
  process.exit(1);
}

const DATA_FILE = path.join(__dirname, '../public/data', config.file);
const PROGRESS_FILE = path.join(__dirname, `../downloads/fix-${collectionKey}-artist-progress.json`);

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

async function extractArtistAndYear(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await delay(1500);
    
    const result = await page.evaluate(() => {
      const pageText = document.body.innerText;
      const lines = pageText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      
      let artist = null;
      let year = null;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Find Author line
        if (line === 'Author' && i + 1 < lines.length) {
          const nextLine = lines[i + 1];
          // Extract name without dates: "Le Brun Charles (1619-1690)" → "Le Brun Charles"
          const match = nextLine.match(/^([^(]+)/);
          if (match) {
            artist = match[1].trim();
          }
        }
        
        // Find Period line for year
        if (line === 'Period' && i + 1 < lines.length) {
          const nextLine = lines[i + 1];
          // Try to extract century or year
          const centuryMatch = nextLine.match(/(\d+)(?:st|nd|rd|th)\s*century/i);
          if (centuryMatch) {
            year = centuryMatch[1] + 'th century';
          } else {
            const yearMatch = nextLine.match(/(\d{4})/);
            if (yearMatch) {
              year = yearMatch[1];
            } else {
              year = nextLine;
            }
          }
        }
      }
      
      return { artist, year };
    });
    
    return result;
  } catch (e) {
    console.error(`Error fetching ${url}:`, e.message);
    return { artist: null, year: null };
  }
}

async function main() {
  console.log(`🎨 Fixing ${config.name} artist/year information...\n`);
  
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const progress = loadProgress();
  
  // Find items that need fixing
  const needsFix = data.objects.filter((obj, idx) => {
    if (progress.processed[obj.id]) return false;
    // Need fix if artist is Unknown or year is null/empty
    return obj.artist === 'Unknown' || !obj.year;
  });
  
  console.log(`📋 Need to fix: ${needsFix.length} items`);
  
  if (needsFix.length === 0) {
    console.log('✅ All items already fixed!');
    return;
  }
  
  const toProcess = TEST_MODE ? needsFix.slice(0, MAX_TEST) : needsFix;
  
  const browser = await chromium.launch({ headless: true });
  
  let artistFixed = 0;
  let yearFixed = 0;
  let noChange = 0;
  const BATCH_SIZE = 5;
  
  try {
    for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
      const batch = toProcess.slice(i, i + BATCH_SIZE);
      console.log(`\n[${i + 1}-${Math.min(i + BATCH_SIZE, toProcess.length)}/${toProcess.length}] Processing batch... (artist: ${artistFixed}, year: ${yearFixed})`);
      
      // Process batch in parallel
      const promises = batch.map(async (obj) => {
        const page = await browser.newPage();
        try {
          const { artist, year } = await extractArtistAndYear(page, obj.sourceUrl);
          return { obj, artist, year };
        } finally {
          await page.close();
        }
      });
      
      const results = await Promise.all(promises);
      
      for (const { obj, artist, year } of results) {
        const idx = data.objects.findIndex(o => o.id === obj.id);
        let changed = false;
        
        if (artist && obj.artist === 'Unknown') {
          data.objects[idx].artist = artist;
          artistFixed++;
          changed = true;
        }
        
        if (year && (!obj.year || obj.year === null)) {
          data.objects[idx].year = year;
          yearFixed++;
          changed = true;
        }
        
        if (changed) {
          console.log(`  ✓ ${obj.title?.substring(0, 30)} → ${artist || '-'} / ${year || '-'}`);
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
    
    console.log(`\n✅ Done! Artist fixed: ${artistFixed}, Year fixed: ${yearFixed}, No change: ${noChange}`);
    
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
