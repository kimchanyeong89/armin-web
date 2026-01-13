/**
 * Fix Rivoli artist names - Extract from og:title meta tag
 * Format: "Title - Artist Name - Castello di Rivoli"
 */
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const DATA_FILE = path.join(__dirname, '../public/data/castello-di-rivoli-collection.json');
const LOG_FILE = path.join(__dirname, '../downloads/rivoli-artist-fix.log');

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  const line = `[${ts}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

async function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function getArtistFromPage(browser, url) {
  const page = await browser.newPage();
  try {
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(500);
    
    const artist = await page.evaluate(() => {
      // Try og:title first: "Title - Artist Name - Castello di Rivoli"
      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) {
        const content = ogTitle.content;
        const parts = content.split(' - ');
        if (parts.length >= 3) {
          // Second to last part is the artist (last is "Castello di Rivoli")
          return parts[parts.length - 2].trim();
        }
      }
      
      // Try page title
      const title = document.querySelector('title');
      if (title) {
        const content = title.textContent;
        const parts = content.split(' - ');
        if (parts.length >= 3) {
          return parts[parts.length - 2].trim();
        }
      }
      
      // Try meta description: "...by [Artist Name] in the collection..."
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) {
        const content = metaDesc.content;
        const byMatch = content.match(/by\s+([^"]+?)\s+in the collection/i);
        if (byMatch) {
          return byMatch[1].trim();
        }
      }
      
      // Try og:description
      const ogDesc = document.querySelector('meta[property="og:description"]');
      if (ogDesc) {
        const content = ogDesc.content;
        const byMatch = content.match(/by\s+([^"]+?)\s+in the collection/i);
        if (byMatch) {
          return byMatch[1].trim();
        }
      }
      
      return null;
    });
    
    await page.close();
    return artist;
  } catch (err) {
    try { await page.close(); } catch {}
    throw err;
  }
}

async function main() {
  // Load current data
  const artworks = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  log(`Loaded ${artworks.length} artworks`);
  
  // Filter those with Unknown artist
  const unknownArtists = artworks.filter(a => a.artist === 'Unknown' || !a.artist);
  log(`Unknown artists: ${unknownArtists.length}`);
  
  if (unknownArtists.length === 0) {
    log('No artworks with Unknown artist!');
    return;
  }
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  
  let fixed = 0;
  let errors = 0;
  
  for (let i = 0; i < unknownArtists.length; i++) {
    const artwork = unknownArtists[i];
    const slug = artwork.sourceUrl.split('/').filter(Boolean).pop();
    
    if ((i + 1) % 50 === 0 || i < 5) {
      log(`[${i + 1}/${unknownArtists.length}] ${slug}`);
    }
    
    try {
      const artist = await getArtistFromPage(browser, artwork.sourceUrl);
      
      if (artist && artist !== 'Castello di Rivoli') {
        artwork.artist = artist;
        fixed++;
        if (i < 10) log(`  -> ${artist}`);
      }
      
      errors = 0;
      await delay(200);
      
    } catch (err) {
      errors++;
      if (errors >= 10) {
        log(`Too many errors, saving and exiting...`);
        break;
      }
      await delay(1000);
    }
    
    // Save every 100
    if ((i + 1) % 100 === 0) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(artworks, null, 2));
      log(`  Saved! Fixed: ${fixed}`);
    }
  }
  
  // Final save
  fs.writeFileSync(DATA_FILE, JSON.stringify(artworks, null, 2));
  log(`DONE! Fixed ${fixed} artists out of ${unknownArtists.length}`);
  
  await browser.close();
}

main().catch(err => {
  log(`Fatal: ${err.message}`);
  process.exit(1);
});
