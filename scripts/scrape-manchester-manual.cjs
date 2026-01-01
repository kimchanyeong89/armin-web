/**
 * Manchester Art Gallery Scraper - Manual Cookie Approach
 * 
 * 1. 먼저 브라우저에서 수동으로 사이트 접속 후 쿠키 저장
 * 2. 저장된 쿠키로 스크래핑
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
const COOKIE_FILE = path.join(__dirname, '../downloads/mag-cookies.json');
const PROFILE_DIR = path.join(__dirname, '../downloads/mag-chrome-profile');

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForCloudflare(page, maxWait = 120000) {
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

// Step 1: 수동 로그인용 브라우저 열기
async function openManualBrowser() {
  console.log('Opening browser for manual Cloudflare bypass...');
  console.log('Please solve the Cloudflare challenge manually.');
  console.log('After the page loads, press Enter in this terminal to save cookies.\n');

  const browser = await puppeteer.launch({
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1920,1080',
      `--user-data-dir=${PROFILE_DIR}`,
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  
  await page.goto(COLLECTIONS[0].url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  
  // Wait for user to solve Cloudflare
  console.log('\n⏳ Solve the Cloudflare challenge in the browser...');
  console.log('   When the page loads properly, press Enter here.');
  
  await new Promise(resolve => {
    process.stdin.once('data', resolve);
  });

  // Save cookies
  const cookies = await page.cookies();
  fs.writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2));
  console.log(`✅ Saved ${cookies.length} cookies to ${COOKIE_FILE}`);

  await browser.close();
  console.log('\nNow run the script again without --setup to scrape.');
}

async function scrapeCollection(browser, collection) {
  const logFile = path.join(LOG_DIR, `mag-${collection.name.toLowerCase()}.log`);
  const log = (msg) => {
    const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
    fs.appendFileSync(logFile, line + '\n');
    console.log(`[${collection.name}] ${msg}`);
  };

  fs.writeFileSync(logFile, '');
  log(`Starting ${collection.name}...`);

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  // Load cookies if available
  if (fs.existsSync(COOKIE_FILE)) {
    const cookies = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf-8'));
    await page.setCookie(...cookies);
    log('Loaded saved cookies');
  }

  const allArtworks = [];

  try {
    log('Loading page...');
    await page.goto(collection.url, { waitUntil: 'networkidle2', timeout: 90000 });
    
    // Check if Cloudflare
    const passed = await waitForCloudflare(page, 30000);
    if (!passed) {
      log('❌ Cloudflare not passed - need manual setup');
      await page.close();
      return 0;
    }
    
    log('✅ Page loaded!');
    await delay(3000);

    let consecutiveEmpty = 0;
    let pageNum = 1;

    while (consecutiveEmpty < 3) {
      log(`Page ${pageNum}...`);
      
      await page.waitForSelector('article, .item, [class*="result"]', { timeout: 15000 }).catch(() => {});
      await delay(2000);

      const items = await page.evaluate((existingCount) => {
        const results = [];
        const cards = document.querySelectorAll('article, .search-result, [class*="result-item"], [class*="collection-item"]');
        
        cards.forEach((card, idx) => {
          if (idx < existingCount) return;
          
          const link = card.querySelector('a[href*="/objects/"]') || card.querySelector('a');
          const img = card.querySelector('img');
          const title = card.querySelector('h2, h3, .title, [class*="title"]');
          const artist = card.querySelector('.artist, .maker, [class*="creator"]');
          
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

      // Scroll and pagination
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await delay(2000);

      pageNum++;

      if (allArtworks.length > 0 && allArtworks.length % 50 === 0) {
        fs.writeFileSync(path.join(OUTPUT_DIR, collection.outputFile), JSON.stringify(allArtworks, null, 2));
        log(`💾 Saved: ${allArtworks.length}`);
      }
    }

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
  console.log('  Manchester Art Gallery Scraper');
  console.log('═══════════════════════════════════════════');

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

  // Manual setup mode
  if (process.argv.includes('--setup')) {
    await openManualBrowser();
    return;
  }

  // Check for saved profile
  if (!fs.existsSync(PROFILE_DIR)) {
    console.log('⚠️  No browser profile found.');
    console.log('   Run with --setup first to bypass Cloudflare manually.');
    return;
  }

  // Launch with saved profile
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1920,1080',
      `--user-data-dir=${PROFILE_DIR}`,
    ],
  });

  const results = {};
  
  for (let i = 0; i < COLLECTIONS.length; i++) {
    const collection = COLLECTIONS[i];
    console.log(`\n📦 [${i + 1}/${COLLECTIONS.length}] ${collection.name}`);
    results[collection.name] = await scrapeCollection(browser, collection);
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
