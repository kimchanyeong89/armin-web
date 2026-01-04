/**
 * Rivoli Resume Scraper - Continue from where we left off
 * Uses single page per request to avoid browser crashes
 */
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const OUTPUT_FILE = path.join(__dirname, '../public/data/castello-di-rivoli-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/rivoli-resume-progress.json');
const LOG_FILE = path.join(__dirname, '../downloads/rivoli-resume.log');

// All 917 URLs from the collection page
const ALL_URLS_FILE = path.join(__dirname, '../downloads/rivoli-v2-progress.json');

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  const line = `[${ts}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

async function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function scrapeArtwork(browser, url) {
  const page = await browser.newPage();
  try {
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
    await page.setViewport({ width: 1280, height: 900 });
    
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(1000);
    
    const data = await page.evaluate(() => {
      const title = document.querySelector('h1')?.textContent?.trim() || '';
      
      // Artist from meta or content
      let artist = '';
      const artistMeta = document.querySelector('meta[property="article:author"]');
      if (artistMeta) artist = artistMeta.content;
      if (!artist) {
        const authorEl = document.querySelector('.author, .artist, [class*="artist"]');
        if (authorEl) artist = authorEl.textContent?.trim() || '';
      }
      
      // Extract from content paragraphs
      const contentPs = document.querySelectorAll('.entry-content p, .content p, article p');
      let date = '', medium = '', dimensions = '';
      
      for (const p of contentPs) {
        const text = p.textContent?.trim() || '';
        // Year pattern
        if (!date && /\b(19|20)\d{2}\b/.test(text) && text.length < 100) {
          const match = text.match(/\b(19|20)\d{2}\b/);
          if (match) date = match[0];
        }
        // Medium pattern
        if (!medium && /video|installation|sculpture|painting|photograph|print|drawing|mixed media|oil|canvas|paper/i.test(text)) {
          if (text.length < 200) medium = text;
        }
      }
      
      // Image - largest in content
      let imageUrl = '';
      const imgs = document.querySelectorAll('article img, .entry-content img, .gallery img, .content img');
      let maxArea = 0;
      for (const img of imgs) {
        const src = img.src || img.dataset?.src || '';
        if (src && !src.includes('logo') && !src.includes('icon')) {
          const w = img.naturalWidth || img.width || 0;
          const h = img.naturalHeight || img.height || 0;
          if (w * h > maxArea) {
            maxArea = w * h;
            imageUrl = src;
          }
        }
      }
      
      // Fallback: og:image
      if (!imageUrl) {
        const ogImg = document.querySelector('meta[property="og:image"]');
        if (ogImg) imageUrl = ogImg.content;
      }
      
      return { title, artist, date, medium, dimensions, imageUrl };
    });
    
    await page.close();
    return data;
  } catch (err) {
    try { await page.close(); } catch {}
    throw err;
  }
}

async function main() {
  // Load existing artworks
  let artworks = [];
  if (fs.existsSync(OUTPUT_FILE)) {
    artworks = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
    log(`Loaded ${artworks.length} existing artworks`);
  }
  
  // Load all URLs
  let allUrls = [];
  if (fs.existsSync(ALL_URLS_FILE)) {
    const data = JSON.parse(fs.readFileSync(ALL_URLS_FILE, 'utf-8'));
    allUrls = data.urls || [];
  }
  
  if (!allUrls.length) {
    log('ERROR: No URLs found. Run scrape-rivoli-v2.cjs first to collect URLs.');
    return;
  }
  
  log(`Total URLs: ${allUrls.length}`);
  
  // Get already scraped URLs
  const scrapedUrls = new Set(artworks.map(a => a.sourceUrl));
  const remainingUrls = allUrls.filter(u => !scrapedUrls.has(u));
  
  log(`Already scraped: ${scrapedUrls.size}, Remaining: ${remainingUrls.length}`);
  
  if (remainingUrls.length === 0) {
    log('All URLs already scraped!');
    return;
  }
  
  // Launch browser
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  
  let errorCount = 0;
  const MAX_ERRORS = 10;
  
  for (let i = 0; i < remainingUrls.length; i++) {
    const url = remainingUrls[i];
    const slug = url.split('/').filter(Boolean).pop();
    
    log(`[${artworks.length + 1}/${allUrls.length}] ${slug}`);
    
    try {
      const data = await scrapeArtwork(browser, url);
      
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
        dimensions: data.dimensions || '',
        type: 'Contemporary Art',
        imageUrl: data.imageUrl,
        sourceUrl: url,
        museum: 'Castello di Rivoli',
        museumShortName: 'Rivoli'
      });
      
      errorCount = 0; // Reset on success
      
      // Save every 10 artworks
      if (artworks.length % 10 === 0) {
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(artworks, null, 2));
        log(`  Saved: ${artworks.length} artworks`);
      }
      
      // Small delay between requests
      await delay(500);
      
    } catch (err) {
      log(`  -> Error: ${err.message.slice(0, 60)}`);
      errorCount++;
      
      if (errorCount >= MAX_ERRORS) {
        log(`Too many errors, restarting browser...`);
        try { await browser.close(); } catch {}
        
        // Save progress
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(artworks, null, 2));
        log(`Saved ${artworks.length} artworks before restart`);
        
        // Wait and relaunch
        await delay(3000);
        const newBrowser = await puppeteer.launch({
          headless: 'new',
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });
        
        // Continue with same browser reference trick won't work, need to restructure
        // For now, just exit and let user restart
        log(`Browser restarted. Run script again to continue.`);
        await newBrowser.close();
        return;
      }
      
      await delay(2000);
    }
  }
  
  // Final save
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(artworks, null, 2));
  log(`DONE! Total: ${artworks.length} artworks`);
  
  await browser.close();
}

main().catch(err => {
  log(`Fatal: ${err.message}`);
  process.exit(1);
});
