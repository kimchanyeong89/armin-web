/**
 * Manchester Art Gallery Scraper - Playwright Version
 * Cloudflare 우회를 위한 실제 브라우저 사용
 */

const { chromium, firefox } = require('playwright');
const fs = require('fs');
const path = require('path');

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

async function waitForCloudflare(page, maxWait = 60000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const title = await page.title();
    if (!title.includes('Just a moment') && !title.includes('Cloudflare') && !title.includes('Checking')) {
      return true;
    }
    console.log(`  Waiting for Cloudflare... (${Math.floor((Date.now() - start) / 1000)}s)`);
    await delay(3000);
  }
  return false;
}

async function scrapeCollection(context, collection) {
  const logFile = path.join(LOG_DIR, `mag-${collection.name.toLowerCase()}.log`);
  const log = (msg) => {
    const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
    fs.appendFileSync(logFile, line + '\n');
    console.log(`[${collection.name}] ${msg}`);
  };

  fs.writeFileSync(logFile, '');
  log(`Starting ${collection.name}...`);
  
  const page = await context.newPage();
  const allArtworks = [];

  try {
    log('Loading page...');
    await page.goto(collection.url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    
    log('Waiting for Cloudflare challenge...');
    const passed = await waitForCloudflare(page);
    
    if (!passed) {
      log('❌ Failed to pass Cloudflare');
      await page.close();
      return 0;
    }
    
    log('✅ Cloudflare passed!');
    await delay(3000);

    // Extract total count if available
    const totalText = await page.locator('.results-count, .total-count, [class*="count"]').first().textContent().catch(() => '');
    log(`Total results indicator: ${totalText}`);

    let consecutiveEmpty = 0;
    let pageNum = 1;

    while (consecutiveEmpty < 3) {
      log(`Page ${pageNum}: Extracting...`);
      
      // Wait for items
      await page.waitForSelector('article, .item, .result, [class*="card"]', { timeout: 15000 }).catch(() => {});
      await delay(2000);

      // Extract artworks
      const items = await page.evaluate((startIdx) => {
        const results = [];
        const cards = document.querySelectorAll('article, .search-result, [class*="result-item"], [class*="grid-item"]');
        
        cards.forEach((card, idx) => {
          if (idx < startIdx) return;
          
          const link = card.querySelector('a[href*="/objects/"]') || card.querySelector('a');
          const img = card.querySelector('img');
          const title = card.querySelector('h2, h3, .title, [class*="title"]');
          const artist = card.querySelector('.artist, .maker, [class*="artist"], [class*="creator"]');
          
          if (link || img) {
            results.push({
              title: title?.textContent?.trim() || img?.alt?.trim() || 'Untitled',
              artist: artist?.textContent?.trim() || '',
              image: img?.src || img?.dataset?.src || '',
              detailUrl: link?.href || '',
            });
          }
        });
        
        return results;
      }, allArtworks.length);

      if (items.length === 0) {
        consecutiveEmpty++;
        log(`No new items (${consecutiveEmpty}/3)`);
      } else {
        consecutiveEmpty = 0;
        items.forEach(item => {
          allArtworks.push({
            id: `${collection.id}-${allArtworks.length}`,
            title: item.title,
            artist: item.artist,
            imageUrl: item.image,
            detailUrl: item.detailUrl,
            museum: 'Manchester Art Gallery',
          });
        });
        log(`Found ${items.length} items (total: ${allArtworks.length})`);
      }

      // Scroll and look for more
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await delay(2000);

      // Try pagination
      const nextBtn = await page.locator('a:has-text("Next"), button:has-text("Next"), .pagination-next, [class*="next"]').first();
      const hasNext = await nextBtn.isVisible().catch(() => false);
      
      if (hasNext) {
        log('Clicking next page...');
        await nextBtn.click();
        await delay(3000);
      }

      pageNum++;

      // Save progress
      if (allArtworks.length > 0 && allArtworks.length % 50 === 0) {
        fs.writeFileSync(path.join(OUTPUT_DIR, collection.outputFile), JSON.stringify(allArtworks, null, 2));
        log(`💾 Saved: ${allArtworks.length}`);
      }
    }

    // Final save
    fs.writeFileSync(path.join(OUTPUT_DIR, collection.outputFile), JSON.stringify(allArtworks, null, 2));
    log(`✅ Complete! Total: ${allArtworks.length}`);

  } catch (err) {
    log(`❌ Error: ${err.message}`);
    if (allArtworks.length > 0) {
      fs.writeFileSync(path.join(OUTPUT_DIR, collection.outputFile), JSON.stringify(allArtworks, null, 2));
    }
  } finally {
    await page.close();
  }

  return allArtworks.length;
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  Manchester Art Gallery - Playwright');
  console.log('═══════════════════════════════════════════');

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

  // Use Firefox (better at bypassing Cloudflare)
  console.log('Launching Firefox...');
  const browser = await firefox.launch({
    headless: false,
    slowMo: 100,
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
    locale: 'en-GB',
  });

  // Test mode
  if (process.argv.includes('--test')) {
    console.log('🧪 Test mode...');
    const page = await context.newPage();
    await page.goto(COLLECTIONS[0].url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    
    const passed = await waitForCloudflare(page, 120000);
    console.log(`Cloudflare passed: ${passed}`);
    
    if (passed) {
      await delay(5000);
      const content = await page.content();
      fs.writeFileSync(path.join(__dirname, '../downloads/mag-playwright-debug.html'), content);
      console.log('Saved debug HTML');
      
      const info = await page.evaluate(() => ({
        title: document.title,
        articles: document.querySelectorAll('article').length,
        images: document.querySelectorAll('img').length,
      }));
      console.log('Page info:', info);
    }
    
    await browser.close();
    return;
  }

  // Scrape all collections
  const results = {};
  
  for (let i = 0; i < COLLECTIONS.length; i++) {
    const collection = COLLECTIONS[i];
    console.log(`\n📦 [${i + 1}/${COLLECTIONS.length}] ${collection.name}`);
    results[collection.name] = await scrapeCollection(context, collection);
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
