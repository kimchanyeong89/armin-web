/**
 * Museo Reina Sofía Collection Scraper
 * 
 * Scrapes artworks from https://www.museoreinasofia.es/en/search?bundle=artwork&hasImage=true
 * Total: ~14,700+ artworks with images
 * 
 * Collects:
 * - title, artist, inventory number
 * - date/year, technique, dimensions
 * - description, room/location info
 * - thumbnail URL, source URL
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ============ CONFIGURATION ============
const CONFIG = {
  searchUrl: 'https://www.museoreinasofia.es/en/search',
  searchParams: 'bundle=artwork&hasImage=true',
  
  outputPath: path.join(__dirname, '../public/data'),
  progressPath: path.join(__dirname, '../downloads/reina-sofia-progress.json'),
  logPath: path.join(__dirname, '../downloads/reina-sofia-scrape-log.txt'),
  
  // Pagination
  pageSize: 12, // Items per page on the website
  
  // Performance settings
  concurrency: 5,        // Parallel detail page scraping
  batchSize: 100,        // Save every N items
  partSize: 2000,        // Items per part file
  
  // Delays
  pageDelay: 500,        // Between pagination pages
  detailDelay: 300,      // Between detail requests
  
  // Timeouts
  pageTimeout: 60000,
  navigationTimeout: 30000,
  
  // Retry
  maxRetries: 3,
  
  // Test mode
  testMode: false,
  testLimit: 20,
};

// ============ GLOBALS ============
let browser = null;
let startTime = Date.now();

// ============ HELPERS ============
function log(message) {
  const timestamp = new Date().toISOString().slice(11, 19);
  const line = `[${timestamp}] ${message}`;
  console.log(line);
  fs.appendFileSync(CONFIG.logPath, line + '\n');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadProgress() {
  if (fs.existsSync(CONFIG.progressPath)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG.progressPath, 'utf8'));
    } catch (e) {
      log('Could not load progress, starting fresh');
    }
  }
  return {
    phase: 'collect',
    artworkUrls: [],
    completed: [],
    failed: [],
    artworks: [],
    currentPart: 1,
    lastPage: 0
  };
}

function saveProgress(progress) {
  fs.writeFileSync(CONFIG.progressPath, JSON.stringify({
    ...progress,
    lastUpdate: new Date().toISOString(),
    elapsedMs: Date.now() - startTime
  }, null, 2));
}

function saveArtworks(artworks, partNumber) {
  const fileName = `reina-sofia-collection-part${partNumber}.json`;
  const filePath = path.join(CONFIG.outputPath, fileName);
  fs.writeFileSync(filePath, JSON.stringify(artworks, null, 2));
  log(`💾 Saved ${artworks.length} artworks to ${fileName}`);
}

// ============ SCRAPING FUNCTIONS ============

/**
 * Collect all artwork URLs from search results with pagination
 */
async function collectArtworkUrls(page, progress) {
  log('═══════════════════════════════════════════════════════════');
  log('  Phase 1: Collecting artwork URLs from search results');
  log('═══════════════════════════════════════════════════════════');
  
  let artworkUrls = progress.artworkUrls || [];
  let currentPage = progress.lastPage || 0;
  
  // Navigate to search page
  const searchUrl = `${CONFIG.searchUrl}?${CONFIG.searchParams}&page=${currentPage}`;
  log(`📄 Starting from page ${currentPage}...`);
  
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: CONFIG.pageTimeout });
  await sleep(2000);
  
  // Accept cookies if present
  try {
    const cookieBtn = page.locator('button:has-text("Accept")');
    if (await cookieBtn.isVisible({ timeout: 3000 })) {
      await cookieBtn.click();
      await sleep(1000);
    }
  } catch (e) {
    // No cookie banner
  }
  
  // Get total results
  const totalText = await page.locator('text=/\\d+\\s*results/i').first().textContent({ timeout: 10000 }).catch(() => '0 results');
  const totalMatch = totalText.match(/(\d[\d,]*)/);
  const totalResults = totalMatch ? parseInt(totalMatch[1].replace(/,/g, '')) : 0;
  const totalPages = Math.ceil(totalResults / CONFIG.pageSize);
  
  log(`📊 Found ${totalResults} total artworks across ~${totalPages} pages`);
  
  if (CONFIG.testMode) {
    log(`⚠️ TEST MODE: Limiting to ${CONFIG.testLimit} items`);
  }
  
  // Paginate and collect URLs
  while (currentPage < totalPages) {
    if (CONFIG.testMode && artworkUrls.length >= CONFIG.testLimit) {
      break;
    }
    
    const pageUrl = `${CONFIG.searchUrl}?${CONFIG.searchParams}&page=${currentPage}`;
    
    try {
      if (currentPage > 0) {
        await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: CONFIG.navigationTimeout });
        await sleep(CONFIG.pageDelay);
      }
      
      // Wait for artwork cards to load
      await page.waitForSelector('a[href*="/collections/artwork/"]', { timeout: 15000 }).catch(() => null);
      
      // Extract artwork URLs and basic info from this page
      const pageData = await page.evaluate(() => {
        const items = [];
        const cards = document.querySelectorAll('a[href*="/collections/artwork/"]');
        
        cards.forEach(card => {
          const url = card.href;
          
          // Try to get basic info from the card
          const text = card.textContent || '';
          const lines = text.split('\n').map(l => l.trim()).filter(l => l);
          
          // Extract inventory number (usually like AD12345, DE00050, etc.)
          const invMatch = text.match(/([A-Z]{2}\d{4,}(?:\s*-\s*\d+)?(?:-\d+)?)/);
          const inventoryNumber = invMatch ? invMatch[1].replace(/\s+/g, '') : '';
          
          // Get image URL
          const img = card.querySelector('img');
          const imageUrl = img ? (img.src || img.dataset.src || '') : '';
          
          items.push({
            url: url,
            inventoryNumber: inventoryNumber,
            thumbnailUrl: imageUrl
          });
        });
        
        // Deduplicate by URL
        const seen = new Set();
        return items.filter(item => {
          if (seen.has(item.url)) return false;
          seen.add(item.url);
          return true;
        });
      });
      
      // Add new URLs
      const existingUrls = new Set(artworkUrls.map(a => a.url));
      let newCount = 0;
      for (const item of pageData) {
        if (!existingUrls.has(item.url)) {
          artworkUrls.push(item);
          existingUrls.add(item.url);
          newCount++;
        }
      }
      
      currentPage++;
      
      process.stdout.write(`\r📥 Page ${currentPage}/${totalPages} | Total URLs: ${artworkUrls.length} (+${newCount})          `);
      
      // Save progress periodically
      if (currentPage % 50 === 0) {
        progress.artworkUrls = artworkUrls;
        progress.lastPage = currentPage;
        saveProgress(progress);
        log(`\n💾 Progress saved at page ${currentPage}`);
      }
      
    } catch (error) {
      log(`\n❌ Error on page ${currentPage}: ${error.message}`);
      // Continue to next page
      currentPage++;
      await sleep(2000);
    }
  }
  
  console.log(''); // New line after progress
  log(`✅ Phase 1 complete: Collected ${artworkUrls.length} artwork URLs`);
  
  progress.artworkUrls = artworkUrls;
  progress.lastPage = currentPage;
  progress.phase = 'detail';
  saveProgress(progress);
  
  return artworkUrls;
}

/**
 * Scrape detailed information from a single artwork page
 */
async function scrapeArtworkDetail(context, urlData, retryCount = 0) {
  const page = await context.newPage();
  
  try {
    await page.goto(urlData.url, { waitUntil: 'domcontentloaded', timeout: CONFIG.navigationTimeout });
    await sleep(500);
    
    const artwork = await page.evaluate((initialData) => {
      const result = {
        id: '',
        title: '',
        artist: '',
        artistUrl: '',
        date: '',
        technique: '',
        dimensions: '',
        inventoryNumber: initialData.inventoryNumber || '',
        description: '',
        room: '',
        roomUrl: '',
        building: '',
        category: 'Artwork',
        museum: 'Museo Nacional Centro de Arte Reina Sofía',
        thumbnailUrl: initialData.thumbnailUrl || '',
        imageUrl: '',
        sourceUrl: initialData.url
      };
      
      // Extract ID from URL
      const urlParts = initialData.url.split('/');
      result.id = urlParts[urlParts.length - 1] || '';
      
      // Title - from h1
      const h1 = document.querySelector('h1');
      if (h1) {
        result.title = h1.textContent.trim();
      }
      
      // Artist - link containing /collections/artist/
      const artistLink = document.querySelector('a[href*="/collections/artist/"]');
      if (artistLink) {
        result.artist = artistLink.textContent.trim();
        result.artistUrl = artistLink.href;
      }
      
      // Room information - look for "Exhibited in Room" or similar
      const roomLink = document.querySelector('a[href*="/collection/sala-"], a[href*="/colecciones/sala-"]');
      if (roomLink) {
        result.room = roomLink.textContent.trim().replace(/^Exhibited in\s*/i, '');
        result.roomUrl = roomLink.href;
      }
      
      // Also check text content for room info
      const bodyText = document.body.textContent || '';
      const roomMatch = bodyText.match(/Exhibited in (Room [A-Z0-9.]+)/i);
      if (roomMatch && !result.room) {
        result.room = roomMatch[1];
      }
      
      // Look for metadata in structured content
      // Many pages have dl/dt/dd or table structure
      const dtElements = document.querySelectorAll('dt, th');
      dtElements.forEach(dt => {
        const label = dt.textContent.trim().toLowerCase();
        const dd = dt.nextElementSibling;
        if (!dd) return;
        const value = dd.textContent.trim();
        
        if (label.includes('date') || label.includes('year') || label.includes('fecha')) {
          result.date = value;
        } else if (label.includes('technique') || label.includes('técnica') || label.includes('medium')) {
          result.technique = value;
        } else if (label.includes('dimension') || label.includes('size') || label.includes('medidas')) {
          result.dimensions = value;
        } else if (label.includes('inventory') || label.includes('registro') || label.includes('number')) {
          result.inventoryNumber = value;
        } else if (label.includes('category') || label.includes('categoría')) {
          result.category = value;
        }
      });
      
      // Try to extract from visible text blocks
      const contentBlocks = document.querySelectorAll('article, .content, .artwork-detail, .obra-detail');
      contentBlocks.forEach(block => {
        const text = block.textContent || '';
        
        // Year pattern (4 digits between 1800-2030)
        if (!result.date) {
          const yearMatch = text.match(/\b(1[89]\d{2}|20[0-3]\d)\b/);
          if (yearMatch) {
            result.date = yearMatch[1];
          }
        }
        
        // Dimensions pattern (e.g., "349 x 776,6 cm" or "200 x 300 cm")
        if (!result.dimensions) {
          const dimMatch = text.match(/(\d+(?:[,.]\d+)?\s*[x×]\s*\d+(?:[,.]\d+)?(?:\s*[x×]\s*\d+(?:[,.]\d+)?)?\s*(?:cm|mm|m|in)?)/i);
          if (dimMatch) {
            result.dimensions = dimMatch[1];
          }
        }
      });
      
      // Description - look for paragraph with substantial text
      const paragraphs = document.querySelectorAll('article p, .content p, main p');
      const descParagraphs = [];
      paragraphs.forEach(p => {
        const text = p.textContent.trim();
        // Skip short or navigation-like text
        if (text.length > 100 && !text.includes('cookie') && !text.includes('newsletter')) {
          descParagraphs.push(text);
        }
      });
      if (descParagraphs.length > 0) {
        result.description = descParagraphs.join('\n\n');
      }
      
      // Get high-res image URL
      const mainImg = document.querySelector('article img, .artwork-image img, main img[src*="Obra"]');
      if (mainImg) {
        let imgSrc = mainImg.src || mainImg.dataset.src || '';
        // Try to get larger version by modifying URL
        if (imgSrc.includes('/styles/')) {
          // Remove style path to get original
          const originalMatch = imgSrc.match(/\/public\/(.+)$/);
          if (originalMatch) {
            result.imageUrl = `https://recursos.museoreinasofia.es/sites/default/files/${originalMatch[1].replace('.webp', '')}`;
          } else {
            result.imageUrl = imgSrc;
          }
        } else {
          result.imageUrl = imgSrc;
        }
      }
      
      // Update thumbnail if we found a better one
      if (!result.thumbnailUrl && result.imageUrl) {
        result.thumbnailUrl = result.imageUrl;
      }
      
      return result;
    }, urlData);
    
    await page.close();
    return artwork;
    
  } catch (error) {
    await page.close();
    
    if (retryCount < CONFIG.maxRetries) {
      await sleep(1000 * (retryCount + 1));
      return scrapeArtworkDetail(context, urlData, retryCount + 1);
    }
    
    // Return basic info on failure
    return {
      id: urlData.url.split('/').pop() || '',
      title: '',
      artist: '',
      inventoryNumber: urlData.inventoryNumber || '',
      thumbnailUrl: urlData.thumbnailUrl || '',
      sourceUrl: urlData.url,
      museum: 'Museo Nacional Centro de Arte Reina Sofía',
      error: error.message
    };
  }
}

/**
 * Scrape all artwork details in batches
 */
async function scrapeAllDetails(browser, progress) {
  log('═══════════════════════════════════════════════════════════');
  log('  Phase 2: Scraping artwork details');
  log('═══════════════════════════════════════════════════════════');
  
  const artworkUrls = progress.artworkUrls;
  const completed = new Set(progress.completed || []);
  const failed = new Set(progress.failed || []);
  let artworks = progress.artworks || [];
  let currentPart = progress.currentPart || 1;
  
  // Filter URLs to process
  const toProcess = artworkUrls.filter(item => !completed.has(item.url) && !failed.has(item.url));
  log(`📊 ${toProcess.length} artworks to process (${completed.size} completed, ${failed.size} failed)`);
  
  if (CONFIG.testMode) {
    toProcess.length = Math.min(toProcess.length, CONFIG.testLimit);
    log(`⚠️ TEST MODE: Limiting to ${CONFIG.testLimit} items`);
  }
  
  // Create browser context for parallel processing
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  
  let processed = 0;
  
  // Process in batches
  for (let i = 0; i < toProcess.length; i += CONFIG.concurrency) {
    const batch = toProcess.slice(i, i + CONFIG.concurrency);
    
    const results = await Promise.all(
      batch.map(urlData => scrapeArtworkDetail(context, urlData))
    );
    
    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      const url = batch[j].url;
      
      if (result.error) {
        failed.add(url);
      } else {
        completed.add(url);
        artworks.push(result);
      }
      processed++;
    }
    
    const pct = ((i + batch.length) / toProcess.length * 100).toFixed(1);
    process.stdout.write(`\r📥 Progress: ${i + batch.length}/${toProcess.length} (${pct}%) | Artworks: ${artworks.length}          `);
    
    // Save part file when reaching part size
    if (artworks.length >= CONFIG.partSize) {
      saveArtworks(artworks, currentPart);
      artworks = [];
      currentPart++;
    }
    
    // Save progress periodically
    if (processed % CONFIG.batchSize === 0) {
      progress.completed = Array.from(completed);
      progress.failed = Array.from(failed);
      progress.artworks = artworks;
      progress.currentPart = currentPart;
      saveProgress(progress);
    }
    
    await sleep(CONFIG.detailDelay);
  }
  
  await context.close();
  
  // Save remaining artworks
  if (artworks.length > 0) {
    saveArtworks(artworks, currentPart);
  }
  
  console.log(''); // New line
  log(`✅ Phase 2 complete: ${completed.size} succeeded, ${failed.size} failed`);
  
  // Final progress save
  progress.completed = Array.from(completed);
  progress.failed = Array.from(failed);
  progress.artworks = [];
  progress.currentPart = currentPart;
  progress.phase = 'done';
  saveProgress(progress);
  
  return { completed: completed.size, failed: failed.size };
}

/**
 * Merge all part files into one
 */
function mergePartFiles() {
  log('═══════════════════════════════════════════════════════════');
  log('  Merging part files');
  log('═══════════════════════════════════════════════════════════');
  
  const allArtworks = [];
  let partNum = 1;
  
  while (true) {
    const partFile = path.join(CONFIG.outputPath, `reina-sofia-collection-part${partNum}.json`);
    if (!fs.existsSync(partFile)) break;
    
    const partData = JSON.parse(fs.readFileSync(partFile, 'utf8'));
    allArtworks.push(...partData);
    log(`  Part ${partNum}: ${partData.length} artworks`);
    partNum++;
  }
  
  if (allArtworks.length > 0) {
    const mergedFile = path.join(CONFIG.outputPath, 'reina-sofia-collection.json');
    fs.writeFileSync(mergedFile, JSON.stringify(allArtworks, null, 2));
    log(`✅ Merged ${allArtworks.length} artworks into reina-sofia-collection.json`);
  }
  
  return allArtworks.length;
}

// ============ MAIN ============
async function main() {
  console.log('');
  log('═══════════════════════════════════════════════════════════');
  log('  🏛️  Museo Reina Sofía Collection Scraper');
  log('═══════════════════════════════════════════════════════════');
  console.log('');
  
  // Ensure directories exist
  ensureDir(CONFIG.outputPath);
  ensureDir(path.dirname(CONFIG.progressPath));
  
  // Load or initialize progress
  let progress = loadProgress();
  startTime = Date.now();
  
  // Initialize log file
  fs.writeFileSync(CONFIG.logPath, `=== Museo Reina Sofía Scraper Log ===\nStarted: ${new Date().toISOString()}\n\n`);
  
  try {
    // Launch browser
    log('🚀 Launching browser...');
    browser = await chromium.launch({
      headless: true,
      args: ['--disable-web-security', '--no-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    // Phase 1: Collect artwork URLs
    if (progress.phase === 'collect' || progress.artworkUrls.length === 0) {
      await collectArtworkUrls(page, progress);
    } else {
      log(`📋 Resuming with ${progress.artworkUrls.length} artwork URLs already collected`);
    }
    
    await page.close();
    
    // Phase 2: Scrape details
    if (progress.phase === 'detail' || progress.phase === 'collect') {
      await scrapeAllDetails(browser, progress);
    }
    
    // Close browser
    await browser.close();
    
    // Merge part files
    const total = mergePartFiles();
    
    // Final stats
    const elapsed = (Date.now() - startTime) / 1000;
    log('');
    log('═══════════════════════════════════════════════════════════');
    log('  📊 Final Statistics');
    log('═══════════════════════════════════════════════════════════');
    log(`  Total artworks: ${total}`);
    log(`  Time elapsed: ${Math.floor(elapsed / 60)}m ${Math.floor(elapsed % 60)}s`);
    log(`  Rate: ${(total / (elapsed / 60)).toFixed(1)} artworks/minute`);
    log('═══════════════════════════════════════════════════════════');
    
  } catch (error) {
    log(`❌ Fatal error: ${error.message}`);
    console.error(error);
    
    if (browser) {
      await browser.close();
    }
    
    process.exit(1);
  }
}

// Run
main().catch(console.error);
