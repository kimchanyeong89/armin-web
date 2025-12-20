/**
 * Enrich Tate Britain Display artworks with title, artist, year, and high-res image
 * Version 2 - Fixed selectors for Tate website
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DISPLAYS_FILE = path.join(__dirname, '../public/data/tate-britain.json');
const OUTPUT_FILE = path.join(__dirname, '../public/data/tate-britain.json');

async function enrichArtwork(page, artworkUrl) {
  try {
    await page.goto(artworkUrl, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(800);

    const data = await page.evaluate(() => {
      // Title - from h1 in artwork caption
      const titleEl = document.querySelector('.artwork__caption h1') ||
                      document.querySelector('h1');
      const title = titleEl?.textContent?.trim() || '';

      // Artist and date - look for the link "More by Artist Name" and nearby date
      // Format: "1835, More by John Constable"
      const captionText = document.querySelector('.artwork__caption')?.textContent || '';
      
      // Extract artist from "More by Artist Name" pattern
      const artistMatch = captionText.match(/More by ([^,\n]+)/);
      const artist = artistMatch ? artistMatch[1].trim() : '';
      
      // Extract date - usually 4 digits at the start or after comma
      const dateMatch = captionText.match(/(\d{4})/);
      const dateText = dateMatch ? dateMatch[1] : '';

      // High-res image - look for img with _10.jpg pattern
      const imgEl = document.querySelector('img[src*="media.tate.org.uk/art/images/work"]');
      let image = '';
      if (imgEl) {
        image = imgEl.getAttribute('src') || '';
        // Ensure we get the high-res version (_10)
        if (image && !image.includes('_10.')) {
          image = image.replace(/_\d+\./, '_10.');
        }
      }
      
      // Fallback: look in srcset
      if (!image) {
        const pictureEl = document.querySelector('picture source');
        if (pictureEl) {
          const srcset = pictureEl.getAttribute('srcset');
          if (srcset) {
            const sources = srcset.split(',').map(s => s.trim().split(' ')[0]);
            image = sources[sources.length - 1] || sources[0] || '';
          }
        }
      }

      return { title, artist, dateText, image };
    });

    return data;
  } catch (err) {
    console.error(`  Error fetching ${artworkUrl}:`, err.message);
    return null;
  }
}

async function main() {
  console.log('=== Enriching Tate Britain Display Artworks (v2) ===\n');

  // Load current data
  const data = JSON.parse(fs.readFileSync(DISPLAYS_FILE, 'utf-8'));
  const items = data.items || [];

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const page = await context.newPage();

  let totalEnriched = 0;

  for (const item of items) {
    if (!item.id?.startsWith('tate-britain-display-')) continue;

    console.log(`\n=== Processing: ${item.title || item.id} ===`);

    if (!Array.isArray(item.rooms)) continue;

    // Assign room numbers 1, 2, 3...
    let roomNumber = 1;
    for (const room of item.rooms) {
      room.roomNumber = `Room ${roomNumber}`;
      roomNumber++;

      if (!Array.isArray(room.artworks)) continue;

      console.log(`  Room ${room.roomNumber}: ${room.name} (${room.artworks.length} artworks)`);

      for (let i = 0; i < room.artworks.length; i++) {
        const artwork = room.artworks[i];
        const url = artwork.url;
        if (!url) continue;

        // Check if already has good data (not bad scraped data)
        const hasBadImage = artwork.image?.includes('Lead_image') || artwork.image?.includes('original_images');
        const hasBadDate = artwork.dateText?.includes('Until') || artwork.dateText?.includes('Feb');
        
        if (artwork.title && artwork.title !== 'Untitled' && artwork.artist && artwork.image && !hasBadImage && !hasBadDate) {
          continue; // Already has good data
        }

        console.log(`    [${i + 1}/${room.artworks.length}] Fetching: ${url.split('/').pop()}`);

        const enriched = await enrichArtwork(page, url);
        if (enriched) {
          if (enriched.title && enriched.title !== 'Untitled') artwork.title = enriched.title;
          if (enriched.artist) artwork.artist = enriched.artist;
          if (enriched.dateText && !enriched.dateText.includes('Until')) artwork.dateText = enriched.dateText;
          if (enriched.image && !enriched.image.includes('original_images')) artwork.image = enriched.image;
          totalEnriched++;
        }

        // Small delay to be polite
        await page.waitForTimeout(400);
      }
    }
  }

  await browser.close();

  // Save enriched data
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));
  console.log(`\n=== Done! Enriched ${totalEnriched} artworks ===`);
  console.log(`Saved to: ${OUTPUT_FILE}`);
}

main().catch(console.error);
