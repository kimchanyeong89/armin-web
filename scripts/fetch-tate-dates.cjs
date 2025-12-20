/**
 * Fetch artwork dates from Tate website
 * Quick scrape to get year information for each artwork
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DISPLAYS_FILE = path.join(__dirname, '../public/data/tate-britain.json');

async function fetchArtworkDate(page, artworkUrl) {
  try {
    await page.goto(artworkUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
    
    const dateText = await page.evaluate(() => {
      // Look for date in various locations
      const captionEl = document.querySelector('.artwork__caption');
      if (captionEl) {
        const text = captionEl.textContent || '';
        // Look for 4-digit year
        const match = text.match(/\b(1[4-9]\d{2}|20[0-2]\d)\b/);
        if (match) return match[1];
      }
      return null;
    });
    
    return dateText;
  } catch (err) {
    return null;
  }
}

async function main() {
  console.log('=== Fetching Artwork Dates ===\n');

  const data = JSON.parse(fs.readFileSync(DISPLAYS_FILE, 'utf-8'));
  const items = data.items || [];

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const page = await context.newPage();

  let updated = 0;

  for (const item of items) {
    if (!item.id?.startsWith('tate-britain-display-')) continue;

    console.log(`Processing: ${item.title || item.id}`);

    if (!Array.isArray(item.rooms)) continue;

    for (const room of item.rooms) {
      if (!Array.isArray(room.artworks)) continue;

      console.log(`  ${room.name} (${room.artworks.length} artworks)`);

      for (let i = 0; i < room.artworks.length; i++) {
        const artwork = room.artworks[i];
        
        // Skip if already has dateText
        if (artwork.dateText && /\d{4}/.test(artwork.dateText)) continue;
        
        const url = artwork.url;
        if (!url) continue;

        const dateText = await fetchArtworkDate(page, url);
        if (dateText) {
          artwork.dateText = dateText;
          updated++;
          process.stdout.write(`    [${i + 1}] ${dateText} `);
        } else {
          process.stdout.write('.');
        }

        // Quick delay
        await page.waitForTimeout(200);
      }
      console.log();
    }
  }

  await browser.close();

  fs.writeFileSync(DISPLAYS_FILE, JSON.stringify(data, null, 2));
  console.log(`\n=== Done! Updated ${updated} artworks with dates ===`);
}

main().catch(console.error);
