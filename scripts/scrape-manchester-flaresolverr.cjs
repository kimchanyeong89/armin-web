/**
 * Manchester Art Gallery Scraper using FlareSolverr
 * Cloudflare 우회 + 5개 컬렉션 스크래핑
 */

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const FLARESOLVERR_URL = 'http://localhost:8191/v1';

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

async function fetchWithFlaresolverr(url) {
  const response = await axios.post(FLARESOLVERR_URL, {
    cmd: 'request.get',
    url: url,
    maxTimeout: 120000
  }, {
    timeout: 150000
  });
  
  if (response.data.status !== 'ok') {
    throw new Error(`FlareSolverr error: ${response.data.message}`);
  }
  
  return response.data.solution;
}

function parseArtworks($, collectionId, startIdx = 0) {
  const artworks = [];
  
  // Manchester Art Gallery specific selector
  const items = $('.object-list__item');
  console.log(`  Found ${items.length} items`);
  
  items.each((idx, el) => {
    const $el = $(el);
    const link = $el.find('a.object-list__link').attr('href') || '';
    const img = $el.find('img').first();
    const imgSrc = img.attr('src') || '';
    const titleText = $el.find('.object-list__title').text().trim();
    // Remove accession number from title (e.g., "The Living Tree - 1939.207")
    const title = titleText.replace(/\s*-\s*\d{4}\.\d+$/, '').trim();
    const artist = $el.find('.object-list__creator').text().trim();
    const year = $el.find('.object-list__dates').first().text().trim();
    
    if (imgSrc) {
      artworks.push({
        id: `${collectionId}-${startIdx + artworks.length}`,
        title: title || 'Untitled',
        artist: artist || 'Unknown',
        year: year || '',
        imageUrl: imgSrc,
        detailUrl: link,
        museum: 'Manchester Art Gallery',
      });
    }
  });
  
  return artworks;
}

async function scrapeCollection(collection) {
  const logFile = path.join(LOG_DIR, `mag-${collection.name.toLowerCase()}.log`);
  const log = (msg) => {
    const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
    fs.appendFileSync(logFile, line + '\n');
    console.log(`[${collection.name}] ${msg}`);
  };

  fs.writeFileSync(logFile, '');
  log(`Starting ${collection.name}...`);
  
  const allArtworks = [];
  let pageNum = 1;
  let hasMore = true;
  let currentUrl = collection.url;

  try {
    while (hasMore && pageNum <= 50) { // Max 50 pages
      log(`Page ${pageNum}: Fetching...`);
      
      const solution = await fetchWithFlaresolverr(currentUrl);
      const $ = cheerio.load(solution.response);
      
      log(`Page title: ${$('title').text().trim()}`);
      
      const artworks = parseArtworks($, collection.id, allArtworks.length);
      
      if (artworks.length === 0) {
        log('No artworks found on this page');
        hasMore = false;
      } else {
        allArtworks.push(...artworks);
        log(`Found ${artworks.length} artworks (total: ${allArtworks.length})`);
        
        // Look for next page - check pagination
        const nextLink = $('a.pagination__link[aria-label="Next page"], a[rel="next"], .pagination a:contains("next")').attr('href');
        
        // Also check by page parameter in URL 
        const paginationLinks = $('.pagination a, .pagination__link').map((i, el) => $(el).attr('href')).get();
        const nextPageNum = pageNum + 1;
        const nextPageLink = paginationLinks.find(link => link && link.includes(`page=${nextPageNum}`));
        
        const finalNext = nextLink || nextPageLink;
        
        if (finalNext) {
          currentUrl = finalNext.startsWith('/') 
            ? `https://collections.manchesterartgallery.org${finalNext}`
            : finalNext.startsWith('http') ? finalNext
            : `https://collections.manchesterartgallery.org${finalNext}`;
          pageNum++;
          await delay(5000); // Rate limiting - Cloudflare needs time
        } else {
          log('No next page link found');
          hasMore = false;
        }
      }
      
      // Save progress
      if (allArtworks.length > 0 && allArtworks.length % 50 === 0) {
        const outputPath = path.join(OUTPUT_DIR, collection.outputFile);
        fs.writeFileSync(outputPath, JSON.stringify(allArtworks, null, 2));
        log(`💾 Saved: ${allArtworks.length}`);
      }
    }

    // Final save
    const outputPath = path.join(OUTPUT_DIR, collection.outputFile);
    fs.writeFileSync(outputPath, JSON.stringify(allArtworks, null, 2));
    log(`✅ Complete! Total: ${allArtworks.length}`);

  } catch (err) {
    log(`❌ Error: ${err.message}`);
    if (allArtworks.length > 0) {
      const outputPath = path.join(OUTPUT_DIR, collection.outputFile);
      fs.writeFileSync(outputPath, JSON.stringify(allArtworks, null, 2));
      log(`Saved ${allArtworks.length} artworks before error`);
    }
  }

  return allArtworks.length;
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  Manchester Art Gallery - FlareSolverr');
  console.log('═══════════════════════════════════════════');

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

  // Test FlareSolverr connection
  try {
    const testResp = await axios.get('http://localhost:8191/');
    console.log(`✅ FlareSolverr ready: v${testResp.data.version}`);
  } catch (err) {
    console.error('❌ FlareSolverr not running! Start with:');
    console.error('   docker run -d -p 8191:8191 flaresolverr/flaresolverr');
    return;
  }

  // Test mode
  if (process.argv.includes('--test')) {
    console.log('\n🧪 Test mode: fetching first collection...');
    try {
      const solution = await fetchWithFlaresolverr(COLLECTIONS[0].url);
      console.log(`Page title: ${cheerio.load(solution.response)('title').text()}`);
      console.log(`Response length: ${solution.response.length} chars`);
      
      // Save debug HTML
      fs.writeFileSync(path.join(__dirname, '../downloads/mag-flaresolverr-debug.html'), solution.response);
      console.log('Saved debug HTML');
      
      const $ = cheerio.load(solution.response);
      const artworks = parseArtworks($, 'mag-test');
      console.log(`Found ${artworks.length} artworks`);
      if (artworks.length > 0) {
        console.log('First artwork:', artworks[0]);
      }
    } catch (err) {
      console.error('Test failed:', err.message);
    }
    return;
  }

  // Scrape all collections
  const results = {};
  
  for (let i = 0; i < COLLECTIONS.length; i++) {
    const collection = COLLECTIONS[i];
    console.log(`\n📦 [${i + 1}/${COLLECTIONS.length}] ${collection.name}`);
    results[collection.name] = await scrapeCollection(collection);
    await delay(5000); // Wait between collections
  }

  console.log('\n═══════════════════════════════════════════');
  console.log('  Results:');
  for (const [name, count] of Object.entries(results)) {
    console.log(`  ${name}: ${count} artworks`);
  }
  console.log('═══════════════════════════════════════════');
}

main().catch(console.error);
