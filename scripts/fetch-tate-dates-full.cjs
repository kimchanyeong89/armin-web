/**
 * Fetch artwork dates from Tate website - Full version
 * Wait for full page load with networkidle
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DISPLAYS_FILE = path.join(__dirname, '../public/data/tate-britain.json');

async function fetchArtworkDate(page, artworkUrl) {
  try {
    await page.goto(artworkUrl, { waitUntil: 'networkidle', timeout: 15000 });
    
    const dateText = await page.evaluate(() => {
      const allText = document.body.innerText;
      
      // Pattern 1: "c.1799" or "1799" followed by comma and "More by"
      let match = allText.match(/\b(c\.?\s*)?([12]\d{3})(?:–\d+)?\s*,\s*More by/i);
      if (match) return match[1] ? `c.${match[2]}` : match[2];
      
      // Pattern 2: Just year in caption area
      const captionArea = document.querySelector('.artwork-hero__caption, .artwork__caption');
      if (captionArea) {
        const captionText = captionArea.innerText;
        match = captionText.match(/\b(c\.?\s*)?([12]\d{3})/);
        if (match) return match[1] ? `c.${match[2]}` : match[2];
      }
      
      // Pattern 3: Look in h1 adjacent text
      const h1 = document.querySelector('h1');
      if (h1) {
        const parent = h1.parentElement;
        if (parent) {
          match = parent.innerText.match(/\b(c\.?\s*)?([12]\d{3})/);
          if (match) return match[1] ? `c.${match[2]}` : match[2];
        }
      }
      
      return null;
    });
    
    return dateText;
  } catch (err) {
    return null;
  }
}

async function main() {
  console.log('=== Fetching All Artwork Dates ===\n');

  const data = JSON.parse(fs.readFileSync(DISPLAYS_FILE, 'utf-8'));
  const items = data.items || [];

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const page = await context.newPage();

  let updated = 0;
  let skipped = 0;

  for (const item of items) {
    if (!item.id?.startsWith('tate-britain-display-')) continue;

    console.log(`\nProcessing: ${item.title || item.id}`);

    if (!Array.isArray(item.rooms)) continue;

    for (const room of item.rooms) {
      if (!Array.isArray(room.artworks)) continue;

      process.stdout.write(`  ${room.name}: `);

      for (let i = 0; i < room.artworks.length; i++) {
        const artwork = room.artworks[i];
        
        // Skip if already has dateText
        if (artwork.dateText && /\d{4}/.test(artwork.dateText)) {
          process.stdout.write('.');
          skipped++;
          continue;
        }
        
        const url = artwork.url;
        if (!url) continue;

        const dateText = await fetchArtworkDate(page, url);
        if (dateText) {
          artwork.dateText = dateText;
          updated++;
          process.stdout.write(`${dateText.slice(-4)} `);
        } else {
          process.stdout.write('x');
        }
      }
      console.log();
    }
    
    // Save after each display
    fs.writeFileSync(DISPLAYS_FILE, JSON.stringify(data, null, 2));
    console.log(`  (saved)`);
  }

  await browser.close();

  console.log(`\n=== Done! Updated ${updated}, Skipped ${skipped} ===`);
}

main().catch(console.error);
