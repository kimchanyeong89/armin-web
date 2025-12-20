/**
 * Fix ALL Tate Modern artwork years by fetching from individual artwork pages
 * Parse the exact format: "Year, More by Artist" or structured data
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '../public/data/tate-modern.json');

async function fetchArtworkDetails(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(800);
    
    // Get the full page HTML
    const html = await page.content();
    
    // Method 1: Look for pattern "YEAR, More by ARTIST" in page
    // Example: "1990, More by Pacita Abad"
    const moreByMatch = html.match(/(\d{4}|c\.\s*\d{4}(?:[-–]\d{2,4})?|n\.d\.?),?\s*(?:<[^>]*>)*\s*More by/i);
    if (moreByMatch) {
      let year = moreByMatch[1].trim();
      // Clean up: "c.1939-40" -> "c.1939-40", "1990" -> "1990"
      return { year };
    }
    
    // Method 2: Look in artwork caption structure
    // The year appears right after the title, before "More by"
    const captionMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>[\s\S]*?(\d{4}|c\.\s*\d{4}(?:[-–]\d{2,4})?|n\.d\.?)\s*,?\s*(?:<[^>]*>)*\s*(?:More by|<a[^>]*>More by)/i);
    if (captionMatch) {
      return { year: captionMatch[2].trim() };
    }
    
    // Method 3: Look for date in JSON-LD or meta tags
    const jsonLdMatch = html.match(/"dateCreated"\s*:\s*"([^"]+)"/i);
    if (jsonLdMatch) {
      return { year: jsonLdMatch[1] };
    }
    
    // Method 4: Look for any standalone year pattern near "date" context
    const dateMatch = html.match(/(?:date|created|year)[^>]*>?\s*:?\s*(\d{4}|c\.\s*\d{4}[-–]?\d{0,4})/i);
    if (dateMatch) {
      return { year: dateMatch[1].trim() };
    }
    
    // Method 5: Extract from visible caption text
    const captionText = await page.evaluate(() => {
      // Find the artwork caption area
      const caption = document.querySelector('.artwork__caption, [class*="caption"], [class*="artwork-info"]');
      if (caption) return caption.textContent;
      
      // Or look near the h1
      const h1 = document.querySelector('h1');
      if (h1) {
        let text = '';
        let el = h1.nextElementSibling;
        for (let i = 0; i < 5 && el; i++) {
          text += ' ' + el.textContent;
          el = el.nextElementSibling;
        }
        return text;
      }
      return '';
    });
    
    if (captionText) {
      // Look for year patterns: "1990", "c.1939-40", "n.d"
      const yearPattern = captionText.match(/\b(c\.\s*\d{4}(?:[-–]\d{2,4})?|\d{4}|n\.d\.?)\b/i);
      if (yearPattern) {
        return { year: yearPattern[1].trim() };
      }
    }
    
    return { year: '' };
  } catch (err) {
    console.error(`    Error: ${err.message}`);
    return { year: '' };
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
      
      console.log(`  Room: ${room.name} (${room.artworks.length} artworks)`);
      
      for (const artwork of room.artworks) {
        if (!artwork.url) continue;
        
        totalProcessed++;
        process.stdout.write(`    [${artwork.id}] ${artwork.title?.substring(0, 30) || 'Untitled'}...`);
        
        const { year } = await fetchArtworkDetails(page, artwork.url);
        
        if (year) {
          if (year !== artwork.year) {
            console.log(` ${artwork.year || '(empty)'} -> ${year} ✓`);
            artwork.year = year;
            totalFixed++;
          } else {
            console.log(` ${year} (OK)`);
          }
        } else {
          console.log(` (no year found)`);
        }
        
        await page.waitForTimeout(200);
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
