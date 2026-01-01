const { chromium } = require('playwright');
const fs = require('fs');

const delay = ms => new Promise(r => setTimeout(r, ms));
const log = msg => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);

(async () => {
  log('Starting Musée Condé Drawings scraper...');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();
  
  const allArtworks = new Map();
  
  // Drawings category URL
  const url = 'https://images.grandpalaisrmn.fr/search-result?CS_MERGE=media%2Ccollections&SEARCHTXT1=%22conde%22&SEARCHMODE=NEW&CATEGORY[]=275846&CATEGORY[]=271479&EVENT=WEBSHOP_SEARCH';
  
  log('Navigating to drawings page...');
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await delay(5000);
  
  // Accept cookies if present
  try {
    const cookieBtn = await page.$('button:has-text("Accept all cookies")');
    if (cookieBtn) {
      await cookieBtn.click();
      await delay(3000);
      log('Accepted cookies');
    }
  } catch(e) {
    // Ignore
  }
  
  // Get total count
  let totalCount = 0;
  try {
    const countText = await page.$eval('.count-search-results', el => el.textContent);
    log(`Raw count text: "${countText}"`);
    // Handle European format (3.323) = 3323
    const match = countText.match(/\(([\d.]+)\)/);
    if (match) {
      totalCount = parseInt(match[1].replace(/\./g, ''));
      log(`Total drawings found: ${totalCount}`);
    }
  } catch(e) {
    log('Could not get total count: ' + e.message);
  }
  
  // Paginate through all results
  let pageNum = 1;
  const maxPages = Math.ceil(totalCount / 36) + 5; // 36 items per page
  
  log(`Will attempt up to ${maxPages} pages`);
  
  while (pageNum <= maxPages) {
    log(`Page ${pageNum}: Extracting...`);
    await delay(2000);
    
    // Extract items from current page
    const items = await page.evaluate(() => {
      const results = [];
      document.querySelectorAll('.media-item.asset-medium').forEach((item) => {
        const mediaDiv = item.querySelector('[data-medianumber]');
        const mediaNumber = mediaDiv?.getAttribute('data-medianumber') || '';
        const img = item.querySelector('img.medium');
        const title = img?.alt || '';
        const thumbSrc = img?.src || '';
        const link = item.querySelector('a[href*="/ark:/"]');
        const sourceUrl = link?.href || '';
        
        if (mediaNumber && title) {
          results.push({
            id: mediaNumber,
            title: title,
            imageUrl: thumbSrc,
            sourceUrl: sourceUrl
          });
        }
      });
      return results;
    });
    
    let newCount = 0;
    for (const item of items) {
      if (!allArtworks.has(item.id)) {
        allArtworks.set(item.id, item);
        newCount++;
      }
    }
    
    log(`  Found: ${items.length}, New: ${newCount}, Total collected: ${allArtworks.size}`);
    
    // Check if we have enough
    if (totalCount > 0 && allArtworks.size >= totalCount * 0.95) {
      log('Collected 95% or more of total items');
      break;
    }
    
    // Try to click next page
    const nextLink = await page.$('.media-item-paging-next a');
    if (!nextLink) {
      log('No next page link found');
      break;
    }
    
    const isVisible = await nextLink.isVisible();
    if (!isVisible) {
      log('Next page link not visible');
      break;
    }
    
    try {
      await nextLink.click();
      await delay(4000);
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      pageNum++;
    } catch(e) {
      log('Navigation failed: ' + e.message);
      break;
    }
  }
  
  log(`Total drawings collected: ${allArtworks.size}`);
  
  // Save results
  const output = {
    museum: {
      name: 'Musée Condé',
      city: 'Chantilly',
      country: 'France'
    },
    collection: 'Drawings',
    source: 'Grand Palais RMN',
    totalCount: allArtworks.size,
    totalObjects: allArtworks.size,
    scrapedAt: new Date().toISOString(),
    objects: Array.from(allArtworks.values()).map((item, idx) => ({
      id: `conde-drawing-${idx + 1}`,
      title: item.title,
      artist: 'Unknown',
      year: null,
      medium: 'Drawing',
      dimensions: '',
      image: item.imageUrl,
      sourceUrl: item.sourceUrl,
      artworkType: 'Drawing',
      museum: 'Musée Condé, Chantilly'
    }))
  };
  
  const outputPath = './public/data/musee-conde-drawings.json';
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  log(`Saved ${output.objects.length} drawings to ${outputPath}`);
  
  await browser.close();
  log('Done!');
})();
