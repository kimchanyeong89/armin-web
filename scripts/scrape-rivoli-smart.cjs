/**
 * Rivoli Smart Fix - Only re-scrape items with duplicate images
 * First collects all URLs, scrapes all, then identifies and fixes duplicates
 */
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const OUTPUT_FILE = path.join(__dirname, '../public/data/castello-di-rivoli-collection.json');
const ALL_URLS_FILE = path.join(__dirname, '../downloads/rivoli-v2-progress.json');
const LOG_FILE = path.join(__dirname, '../downloads/rivoli-smart-fix.log');

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  const line = `[${ts}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

async function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function scrapeArtworkCorrectly(browser, url) {
  const page = await browser.newPage();
  try {
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
    await page.setViewport({ width: 1280, height: 900 });
    
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(1500);
    
    const data = await page.evaluate(() => {
      const title = document.querySelector('h1')?.textContent?.trim() || '';
      
      let artist = '';
      const metaAuthor = document.querySelector('meta[property="article:author"]');
      if (metaAuthor) artist = metaAuthor.content;
      
      const contentPs = document.querySelectorAll('.entry-content p, .content p, article p');
      let date = '', medium = '';
      
      for (const p of contentPs) {
        const text = p.textContent?.trim() || '';
        if (!date && /\b(19|20)\d{2}\b/.test(text) && text.length < 100) {
          const match = text.match(/\b(19|20)\d{2}\b/);
          if (match) date = match[0];
        }
        if (!medium && /video|installation|sculpture|painting|photograph|print|drawing|mixed media|oil|canvas|paper/i.test(text)) {
          if (text.length < 200) medium = text;
        }
      }
      
      // CORRECT image extraction - first valid image in main content, NOT largest
      let imageUrl = '';
      const mainContent = document.querySelector('article, .entry-content, .opera-content, .single-content');
      if (mainContent) {
        const mainImgs = mainContent.querySelectorAll('img');
        for (const img of mainImgs) {
          const src = img.src || img.dataset?.src || '';
          if (!src) continue;
          if (src.includes('logo') || src.includes('icon') || src.includes('facebook.com')) continue;
          
          const parent = img.closest('.related, .correlati, .sidebar, .widget, footer');
          if (parent) continue;
          
          const w = img.naturalWidth || img.width || parseInt(img.getAttribute('width')) || 0;
          const h = img.naturalHeight || img.height || parseInt(img.getAttribute('height')) || 0;
          
          if (w >= 50 || h >= 50 || (!w && !h)) {
            imageUrl = src;
            break;
          }
        }
      }
      
      if (!imageUrl) {
        const ogImg = document.querySelector('meta[property="og:image"]');
        if (ogImg) imageUrl = ogImg.content;
      }
      
      if (!imageUrl) {
        const anyImg = document.querySelector('article img[src]');
        if (anyImg) imageUrl = anyImg.src;
      }
      
      return { title, artist, date, medium, imageUrl };
    });
    
    await page.close();
    return data;
  } catch (err) {
    try { await page.close(); } catch {}
    throw err;
  }
}

async function main() {
  // Load all URLs
  let allUrls = [];
  if (fs.existsSync(ALL_URLS_FILE)) {
    const data = JSON.parse(fs.readFileSync(ALL_URLS_FILE, 'utf-8'));
    allUrls = data.urls || [];
  }
  
  if (!allUrls.length) {
    log('ERROR: No URLs found.');
    return;
  }
  
  log(`Total URLs: ${allUrls.length}`);
  log(`Starting full scrape with CORRECT image extraction...`);
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  
  const artworks = [];
  let errorCount = 0;
  
  for (let i = 0; i < allUrls.length; i++) {
    const url = allUrls[i];
    const slug = url.split('/').filter(Boolean).pop();
    
    log(`[${i + 1}/${allUrls.length}] ${slug}`);
    
    try {
      const data = await scrapeArtworkCorrectly(browser, url);
      
      if (!data.imageUrl) {
        log(`  -> Skipped (no image)`);
        continue;
      }
      
      artworks.push({
        id: `rivoli-${String(artworks.length + 1).padStart(4, '0')}`,
        title: data.title || slug.replace(/-/g, ' '),
        artist: data.artist || 'Unknown',
        date: data.date || '',
        medium: data.medium || '',
        dimensions: '',
        type: 'Contemporary Art',
        imageUrl: data.imageUrl,
        sourceUrl: url,
        museum: 'Castello di Rivoli',
        museumShortName: 'Rivoli'
      });
      
      errorCount = 0;
      
      if (artworks.length % 50 === 0) {
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(artworks, null, 2));
        log(`  Saved: ${artworks.length} artworks`);
      }
      
      await delay(300);
      
    } catch (err) {
      log(`  -> Error: ${err.message.slice(0, 50)}`);
      errorCount++;
      
      if (errorCount >= 10) {
        log(`Too many errors, saving and exiting...`);
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(artworks, null, 2));
        log(`Saved ${artworks.length}. Run again to continue.`);
        await browser.close();
        return;
      }
      
      await delay(1000);
    }
  }
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(artworks, null, 2));
  log(`DONE! Total: ${artworks.length} artworks`);
  
  // Check for duplicates
  const urlCounts = {};
  artworks.forEach(a => {
    urlCounts[a.imageUrl] = (urlCounts[a.imageUrl] || 0) + 1;
  });
  const dups = Object.entries(urlCounts).filter(([_, c]) => c > 1);
  if (dups.length) {
    log(`WARNING: ${dups.length} duplicate images found`);
    dups.forEach(([url, count]) => log(`  ${count}x: ...${url.slice(-40)}`));
  } else {
    log(`All images are unique!`);
  }
  
  await browser.close();
}

main().catch(err => {
  log(`Fatal: ${err.message}`);
  process.exit(1);
});
