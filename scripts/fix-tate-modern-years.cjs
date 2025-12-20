/**
 * Fix Tate Modern artwork years by fetching from individual artwork pages
 * Force re-fetch ALL artworks to get correct years
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '../public/data/tate-modern.json');

async function fetchArtworkYear(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(500);
    
    // Year is in the caption area - look for 4-digit year pattern
    // Format on Tate: "Artist Name Title Year"
    const caption = await page.$eval('.artwork__caption, .artwork-caption, [class*="caption"]', el => el.textContent).catch(() => null);
    
    if (caption) {
      // Extract 4-digit year (1800-2030 range)
      const yearMatch = caption.match(/\b(1[89]\d{2}|20[0-2]\d)\b/);
      if (yearMatch) {
        return yearMatch[1];
      }
    }
    
    // Try from page content - look for date pattern
    const pageContent = await page.content();
    
    // Look for "date" field or year in structured data
    const dateMatch = pageContent.match(/"date"\s*:\s*"?(\d{4})"?/i);
    if (dateMatch) {
      return dateMatch[1];
    }
    
    // Look for year near title in h1 area
    const h1Area = await page.$eval('h1', el => {
      // Get h1 and next few siblings
      let text = el.textContent;
      let sibling = el.nextElementSibling;
      for (let i = 0; i < 3 && sibling; i++) {
        text += ' ' + sibling.textContent;
        sibling = sibling.nextElementSibling;
      }
      return text;
    }).catch(() => '');
    
    const h1YearMatch = h1Area.match(/\b(1[89]\d{2}|20[0-2]\d)\b/);
    if (h1YearMatch) {
      return h1YearMatch[1];
    }
    
    return null;
  } catch (err) {
    console.error(`    Error fetching ${url}:`, err.message);
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
  
  // Accept cookies
  try {
    await page.goto('https://www.tate.org.uk', { waitUntil: 'domcontentloaded' });
    const acceptBtn = await page.$('button:has-text("Accept"), [class*="accept"]');
    if (acceptBtn) await acceptBtn.click();
    await page.waitForTimeout(1000);
  } catch (e) {}
  
  console.log('=== Fixing Tate Modern Artwork Years ===\n');
  
  let totalFixed = 0;
  
  for (const item of data.items) {
    if (!item.id?.startsWith('display-')) continue;
    if (!item.rooms?.length) continue;
    
    console.log(`\n=== ${item.title} ===`);
    
    for (const room of item.rooms) {
      if (!room.artworks?.length) continue;
      
      console.log(`  Room: ${room.name} (${room.artworks.length} artworks)`);
      
      for (const artwork of room.artworks) {
        if (!artwork.url) continue;
        
        console.log(`    Fetching: ${artwork.id} - ${artwork.url}`);
        
        const year = await fetchArtworkYear(page, artwork.url);
        
        if (year && year !== artwork.year) {
          console.log(`      FIXED: ${artwork.year || '(empty)'} -> ${year}`);
          artwork.year = year;
          totalFixed++;
        } else if (year) {
          console.log(`      OK: ${year}`);
        } else {
          console.log(`      Could not find year`);
        }
        
        await page.waitForTimeout(300);
      }
    }
    
    // Save after each display
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
    console.log(`  Saved progress`);
  }
  
  await browser.close();
  
  console.log(`\n=== Done! Fixed ${totalFixed} artwork years ===`);
}

main().catch(console.error);
