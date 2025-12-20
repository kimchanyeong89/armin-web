/**
 * Re-scrape Tate Modern Display artworks with correct title/artist/year
 * Uses the same approach as Tate Britain that worked correctly
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const https = require('https');
const sharp = require('sharp');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = 'armin-gallery-images';
const R2_PUBLIC_URL = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';

const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

const TATE_MODERN_FILE = path.join(__dirname, '../public/data/tate-modern.json');

/**
 * Fetch artwork details from Tate artwork page
 * This is the CORRECT way - extract from the structured page
 */
async function fetchArtworkDetails(page, artworkUrl) {
  try {
    await page.goto(artworkUrl, { waitUntil: 'networkidle', timeout: 25000 });
    await page.waitForTimeout(1000);
    
    const data = await page.evaluate(() => {
      // Title - from the main h1 heading
      const h1 = document.querySelector('h1');
      const title = h1?.textContent?.trim() || '';
      
      // Artist - from the link or text near "More by" or from structured data
      let artist = '';
      
      // Try structured header area first
      const artistLink = document.querySelector('a[href*="/art/artists/"]');
      if (artistLink) {
        artist = artistLink.textContent?.trim() || '';
      }
      
      // Fallback: look for "More by Artist Name" pattern
      if (!artist) {
        const bodyText = document.body.textContent || '';
        const moreByMatch = bodyText.match(/More by ([^\n]+?)(?:\s*\n|$)/);
        if (moreByMatch) {
          artist = moreByMatch[1].trim();
        }
      }
      
      // Year - look in the caption/details area
      let year = '';
      const detailsText = document.body.textContent || '';
      
      // Common patterns: "1990", "exhibited 1990", "c.1990", "1989-90"
      // Look for year near the title/artwork info, not random years in page
      const captionArea = document.querySelector('.artwork__caption, [class*="caption"], [class*="details"]');
      const captionText = captionArea?.textContent || detailsText.substring(0, 2000);
      
      const yearMatch = captionText.match(/\b(1[4-9]\d{2}|20[0-2]\d)\b/);
      if (yearMatch) {
        year = yearMatch[1];
      }
      
      return { title, artist, year };
    });
    
    return data;
  } catch (e) {
    console.log(`      Error: ${e.message}`);
    return null;
  }
}

async function main() {
  console.log('=== Re-scraping Tate Modern Display artworks ===\n');
  
  const data = JSON.parse(fs.readFileSync(TATE_MODERN_FILE, 'utf-8'));
  const displays = data.items.filter(it => it.id && it.id.startsWith('display-'));
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const page = await context.newPage();
  
  // Accept cookies first
  try {
    await page.goto('https://www.tate.org.uk', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000);
    const acceptBtn = await page.$('button:has-text("I Accept")');
    if (acceptBtn) {
      await acceptBtn.click({ force: true });
      await page.waitForTimeout(1000);
    }
  } catch (e) {}
  
  for (const display of displays) {
    if (!display.rooms || display.rooms.length === 0) continue;
    
    console.log(`\n=== ${display.title} ===`);
    
    for (const room of display.rooms) {
      if (!room.artworks || room.artworks.length === 0) continue;
      
      console.log(`  Room: ${room.name} (${room.artworks.length} artworks)`);
      
      for (const artwork of room.artworks) {
        // Skip if already has correct title (not empty)
        if (artwork.title && artwork.title !== 'Untitled' && artwork.title.length > 3) {
          continue;
        }
        
        if (!artwork.url) continue;
        
        console.log(`    Fetching: ${artwork.url}`);
        const details = await fetchArtworkDetails(page, artwork.url);
        
        if (details) {
          if (details.title) artwork.title = details.title;
          if (details.artist) artwork.artist = details.artist;
          if (details.year) artwork.year = details.year;
          console.log(`      -> ${artwork.title} | ${artwork.artist} | ${artwork.year}`);
        }
        
        await page.waitForTimeout(300);
      }
    }
    
    // Save after each display
    fs.writeFileSync(TATE_MODERN_FILE, JSON.stringify(data, null, 2));
    console.log(`  Saved!`);
  }
  
  await browser.close();
  console.log('\nDone!');
}

main().catch(console.error);
