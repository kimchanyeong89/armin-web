/**
 * Centre Pompidou Collection Scraper - Cinema Section
 * URL: https://www.centrepompidou.fr/en/recherche/oeuvres?secteurCollection[]=Cinéma&display=Grid
 * 
 * Features:
 * - Parallel scraping for efficiency
 * - Progress saving for resume support
 * - Duration extraction for video/film works
 * - 2D/3D/Video type classification
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Configuration
const BASE_URL = 'https://www.centrepompidou.fr';
const SEARCH_URL = 'https://www.centrepompidou.fr/en/recherche/oeuvres?secteurCollection%5B%5D=Cin%C3%A9ma&display=Grid';
const OUTPUT_DIR = path.join(__dirname, '../public/data');
const PROGRESS_DIR = path.join(__dirname, '../downloads/pompidou');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'pompidou-cinema-collection.json');
const PROGRESS_FILE = path.join(PROGRESS_DIR, 'cinema-scrape-progress.json');

// Scraping settings
const MAX_PAGES = 78;  // FULL: ~1555 items / 20 per page ≈ 78 pages
const PARALLEL_COUNT = 5;  // Parallel page scraping
const DELAY_BETWEEN_BATCHES = 1500;
const DELAY_BETWEEN_ITEMS = 500;
const SAVE_INTERVAL = 5;  // Save every 5 pages

// Type classification keywords
const TYPE_2D = ['painting', 'drawing', 'oil', 'canvas', 'paper', 'acrylic', 'watercolor', 'print', 'photograph', 'photography', 'ink', 'lithograph', 'engraving'];
const TYPE_3D = ['sculpture', 'installation', 'bronze', 'marble', 'wood', 'stone', 'ceramic', 'glass', 'metal', 'resin', 'plaster', 'object'];
const TYPE_VIDEO = ['video', 'film', 'movie', 'projection', 'monitor', 'cinéma', 'vidéo', 'numérique', 'digital', 'multimedia', '16 mm', '35 mm', '8 mm', 'beta'];

function classifyType(medium, title, domain) {
  const text = (medium + ' ' + title + ' ' + domain).toLowerCase();
  if (TYPE_VIDEO.some(k => text.includes(k))) return 'video';
  if (TYPE_3D.some(k => text.includes(k))) return '3D';
  if (TYPE_2D.some(k => text.includes(k))) return '2D';
  return 'video';  // Default to video for Cinema collection
}

function slugify(text) {
  return text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // Remove accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);
}

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
      return { lastPage: data.lastPage || 0, artworks: data.artworks || [] };
    }
  } catch (e) {
    console.error('Error loading progress:', e.message);
  }
  return { lastPage: 0, artworks: [] };
}

function saveProgress(lastPage, artworks) {
  if (!fs.existsSync(PROGRESS_DIR)) fs.mkdirSync(PROGRESS_DIR, { recursive: true });
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ 
    lastPage, 
    artworks, 
    savedAt: new Date().toISOString() 
  }, null, 2));
}

/**
 * Scrape a single page of results
 */
async function scrapePage(browser, pageNum, existingUrls) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();
  const artworks = [];
  
  try {
    // Construct page URL
    const url = pageNum === 0 
      ? SEARCH_URL 
      : `${SEARCH_URL}&page=${pageNum}`;
    
    console.log(`\n📄 Page ${pageNum + 1}/${MAX_PAGES}: ${url.substring(0, 80)}...`);
    
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);
    
    // Extract artwork links from the grid
    const links = await page.$$eval('a[href*="/ressources/oeuvre/"]', els => 
      [...new Set(els.map(el => el.href).filter(h => h.includes('/ressources/oeuvre/')))]
    );
    
    console.log(`   Found ${links.length} artwork links`);
    
    for (const detailUrl of links) {
      if (existingUrls.has(detailUrl)) {
        process.stdout.write('○');  // Already scraped
        continue;
      }
      
      try {
        await page.goto(detailUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(800);
        
        const data = await page.evaluate(() => {
          // Title - from h1
          const h1 = document.querySelector('h1');
          const title = h1?.textContent?.trim() || '';
          
          // Artist - try multiple approaches
          let artist = '';
          // 1. Try artist link first
          const artistEl = document.querySelector('a[href*="/ressources/personne/"]');
          if (artistEl) {
            artist = artistEl.textContent?.trim() || '';
          }
          // 2. Try to find artist name near title (before h1)
          if (!artist) {
            const skipToContent = document.querySelector('[class*="skip"]');
            const h1El = document.querySelector('h1');
            if (h1El && h1El.previousElementSibling) {
              const prevText = h1El.previousElementSibling.textContent?.trim();
              if (prevText && prevText.length < 200 && !prevText.includes('Skip')) {
                artist = prevText;
              }
            }
          }
          
          // Image - try multiple selectors
          let image = '';
          const imgSelectors = [
            'figure img[src*="/media/picture/"]',
            'img[src*="/media/picture/"]',
            'img[src*="thumb_large"]',
            'main img'
          ];
          for (const sel of imgSelectors) {
            const imgEl = document.querySelector(sel);
            if (imgEl?.src) {
              image = imgEl.src;
              break;
            }
          }
          
          // Extract metadata from table rows
          const tableData = {};
          
          // Try table format first
          document.querySelectorAll('table tr').forEach(row => {
            const cells = row.querySelectorAll('td, th');
            if (cells.length >= 2) {
              const key = cells[0].textContent?.trim().toLowerCase().replace(/\s+/g, ' ') || '';
              const value = cells[1].textContent?.trim() || '';
              tableData[key] = value;
            }
          });
          
          // Also try dl/dd format
          document.querySelectorAll('dl').forEach(dl => {
            const dts = dl.querySelectorAll('dt');
            const dds = dl.querySelectorAll('dd');
            dts.forEach((dt, i) => {
              if (dds[i]) {
                const key = dt.textContent?.trim().toLowerCase().replace(/\s+/g, ' ') || '';
                const value = dds[i].textContent?.trim() || '';
                tableData[key] = value;
              }
            });
          });
          
          // 3. Get artist from table if not found yet
          if (!artist) {
            artist = tableData['artist'] || tableData['artists'] || tableData['artiste'] || tableData['artistes'] || '';
          }
          
          // Helper to clean text (remove extra whitespace, newlines)
          const cleanText = (str) => str?.replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim() || '';
          
          // Extract specific fields
          const year = cleanText(tableData['creation date'] || tableData['date'] || 
                       tableData['création'] || tableData['year'] || '');
          
          const domain = cleanText(tableData['domain'] || tableData['domaine'] || '');
          const techniques = cleanText(tableData['techniques'] || tableData['technique'] || 
                            tableData['medium'] || '');
          const duration = cleanText(tableData['duration'] || tableData['durée'] || '');
          const dimensions = cleanText(tableData['dimensions'] || '');
          const inventoryNo = cleanText(tableData['inventory no.'] || tableData['n° d\'inventaire'] || 
                             tableData['inventory no'] || '');
          const collectionArea = cleanText(tableData['collection area'] || tableData['secteur de collection'] || '');
          
          // Fallback: try to extract year from page text
          let yearFallback = year;
          if (!yearFallback) {
            const pageText = document.body.innerText;
            const yearMatch = pageText.match(/\b(19\d{2}|20\d{2})(?:\s*[-–]\s*(19\d{2}|20\d{2}))?\b/);
            yearFallback = yearMatch?.[0] || '';
          }
          
          return {
            title,
            artist,
            year: yearFallback,
            image,
            domain,
            techniques,
            duration,
            dimensions,
            inventoryNo,
            collectionArea
          };
        });
        
        if (data.title && data.image) {
          // Get ID from URL
          const urlParts = detailUrl.split('/');
          const artworkId = urlParts[urlParts.length - 1] || slugify(data.title);
          
          const type = classifyType(data.techniques, data.title, data.domain);
          
          artworks.push({
            id: `pompidou-cinema-${artworkId}`,
            title: data.title,
            artist: data.artist || 'Unknown',
            year: data.year,
            image: data.image,
            dimensions: data.dimensions,
            duration: data.duration,  // NEW: Duration for video works
            medium: data.techniques,
            domain: data.domain,
            type,
            inventoryNo: data.inventoryNo,
            source: 'Centre Pompidou',
            collectionArea: 'Cinema',
            detailUrl
          });
          process.stdout.write(`[${type}]`);
        } else {
          process.stdout.write('⚠');  // Missing data
          console.log(`\n   ⚠ Missing data for ${detailUrl}: title=${!!data.title}, image=${!!data.image}`);
        }
        
        await page.waitForTimeout(DELAY_BETWEEN_ITEMS);
        
      } catch (err) {
        process.stdout.write('✗');  // Error
        console.error(`\n   ✗ Error scraping ${detailUrl}: ${err.message}`);
      }
    }
    
  } catch (err) {
    console.error(`\nError on page ${pageNum}:`, err.message);
  } finally {
    await context.close();
  }
  
  return artworks;
}

async function main() {
  console.log('🎬 Centre Pompidou Cinema Collection Scraper\n');
  console.log(`📊 Configuration: ${MAX_PAGES} pages, ${PARALLEL_COUNT} parallel\n`);
  
  // Ensure directories exist
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  if (!fs.existsSync(PROGRESS_DIR)) fs.mkdirSync(PROGRESS_DIR, { recursive: true });
  
  // Load progress
  const progress = loadProgress();
  const startPage = progress.lastPage;
  const allArtworks = progress.artworks;
  const existingUrls = new Set(allArtworks.map(a => a.detailUrl));
  
  if (startPage > 0) {
    console.log(`📌 Resuming from page ${startPage + 1}, ${allArtworks.length} artworks already collected\n`);
  }
  
  const browser = await chromium.launch({ headless: true });
  
  try {
    // Scrape pages in parallel batches
    for (let i = startPage; i < MAX_PAGES; i += PARALLEL_COUNT) {
      const batch = [];
      for (let j = 0; j < PARALLEL_COUNT && (i + j) < MAX_PAGES; j++) {
        batch.push(i + j);
      }
      
      console.log(`\n🔄 Batch: Pages ${batch.map(p => p + 1).join(', ')}/${MAX_PAGES}`);
      
      // Parallel scraping
      const results = await Promise.all(
        batch.map(pageNum => scrapePage(browser, pageNum, existingUrls))
      );
      
      // Merge results
      for (const artworks of results) {
        for (const art of artworks) {
          if (!existingUrls.has(art.detailUrl)) {
            allArtworks.push(art);
            existingUrls.add(art.detailUrl);
          }
        }
      }
      
      console.log(`\n   📊 Total: ${allArtworks.length} artworks collected`);
      
      // Save progress
      const currentPage = Math.min(i + PARALLEL_COUNT, MAX_PAGES);
      if (currentPage % (SAVE_INTERVAL * PARALLEL_COUNT) <= PARALLEL_COUNT || currentPage >= MAX_PAGES) {
        saveProgress(currentPage, allArtworks);
        console.log(`   💾 Progress saved (page ${currentPage})`);
      }
      
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES));
    }
    
    // Final output
    const output = {
      museum: 'Centre Pompidou',
      museumId: 'centre-pompidou',
      collectionName: 'Cinema Collection',  // English name as requested
      scrapedAt: new Date().toISOString(),
      totalObjects: allArtworks.length,
      coverImage: allArtworks[0]?.image || '',
      objects: allArtworks.map(art => ({
        ...art,
        // Ensure duration is included for modal display
        duration: art.duration || null,
        dimensions: art.dimensions || null
      }))
    };
    
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    saveProgress(MAX_PAGES, allArtworks);
    
    console.log(`\n✅ Complete! Saved ${allArtworks.length} artworks to ${OUTPUT_FILE}`);
    console.log('\n📋 Sample artworks:');
    allArtworks.slice(0, 3).forEach((art, i) => {
      console.log(`   ${i + 1}. "${art.title}" by ${art.artist}`);
      console.log(`      Year: ${art.year}, Type: ${art.type}`);
      if (art.duration) console.log(`      Duration: ${art.duration}`);
      if (art.dimensions) console.log(`      Dimensions: ${art.dimensions}`);
    });
    
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
