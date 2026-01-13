/**
 * Hamburger Kunsthalle - Malerei (Paintings) Collection Scraper
 * 
 * Target: https://online-sammlung.hamburger-kunsthalle.de/en/search?filter[obj_classification_s][0]=Malerei
 * Total: ~2,304 paintings
 * 
 * Uses Playwright for JavaScript-rendered content
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://online-sammlung.hamburger-kunsthalle.de';
const SEARCH_URL = `${BASE_URL}/en/search?filter[obj_classification_s][0]=Malerei`;
const OUTPUT_FILE = path.join(__dirname, '../public/data/hamburger-kunsthalle-paintings.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/hamburger-kunsthalle-progress.json');
const ITEMS_PER_PAGE = 20;
const TOTAL_ITEMS = 2304;

// Rate limiting
const DELAY_BETWEEN_ITEMS = 200; // ms
const DELAY_BETWEEN_PAGES = 1000; // ms

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    console.log(`📥 Loaded progress: ${data.artworks.length} artworks, last page: ${data.lastPage}`);
    return data;
  }
  return { lastPage: -1, artworks: [], processedIds: new Set() };
}

function saveProgress(progress) {
  const data = {
    lastPage: progress.lastPage,
    artworks: progress.artworks,
    processedIds: Array.from(progress.processedIds)
  };
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2));
}

async function collectArtworkUrls(page) {
  const urls = [];
  const totalPages = Math.ceil(TOTAL_ITEMS / ITEMS_PER_PAGE);
  
  console.log(`📄 Collecting artwork URLs from ${totalPages} pages...`);
  
  for (let pageNum = 0; pageNum < totalPages; pageNum++) {
    const start = pageNum * ITEMS_PER_PAGE;
    const pageUrl = `${SEARCH_URL}&start=${start}`;
    
    try {
      await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 30000 });
      await sleep(500);
      
      // Extract artwork links
      const links = await page.evaluate(() => {
        const anchors = document.querySelectorAll('a[href*="/en/objekt/"]');
        const urlSet = new Set();
        anchors.forEach(a => {
          const href = a.getAttribute('href');
          if (href && href.includes('/en/objekt/')) {
            // Clean URL - remove query params
            const cleanUrl = href.split('?')[0];
            urlSet.add(cleanUrl);
          }
        });
        return Array.from(urlSet);
      });
      
      links.forEach(link => {
        const fullUrl = link.startsWith('http') ? link : `${BASE_URL}${link}`;
        if (!urls.includes(fullUrl)) {
          urls.push(fullUrl);
        }
      });
      
      console.log(`  Page ${pageNum + 1}/${totalPages}: Found ${links.length} artworks (Total: ${urls.length})`);
      
      await sleep(DELAY_BETWEEN_PAGES);
    } catch (error) {
      console.error(`  ❌ Error on page ${pageNum + 1}: ${error.message}`);
    }
  }
  
  return urls;
}

async function scrapeArtworkDetail(page, url) {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(300);
    
    const artwork = await page.evaluate(() => {
      // Extract ID from URL
      const urlMatch = window.location.pathname.match(/\/objekt\/([^/]+)/);
      const id = urlMatch ? urlMatch[1] : null;
      
      // Title - from h2 or page title
      const titleEl = document.querySelector('h2.heading, .object-title h2');
      let title = titleEl ? titleEl.textContent.trim() : '';
      
      // Clean title - remove year suffix if present
      const titleMatch = title.match(/^(.+),\s*(\d{4}(?:\s*-\s*\d{4})?(?:\s*\/\s*\d{4})?)$/);
      if (titleMatch) {
        title = titleMatch[1].trim();
      }
      
      // Artist - from h1 or artist section
      const artistEl = document.querySelector('h1.heading, .object-artist h1');
      const artist = artistEl ? artistEl.textContent.trim() : '';
      
      // Parse the metadata block
      const metaText = document.body.innerText;
      
      // Date/Year
      let date = '';
      const dateMatch = title.match(/,\s*(\d{4}(?:\s*-\s*\d{4})?(?:\s*\/\s*\d{4})?)$/) ||
                        metaText.match(/(\d{4}(?:\s*-\s*\d{4})?)\s*(?:Öl|Oil|Acryl|Tempera)/i);
      if (dateMatch) {
        date = dateMatch[1].trim();
      }
      
      // Material/Medium
      let material = '';
      const materialMatch = metaText.match(/((?:Öl|Oil|Acryl|Tempera|Aquarell|Gouache)[^\d]*?)(?:\d+(?:\.\d+)?(?:\s*x\s*\d+)?cm)/i);
      if (materialMatch) {
        material = materialMatch[1].trim();
      }
      
      // Dimensions
      let dimensions = '';
      const dimMatch = metaText.match(/(\d+(?:\.\d+)?\s*cm\s*x\s*\d+(?:\.\d+)?\s*cm)(?:\s*\(Bild\))?/);
      if (dimMatch) {
        dimensions = dimMatch[1].trim();
      }
      
      // Inventory number
      let inventoryNumber = '';
      const invMatch = metaText.match(/Inv\.\s*Nr\.:\s*([A-Z0-9-]+)/i);
      if (invMatch) {
        inventoryNumber = invMatch[1].trim();
      }
      
      // Collection
      let collection = '';
      const collMatch = metaText.match(/Collection:\s*([^\n]+)/);
      if (collMatch) {
        collection = collMatch[1].trim();
      }
      
      // Provenance
      let provenance = '';
      const provMatch = metaText.match(/(?:Vermächtnis|Geschenk|Erworben|Acquired|Bequest|Gift)[^,\n]+(?:,\s*\d{4})?/);
      if (provMatch) {
        provenance = provMatch[0].trim();
      }
      
      // Image URL - from lightbox link or img src
      let imageUrl = '';
      const lightboxLink = document.querySelector('a[href*="/sites/default/files/multimedia-files/"]');
      if (lightboxLink) {
        imageUrl = lightboxLink.getAttribute('href');
      } else {
        const mainImg = document.querySelector('img[src*="/multimedia-files/"], img[src*="/styles/"]');
        if (mainImg) {
          imageUrl = mainImg.getAttribute('src');
          // Try to get full resolution
          imageUrl = imageUrl.replace(/\/styles\/[^/]+\/public\//, '/');
        }
      }
      
      // Make image URL absolute
      if (imageUrl && !imageUrl.startsWith('http')) {
        imageUrl = window.location.origin + imageUrl;
      }
      
      return {
        id,
        title,
        artist,
        date,
        material,
        dimensions,
        inventoryNumber,
        collection,
        provenance,
        imageUrl,
        detailUrl: window.location.href.split('?')[0]
      };
    });
    
    return artwork;
  } catch (error) {
    console.error(`  ❌ Error scraping ${url}: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('🎨 Hamburger Kunsthalle - Malerei Collection Scraper');
  console.log('=' .repeat(60));
  
  // Load progress
  let progress = loadProgress();
  if (progress.processedIds && Array.isArray(progress.processedIds)) {
    progress.processedIds = new Set(progress.processedIds);
  } else {
    progress.processedIds = new Set();
  }
  
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  
  try {
    // Step 1: Collect all artwork URLs
    console.log('\n📋 Step 1: Collecting artwork URLs...');
    const artworkUrls = await collectArtworkUrls(page);
    console.log(`\n✅ Found ${artworkUrls.length} unique artwork URLs`);
    
    // Save URLs for reference
    fs.writeFileSync(
      path.join(__dirname, '../downloads/hamburger-kunsthalle-urls.json'),
      JSON.stringify(artworkUrls, null, 2)
    );
    
    // Step 2: Scrape each artwork detail
    console.log('\n📋 Step 2: Scraping artwork details...');
    
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < artworkUrls.length; i++) {
      const url = artworkUrls[i];
      const idMatch = url.match(/\/objekt\/([^/]+)/);
      const id = idMatch ? idMatch[1] : url;
      
      if (progress.processedIds.has(id)) {
        console.log(`  ⏭️  ${i + 1}/${artworkUrls.length}: ${id} (already processed)`);
        continue;
      }
      
      console.log(`  🔍 ${i + 1}/${artworkUrls.length}: ${id}`);
      
      const artwork = await scrapeArtworkDetail(page, url);
      
      if (artwork && artwork.id) {
        progress.artworks.push(artwork);
        progress.processedIds.add(id);
        successCount++;
        
        // Show summary
        console.log(`      ✅ ${artwork.artist} - ${artwork.title}`);
      } else {
        errorCount++;
      }
      
      // Save progress every 50 items
      if ((successCount + errorCount) % 50 === 0) {
        saveProgress(progress);
        console.log(`\n  💾 Progress saved: ${progress.artworks.length} artworks\n`);
      }
      
      await sleep(DELAY_BETWEEN_ITEMS);
    }
    
    // Final save
    saveProgress(progress);
    
    // Save final output
    const output = {
      museum: 'Hamburger Kunsthalle',
      collection: 'Malerei (Paintings)',
      scraped_date: new Date().toISOString(),
      total_count: progress.artworks.length,
      artworks: progress.artworks
    };
    
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    
    console.log('\n' + '=' .repeat(60));
    console.log('📊 Scraping Complete!');
    console.log(`  ✅ Successfully scraped: ${successCount}`);
    console.log(`  ❌ Errors: ${errorCount}`);
    console.log(`  📁 Output saved to: ${OUTPUT_FILE}`);
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    saveProgress(progress);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
