/**
 * Enrich Tate Modern Display artworks with proper metadata
 * Fetches title, artist, year from individual artwork pages
 * Same approach as Tate Britain enrichment
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TATE_MODERN_FILE = path.join(__dirname, '../public/data/tate-modern.json');
const LOG_FILE = path.join(__dirname, '../logs/tate-modern-enrich.log');

function log(msg) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}`;
  console.log(msg);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

async function fetchArtworkDetails(page, artworkUrl) {
  try {
    await page.goto(artworkUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(1000);
    
    const data = await page.evaluate(() => {
      // Title - from the main h1 heading
      const h1 = document.querySelector('h1');
      let title = h1?.textContent?.trim() || '';
      
      // Artist - look for "More by X" link pattern
      let artist = '';
      const moreByLink = document.querySelector('a[href*="/art/artists/"]');
      if (moreByLink) {
        const linkText = moreByLink.textContent?.trim() || '';
        // Remove "More by " prefix if present
        artist = linkText.replace(/^More by\s*/i, '').trim();
      }
      
      // Year - find pattern like "1951," right before the artist link
      let year = '';
      
      // Look for the date near the h1 title
      // The structure is: h1 title, then "1951, More by Artist Name"
      const captionArea = document.body.textContent || '';
      
      // Try to find the pattern: 4-digit year followed by comma
      // Look specifically near the title
      const h1Parent = h1?.parentElement;
      if (h1Parent) {
        const siblingText = h1Parent.textContent || '';
        const yearMatch = siblingText.match(/\b(1[89]\d{2}|20[0-2]\d)\s*[,–-]/);
        if (yearMatch) year = yearMatch[1];
      }
      
      // Fallback: look for standalone 4-digit year in caption area
      if (!year) {
        // Look for "1951," or "1951–1952" patterns
        const yearMatch = captionArea.match(/\b(1[89]\d{2}|20[0-2]\d)\s*[,–-]/);
        if (yearMatch) year = yearMatch[1];
      }
      
      // Additional fallback: find year near title
      if (!year && title) {
        const titleIdx = captionArea.indexOf(title);
        if (titleIdx > -1) {
          const afterTitle = captionArea.substring(titleIdx + title.length, titleIdx + title.length + 50);
          const yearMatch = afterTitle.match(/\b(1[89]\d{2}|20[0-2]\d)\b/);
          if (yearMatch) year = yearMatch[1];
        }
      }
      
      return { title, artist, year };
    });
    
    return data;
  } catch (e) {
    log(`    Error: ${e.message}`);
    return null;
  }
}

async function main() {
  log('=== Enriching Tate Modern Display Artworks ===\n');
  
  const data = JSON.parse(fs.readFileSync(TATE_MODERN_FILE, 'utf-8'));
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const page = await context.newPage();
  
  // Accept cookies first
  try {
    await page.goto('https://www.tate.org.uk', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1500);
    const acceptBtn = await page.$('button:has-text("I Accept")');
    if (acceptBtn) await acceptBtn.click({ force: true });
    await page.waitForTimeout(500);
  } catch (e) {}
  
  let totalUpdated = 0;
  let totalArtworks = 0;
  
  for (const item of data.items) {
    if (!item.id?.startsWith('display-')) continue;
    if (!item.rooms) continue;
    
    log(`\n=== ${item.title} ===`);
    
    for (const room of item.rooms) {
      if (!room.artworks) continue;
      
      log(`  Room: ${room.name} (${room.artworks.length} artworks)`);
      
      for (const artwork of room.artworks) {
        totalArtworks++;
        
        // Skip if already has proper title (not empty, not "Untitled", more than 3 chars)
        if (artwork.title && artwork.title !== 'Untitled' && artwork.title.length > 3 && artwork.artist) {
          continue;
        }
        
        if (!artwork.url) continue;
        
        log(`    Fetching: ${artwork.id} - ${artwork.url}`);
        const details = await fetchArtworkDetails(page, artwork.url);
        
        if (details) {
          if (details.title && details.title.length > 0) artwork.title = details.title;
          if (details.artist && details.artist.length > 0) artwork.artist = details.artist;
          if (details.year && details.year.length > 0) artwork.year = details.year;
          totalUpdated++;
          log(`      -> ${details.title} | ${details.artist} | ${details.year}`);
        }
        
        await page.waitForTimeout(300);
      }
    }
    
    // Save progress after each display
    fs.writeFileSync(TATE_MODERN_FILE, JSON.stringify(data, null, 2));
    log(`  Saved progress`);
  }
  
  await browser.close();
  
  log(`\n=== Done! ===`);
  log(`Total artworks: ${totalArtworks}`);
  log(`Updated: ${totalUpdated}`);
}

main().catch(console.error);
