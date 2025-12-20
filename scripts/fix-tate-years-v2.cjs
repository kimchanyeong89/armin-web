/**
 * Fix ALL Tate Modern artwork years by fetching from page title
 * Pattern: "'Title', Artist, Year | Tate"
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '../public/data/tate-modern.json');

async function fetchArtworkYear(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(500);
    
    // Get page title: "'European Mask', Pacita Abad, 1990 | Tate"
    const title = await page.title();
    
    // Extract year from title pattern: "..., YEAR | Tate" or "..., c.YEAR-YEAR | Tate"
    // Matches: 1990, c.1939-40, c.1985–6, n.d.
    const yearMatch = title.match(/,\s*(c\.?\s*\d{4}(?:[-–]\d{2,4})?|\d{4}|n\.?\s*d\.?)\s*\|\s*Tate/i);
    
    if (yearMatch) {
      let year = yearMatch[1].trim();
      // Normalize: remove extra spaces
      year = year.replace(/\s+/g, '');
      return year;
    }
    
    // Fallback: look for year pattern in title more loosely
    const looseMatch = title.match(/(\d{4})\s*\|\s*Tate/i);
    if (looseMatch) {
      return looseMatch[1];
    }
    
    return null;
  } catch (err) {
    console.error(`    Error: ${err.message.substring(0, 50)}`);
    return null;
  }
}

async function main() {
  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const page = await context.newPage();
  
  // Accept cookies first
  try {
    await page.goto('https://www.tate.org.uk', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    const acceptBtn = await page.$('button:has-text("Accept")');
    if (acceptBtn) {
      await acceptBtn.click();
      await page.waitForTimeout(500);
    }
  } catch (e) {}
  
  console.log('=== Fixing ALL Tate Modern Artwork Years ===\n');
  
  let totalProcessed = 0;
  let totalFixed = 0;
  
  for (const item of data.items) {
    if (!item.id?.startsWith('display-')) continue;
    if (!item.rooms?.length) continue;
    
    console.log(`\n=== ${item.title} ===`);
    
    for (const room of item.rooms) {
      if (!room.artworks?.length) continue;
      
      console.log(`  Room: ${room.name} (${room.artworks.length})`);
      
      for (const artwork of room.artworks) {
        if (!artwork.url) continue;
        
        totalProcessed++;
        
        const year = await fetchArtworkYear(page, artwork.url);
        
        if (year) {
          if (year !== artwork.year) {
            console.log(`    [${artwork.id}] ${artwork.year || '(empty)'} -> ${year}`);
            artwork.year = year;
            totalFixed++;
          }
        } else {
          // Keep existing or leave empty
          if (artwork.year) {
            console.log(`    [${artwork.id}] keeping ${artwork.year} (no title match)`);
          }
        }
        
        await page.waitForTimeout(150);
      }
    }
    
    // Save after each display
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
    console.log(`  [Saved]`);
  }
  
  await browser.close();
  
  console.log(`\n=== Done! ===`);
  console.log(`Processed: ${totalProcessed}`);
  console.log(`Fixed: ${totalFixed}`);
}

main().catch(console.error);
