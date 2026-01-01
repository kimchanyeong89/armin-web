/**
 * Manchester Art Gallery Scraper
 * Cloudflare 우회 + 5개 컬렉션 동시 스크래핑
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

async function scrapeCollection(browser, collection) {
  const logFile = path.join(LOG_DIR, `mag-${collection.name.toLowerCase()}.log`);
  const log = (msg) => {
    const line = `[${new Date().toLocaleTimeString()}] ${msg}\n`;
    fs.appendFileSync(logFile, line);
    console.log(`[${collection.name}] ${msg}`);
  };

  log(`Starting ${collection.name}...`);
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-GB,en;q=0.9',
  });

  const allArtworks = [];
  let pageNum = 1;
  let hasMore = true;

  try {
    // Navigate to first page
    log('Loading first page...');
    await page.goto(collection.url, { waitUntil: 'networkidle2', timeout: 60000 });
    
    // Wait for Cloudflare challenge
    await delay(5000);
    
    // Check if we passed Cloudflare
    const title = await page.title();
    log(`Page title: ${title}`);
    
    if (title.includes('Just a moment') || title.includes('Cloudflare')) {
      log('Waiting for Cloudflare challenge...');
      await delay(10000);
    }

    while (hasMore) {
      log(`Page ${pageNum}: Extracting artworks...`);
      
      // Wait for grid to load
      await page.waitForSelector('.search-item, .grid-item, article, .item', { timeout: 30000 }).catch(() => {});
      await delay(2000);

      // Extract artworks from current page
      const artworks = await page.evaluate(() => {
        const items = [];
        const cards = document.querySelectorAll('.search-item, .grid-item, article, [data-item], .item');
        
        cards.forEach((card, idx) => {
          const linkEl = card.querySelector('a[href*="/objects/"]') || card.querySelector('a');
          const imgEl = card.querySelector('img');
          const titleEl = card.querySelector('.title, h2, h3, .name, [class*="title"]');
          const artistEl = card.querySelector('.artist, .maker, .creator, [class*="artist"]');
          
          const detailUrl = linkEl?.href || '';
          const image = imgEl?.src || imgEl?.dataset?.src || '';
          const title = titleEl?.textContent?.trim() || imgEl?.alt || '';
          const artist = artistEl?.textContent?.trim() || '';
          
          if (detailUrl || image) {
            items.push({
              title: title || 'Untitled',
              artist: artist || 'Unknown',
              image,
              detailUrl,
            });
          }
        });
        
        return items;
      });

      log(`Found ${artworks.length} artworks on page ${pageNum}`);
      
      artworks.forEach((art, idx) => {
        allArtworks.push({
          id: `${collection.id}-${allArtworks.length}`,
          title: art.title,
          artist: art.artist,
          imageUrl: art.image,
          detailUrl: art.detailUrl,
          museum: 'Manchester Art Gallery',
        });
      });

      // Try to find next page
      const nextButton = await page.$('a[rel="next"], .pagination-next, button:has-text("Next"), a:has-text("Next")');
      
      if (nextButton) {
        const isDisabled = await page.evaluate(el => el.classList.contains('disabled') || el.getAttribute('aria-disabled') === 'true', nextButton);
        
        if (!isDisabled) {
          log('Going to next page...');
          await nextButton.click();
          await delay(3000);
          pageNum++;
        } else {
          hasMore = false;
        }
      } else {
        // Try infinite scroll
        const prevCount = allArtworks.length;
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await delay(3000);
        
        const newArtworks = await page.evaluate(() => document.querySelectorAll('.search-item, .grid-item, article, [data-item], .item').length);
        
        if (newArtworks <= artworks.length) {
          hasMore = false;
        } else {
          pageNum++;
        }
      }

      // Save progress every 100 items
      if (allArtworks.length % 100 === 0) {
        const outputPath = path.join(OUTPUT_DIR, collection.outputFile);
        fs.writeFileSync(outputPath, JSON.stringify(allArtworks, null, 2));
        log(`Saved progress: ${allArtworks.length} artworks`);
      }
    }

    // Final save
    const outputPath = path.join(OUTPUT_DIR, collection.outputFile);
    fs.writeFileSync(outputPath, JSON.stringify(allArtworks, null, 2));
    log(`✅ Complete! Total: ${allArtworks.length} artworks`);

  } catch (err) {
    log(`❌ Error: ${err.message}`);
    // Save what we have
    const outputPath = path.join(OUTPUT_DIR, collection.outputFile);
    fs.writeFileSync(outputPath, JSON.stringify(allArtworks, null, 2));
    log(`Saved ${allArtworks.length} artworks before error`);
  } finally {
    await page.close();
  }

  return allArtworks.length;
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  Manchester Art Gallery Scraper');
  console.log('═══════════════════════════════════════════');

  // Ensure directories exist
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

  // Test mode
  if (process.argv.includes('--test')) {
    console.log('🧪 Test mode: checking Cloudflare bypass...');
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    
    const page = await browser.newPage();
    await page.goto(COLLECTIONS[0].url, { waitUntil: 'networkidle2', timeout: 60000 });
    await delay(5000);
    
    const title = await page.title();
    console.log(`Page title: ${title}`);
    
    const html = await page.content();
    console.log(`Page length: ${html.length} chars`);
    console.log(`Contains 'painting': ${html.includes('painting')}`);
    
    await browser.close();
    return;
  }

  // Launch browser
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
  });

  // Run all collections sequentially (to avoid rate limiting)
  const results = {};
  
  for (const collection of COLLECTIONS) {
    console.log(`\n📦 Starting ${collection.name}...`);
    results[collection.name] = await scrapeCollection(browser, collection);
    await delay(5000); // Wait between collections
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
