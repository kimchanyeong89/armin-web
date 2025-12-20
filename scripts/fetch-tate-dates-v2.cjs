/**
 * Fetch artwork dates from Tate website - v2
 * The date is in format like "c.1799, More by Artist Name"
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DISPLAYS_FILE = path.join(__dirname, '../public/data/tate-britain.json');

async function fetchArtworkDate(page, artworkUrl) {
  try {
    await page.goto(artworkUrl, { waitUntil: 'domcontentloaded', timeout: 12000 });
    await page.waitForTimeout(300);
    
    const dateText = await page.evaluate(() => {
      // The date appears in format: "c.1799, More by Joseph Mallord William Turner"
      // Look for text containing year followed by "More by"
      const body = document.body.innerText;
      
      // Pattern: year possibly with c. prefix, followed by ", More by"
      const match = body.match(/\b(c\.?\s*)?(1[4-9]\d{2}|20[0-2]\d)(?:–\d+)?\s*,?\s*(?:More by|$)/i);
      if (match) {
        return match[1] ? `c.${match[2]}` : match[2];
      }
      
      // Fallback: look in artwork caption area
      const captionEl = document.querySelector('.artwork__caption');
      if (captionEl) {
        const text = captionEl.textContent || '';
        const yearMatch = text.match(/\b(c\.?\s*)?(1[4-9]\d{2}|20[0-2]\d)/);
        if (yearMatch) {
          return yearMatch[1] ? `c.${yearMatch[2]}` : yearMatch[2];
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
  console.log('=== Fetching Artwork Dates (v2) ===\n');

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

      process.stdout.write(`  ${room.name}: `);

      for (let i = 0; i < room.artworks.length; i++) {
        const artwork = room.artworks[i];
        
        // Skip if already has dateText
        if (artwork.dateText && /\d{4}/.test(artwork.dateText)) {
          process.stdout.write('.');
          continue;
        }
        
        const url = artwork.url;
        if (!url) continue;

        const dateText = await fetchArtworkDate(page, url);
        if (dateText) {
          artwork.dateText = dateText;
          updated++;
          process.stdout.write(dateText.slice(-4) + ' ');
        } else {
          process.stdout.write('x');
        }

        // Quick delay
        await page.waitForTimeout(150);
      }
      console.log();
    }
  }

  await browser.close();

  fs.writeFileSync(DISPLAYS_FILE, JSON.stringify(data, null, 2));
  console.log(`\n=== Done! Updated ${updated} artworks with dates ===`);
}

main().catch(console.error);
