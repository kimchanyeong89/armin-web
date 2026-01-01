/**
 * Manchester Art Gallery Scraper v2
 * Cloudflare 우회: Firefox + 긴 대기
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const COLLECTIONS = [
  { id: 'mag-paintings', name: 'Paintings', url: 'https://collections.manchesterartgallery.org/collections/?s=&view=grid&filter%5Bmultimedia.%40type%5D%5B%5D=image&filter[name.value.keyword][]=painting', outputFile: 'mag-paintings.json' },
  { id: 'mag-watercolours', name: 'Watercolours', url: 'https://collections.manchesterartgallery.org/collections/?s=&view=grid&filter%5Bmultimedia.%40type%5D%5B%5D=image&filter%5Bname.value.keyword%5D%5B%5D=watercolour', outputFile: 'mag-watercolours.json' },
  { id: 'mag-prints', name: 'Prints', url: 'https://collections.manchesterartgallery.org/collections/?s=&view=grid&filter%5Bmultimedia.%40type%5D%5B%5D=image&filter%5Bname.value.keyword%5D%5B%5D=on+paper%2C+print', outputFile: 'mag-prints.json' },
  { id: 'mag-drawings', name: 'Drawings', url: 'https://collections.manchesterartgallery.org/collections/?s=&view=grid&filter%5Bmultimedia.%40type%5D%5B%5D=image&filter%5Bname.value.keyword%5D%5B%5D=drawing', outputFile: 'mag-drawings.json' },
  { id: 'mag-lithographs', name: 'Lithographs', url: 'https://collections.manchesterartgallery.org/collections/?s=&view=grid&filter%5Bmultimedia.%40type%5D%5B%5D=image&filter%5Bname.value.keyword%5D%5B%5D=lithograph', outputFile: 'mag-lithographs.json' },
];

const OUTPUT_DIR = path.join(__dirname, '../public/data');
const LOG_DIR = path.join(__dirname, '../logs');

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForCloudflare(page, maxWait = 30000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const title = await page.title();
    if (!title.includes('Just a moment') && !title.includes('Cloudflare')) {
      return true;
    }
    await delay(2000);
  }
  return false;
}

async function scrapeCollection(browser, collection, collectionIdx) {
  const logFile = path.join(LOG_DIR, `mag-${collection.name.toLowerCase()}.log`);
  const log = (msg) => {
    const line = `[${new Date().toLocaleTimeString()}] ${msg}\n`;
    fs.appendFileSync(logFile, line);
    console.log(`[${collection.name}] ${msg}`);
  };

  // Clear log file
  fs.writeFileSync(logFile, '');
  log(`Starting ${collection.name}...`);
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  
  // More realistic headers
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-GB,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
  });

  const allArtworks = [];
  let pageNum = 1;
  let consecutiveEmpty = 0;

  try {
    // Navigate to first page
    log('Loading first page...');
    await page.goto(collection.url, { waitUntil: 'networkidle2', timeout: 90000 });
    
    // Wait for Cloudflare
    log('Waiting for Cloudflare...');
    const passed = await waitForCloudflare(page);
    if (!passed) {
      log('Failed to pass Cloudflare challenge');
      await page.close();
      return 0;
    }
    log('Cloudflare passed!');
    
    await delay(3000);

    // Scroll and collect
    while (consecutiveEmpty < 5) {
      log(`Loading page ${pageNum}...`);
      
      // Wait for content
      await page.waitForSelector('article, .search-item, .grid-item, [class*="result"]', { timeout: 15000 }).catch(() => {});
      await delay(2000);

      // Extract artworks
      const newArtworks = await page.evaluate((existingCount) => {
        const items = [];
        const cards = document.querySelectorAll('article, .search-item, .grid-item, [class*="result-item"]');
        
        cards.forEach((card, idx) => {
          if (idx < existingCount) return; // Skip already collected
          
          const linkEl = card.querySelector('a[href*="/objects/"]') || card.querySelector('a');
          const imgEl = card.querySelector('img');
          const titleEl = card.querySelector('h2, h3, .title, [class*="title"]');
          const artistEl = card.querySelector('.artist, .maker, [class*="creator"]');
          
          if (linkEl || imgEl) {
            items.push({
              title: titleEl?.textContent?.trim() || imgEl?.alt?.trim() || 'Untitled',
              artist: artistEl?.textContent?.trim() || '',
              image: imgEl?.src || imgEl?.dataset?.src || '',
              detailUrl: linkEl?.href || '',
            });
          }
        });
        
        return items;
      }, allArtworks.length);

      if (newArtworks.length === 0) {
        consecutiveEmpty++;
        log(`No new artworks found (${consecutiveEmpty}/5)`);
      } else {
        consecutiveEmpty = 0;
        newArtworks.forEach(art => {
          allArtworks.push({
            id: `${collection.id}-${allArtworks.length}`,
            title: art.title,
            artist: art.artist,
            imageUrl: art.image,
            detailUrl: art.detailUrl,
            museum: 'Manchester Art Gallery',
          });
        });
        log(`Found ${newArtworks.length} new artworks (total: ${allArtworks.length})`);
      }

      // Scroll down for more
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await delay(2000);
      
      // Try clicking "Load More" or pagination
      const loadMore = await page.$('button:has-text("Load"), a:has-text("More"), .load-more, [class*="load-more"]');
      if (loadMore) {
        await loadMore.click().catch(() => {});
        await delay(3000);
      }

      pageNum++;
      
      // Save progress
      if (allArtworks.length > 0 && allArtworks.length % 50 === 0) {
        const outputPath = path.join(OUTPUT_DIR, collection.outputFile);
        fs.writeFileSync(outputPath, JSON.stringify(allArtworks, null, 2));
        log(`💾 Saved progress: ${allArtworks.length}`);
      }
    }

    // Final save
    const outputPath = path.join(OUTPUT_DIR, collection.outputFile);
    fs.writeFileSync(outputPath, JSON.stringify(allArtworks, null, 2));
    log(`✅ Complete! Total: ${allArtworks.length} artworks`);

  } catch (err) {
    log(`❌ Error: ${err.message}`);
    if (allArtworks.length > 0) {
      const outputPath = path.join(OUTPUT_DIR, collection.outputFile);
      fs.writeFileSync(outputPath, JSON.stringify(allArtworks, null, 2));
      log(`Saved ${allArtworks.length} artworks before error`);
    }
  } finally {
    await page.close();
  }

  return allArtworks.length;
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  Manchester Art Gallery Scraper v2');
  console.log('═══════════════════════════════════════════');

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

  // Test mode
  if (process.argv.includes('--test')) {
    console.log('🧪 Test mode: checking page structure...');
    const browser = await puppeteer.launch({
      headless: false, // Visible for debugging
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080'],
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    console.log('Loading page...');
    await page.goto(COLLECTIONS[0].url, { waitUntil: 'networkidle2', timeout: 90000 });
    
    console.log('Waiting for Cloudflare...');
    const passed = await waitForCloudflare(page, 60000);
    console.log(`Cloudflare passed: ${passed}`);
    
    if (passed) {
      await delay(3000);
      const html = await page.content();
      fs.writeFileSync(path.join(__dirname, '../downloads/mag-debug.html'), html);
      console.log('Saved debug HTML');
      
      // Get page info
      const info = await page.evaluate(() => {
        return {
          title: document.title,
          articles: document.querySelectorAll('article').length,
          images: document.querySelectorAll('img').length,
          links: document.querySelectorAll('a[href*="/objects/"]').length,
        };
      });
      console.log('Page info:', info);
    }
    
    await delay(10000);
    await browser.close();
    return;
  }

  // Launch browser (visible to handle Cloudflare)
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080'],
  });

  const results = {};
  
  for (let i = 0; i < COLLECTIONS.length; i++) {
    const collection = COLLECTIONS[i];
    console.log(`\n📦 [${i + 1}/${COLLECTIONS.length}] Starting ${collection.name}...`);
    results[collection.name] = await scrapeCollection(browser, collection, i);
    await delay(5000);
  }

  await browser.close();

  console.log('\n═══════════════════════════════════════════');
  console.log('  Results:');
  for (const [name, count] of Object.entries(results)) {
    console.log(`  ${name}: ${count} artworks`);
  }
  console.log('═══════════════════════════════════════════');
}

main().catch(console.error);
