/**
 * Enrich Tate Britain Display artworks with title, artist, year, and high-res image
 * Fetches each artwork page to get complete metadata
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DISPLAYS_FILE = path.join(__dirname, '../public/data/tate-britain.json');
const OUTPUT_FILE = path.join(__dirname, '../public/data/tate-britain.json');

async function enrichArtwork(page, artworkUrl) {
  try {
    await page.goto(artworkUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(500);

    const data = await page.evaluate(() => {
      // Title - from h1 or artwork-caption__work
      const titleEl = document.querySelector('h1.artwork-caption__work') ||
                      document.querySelector('h1[class*="title"]') ||
                      document.querySelector('.artwork-hero__caption h1');
      const title = titleEl?.textContent?.trim() || '';

      // Artist - from artwork-caption__artist or similar
      const artistEl = document.querySelector('.artwork-caption__artist a') ||
                       document.querySelector('.artwork-caption__artist') ||
                       document.querySelector('[class*="artist"]');
      const artist = artistEl?.textContent?.trim() || '';

      // Date - from artwork-caption__date
      const dateEl = document.querySelector('.artwork-caption__date') ||
                     document.querySelector('[class*="date"]');
      const dateText = dateEl?.textContent?.trim() || '';

      // High-res image - look for the main artwork image
      const imgEl = document.querySelector('.media-viewer__image img') ||
                    document.querySelector('.artwork-hero__image img') ||
                    document.querySelector('img[src*="media.tate.org.uk"]') ||
                    document.querySelector('picture source[srcset*="tate.org.uk"]');
      
      let image = '';
      if (imgEl) {
        // Get srcset if available for higher res
        const srcset = imgEl.getAttribute('srcset') || imgEl.parentElement?.querySelector('source')?.getAttribute('srcset');
        if (srcset) {
          // Parse srcset and get the largest image
          const sources = srcset.split(',').map(s => {
            const parts = s.trim().split(' ');
            return { url: parts[0], size: parseInt(parts[1]) || 0 };
          });
          sources.sort((a, b) => b.size - a.size);
          if (sources.length > 0) {
            image = sources[0].url;
          }
        }
        if (!image) {
          image = imgEl.getAttribute('src') || '';
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
  console.log('=== Enriching Tate Britain Display Artworks ===\n');

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

    // Assign room numbers 1-8
    let roomNumber = 1;
    for (const room of item.rooms) {
      room.roomNumber = `Room ${roomNumber}`;
      roomNumber++;

      if (!Array.isArray(room.artworks)) continue;

      console.log(`  Room: ${room.name} (${room.artworks.length} artworks)`);

      for (let i = 0; i < room.artworks.length; i++) {
        const artwork = room.artworks[i];
        
        // Skip if already has complete data
        if (artwork.title && artwork.title !== 'Untitled' && artwork.artist && artwork.image) {
          continue;
        }

        const url = artwork.url;
        if (!url) continue;

        console.log(`    [${i + 1}/${room.artworks.length}] Fetching: ${url.split('/').pop()}`);

        const enriched = await enrichArtwork(page, url);
        if (enriched) {
          if (enriched.title) artwork.title = enriched.title;
          if (enriched.artist) artwork.artist = enriched.artist;
          if (enriched.dateText) artwork.dateText = enriched.dateText;
          if (enriched.image) artwork.image = enriched.image;
          totalEnriched++;
        }

        // Small delay to be polite
        await page.waitForTimeout(300);
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
