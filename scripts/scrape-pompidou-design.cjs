/**
 * Centre Pompidou Collection Scraper - Design graphique Section (Scroll-based)
 * 
 * 퐁피두 사이트는 JavaScript 기반 무한 스크롤을 사용합니다.
 * 디자인 그래픽 컬렉션 (1,675개) - 병렬 처리 강화
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Configuration
const BASE_URL = 'https://www.centrepompidou.fr';
const SEARCH_URL = 'https://www.centrepompidou.fr/en/recherche/oeuvres?withImage=yes&domaineCollection%5B%5D=Design%20graphique&display=Grid';
const OUTPUT_DIR = path.join(__dirname, '../public/data');
const PROGRESS_DIR = path.join(__dirname, '../downloads/pompidou');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'pompidou-design-collection.json');
const PROGRESS_FILE = path.join(PROGRESS_DIR, 'design-scrape-progress.json');

// Scraping settings - FASTER (병렬 강화)
const MAX_ARTWORKS = 1700;
const SCROLL_DELAY = 1500;
const DETAIL_DELAY = 300;
const PARALLEL_DETAILS = 5;  // 더 빠르게
const SAVE_INTERVAL = 50;
const MAX_SCROLL_ATTEMPTS = 150;
const MAX_RETRIES = 3;

function slugify(text) {
  return text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);
}

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
      return { processedUrls: new Set(data.processedUrls || []), artworks: data.artworks || [] };
    }
  } catch (e) {
    console.error('Error loading progress:', e.message);
  }
  return { processedUrls: new Set(), artworks: [] };
}

function saveProgress(processedUrls, artworks) {
  if (!fs.existsSync(PROGRESS_DIR)) fs.mkdirSync(PROGRESS_DIR, { recursive: true });
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ 
    processedUrls: [...processedUrls],
    artworks, 
    savedAt: new Date().toISOString() 
  }, null, 2));
}

/**
 * Scrape a single artwork detail page with retry
 */
async function scrapeDetail(browser, detailUrl, retries = MAX_RETRIES) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  
  try {
    await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(600);
    
    const data = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      const title = h1?.textContent?.trim() || '';
      
      // Artist
      let artist = '';
      const artistEl = document.querySelector('a[href*="/ressources/personne/"]');
      if (artistEl) {
        artist = artistEl.textContent?.trim() || '';
      }
      
      // Image
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
      
      // Metadata from table
      const tableData = {};
      document.querySelectorAll('table tr').forEach(row => {
        const cells = row.querySelectorAll('td, th');
        if (cells.length >= 2) {
          const key = cells[0].textContent?.trim().toLowerCase().replace(/\s+/g, ' ') || '';
          const value = cells[1].textContent?.trim() || '';
          tableData[key] = value;
        }
      });
      
      // Get artist from table if not found
      if (!artist) {
        artist = tableData['artist'] || tableData['artists'] || tableData['artiste'] || tableData['artistes'] || '';
      }
      
      const cleanText = (str) => str?.replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim() || '';
      
      const year = cleanText(tableData['creation date'] || tableData['date'] || '');
      const domain = cleanText(tableData['domain'] || tableData['domaine'] || '');
      const techniques = cleanText(tableData['techniques'] || tableData['technique'] || '');
      const dimensions = cleanText(tableData['dimensions'] || '');
      const inventoryNo = cleanText(tableData['inventory no.'] || tableData['inventory no'] || '');
      
      return { title, artist, year, image, domain, techniques, dimensions, inventoryNo };
    });
    
    await context.close();
    return data;
    
  } catch (err) {
    await context.close();
    if (retries > 0) {
      await new Promise(r => setTimeout(r, 800));
      return scrapeDetail(browser, detailUrl, retries - 1);
    }
    throw err;
  }
}

async function main() {
  console.log('🎨 Centre Pompidou Design Graphique Collection Scraper\n');
  
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  if (!fs.existsSync(PROGRESS_DIR)) fs.mkdirSync(PROGRESS_DIR, { recursive: true });
  
  // Load progress
  const progress = loadProgress();
  const processedUrls = progress.processedUrls;
  const allArtworks = progress.artworks;
  
  if (allArtworks.length > 0) {
    console.log(`📌 Resuming with ${allArtworks.length} artworks already collected\n`);
  }
  
  console.log('🚀 Launching browser...');
  const browser = await chromium.launch({ headless: true });
  console.log('✅ Browser launched');
  
  try {
    // Step 1: Collect all artwork links by scrolling
    console.log('📜 Step 1: Collecting artwork links by scrolling...\n');
    
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 }
    });
    const listPage = await context.newPage();
    
    console.log('📡 Navigating to search page...');
    await listPage.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log('✅ Page loaded');
    await listPage.waitForTimeout(4000);
    
    // Cookie banner
    try {
      const cookieBtn = await listPage.$('#onetrust-accept-btn-handler');
      if (cookieBtn) {
        await cookieBtn.click();
        console.log('🍪 Cookie banner dismissed');
        await listPage.waitForTimeout(1000);
      }
    } catch (e) {}
    
    console.log('   Expected: 1,675 artworks');
    console.log('   Scrolling...\n');
    
    // Scroll to load all items
    let allLinks = new Set();
    let lastCount = 0;
    let noChangeCount = 0;
    let scrollCount = 0;
    
    while (allLinks.size < MAX_ARTWORKS && noChangeCount < 10 && scrollCount < MAX_SCROLL_ATTEMPTS) {
      // Get current links
      const links = await listPage.$$eval('a[href*="/ressources/oeuvre/"]', els => 
        [...new Set(els.map(el => el.href).filter(h => h.includes('/ressources/oeuvre/')))]
      );
      
      links.forEach(link => allLinks.add(link));
      
      if (scrollCount % 20 === 0 || allLinks.size !== lastCount) {
        console.log(`   📊 Scroll ${scrollCount}: ${allLinks.size} links`);
      }
      
      if (allLinks.size === lastCount) {
        noChangeCount++;
      } else {
        noChangeCount = 0;
      }
      lastCount = allLinks.size;
      scrollCount++;
      
      // Scroll to bottom
      await listPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await listPage.waitForTimeout(SCROLL_DELAY);
    }
    
    await context.close();
    
    const artworkLinks = [...allLinks];
    console.log(`\n✅ Collected ${artworkLinks.length} links\n`);
    
    // Step 2: Scrape detail pages
    console.log('📝 Step 2: Scraping detail pages...\n');
    
    const newLinks = artworkLinks.filter(url => !processedUrls.has(url));
    console.log(`   ${newLinks.length} to process (${processedUrls.size} done)\n`);
    
    // Process in batches
    for (let i = 0; i < newLinks.length; i += PARALLEL_DETAILS) {
      const batch = newLinks.slice(i, i + PARALLEL_DETAILS);
      
      const results = await Promise.allSettled(
        batch.map(url => scrapeDetail(browser, url))
      );
      
      for (let j = 0; j < batch.length; j++) {
        const url = batch[j];
        const result = results[j];
        
        if (result.status === 'fulfilled' && result.value.title && result.value.image) {
          const data = result.value;
          const urlParts = url.split('/');
          const artworkId = urlParts[urlParts.length - 1] || slugify(data.title);
          
          processedUrls.add(url);  // Only add on success
          allArtworks.push({
            id: `pompidou-design-${artworkId}`,
            title: data.title,
            artist: data.artist || 'Unknown',
            year: data.year,
            image: data.image,
            dimensions: data.dimensions || null,
            medium: data.techniques,
            domain: data.domain,
            type: '2D',
            inventoryNo: data.inventoryNo,
            source: 'Centre Pompidou',
            collectionArea: 'Design Graphique',
            detailUrl: url
          });
          process.stdout.write('✓');
        } else {
          process.stdout.write('✗');
        }
      }
      
      // Save progress periodically
      if (allArtworks.length % SAVE_INTERVAL < PARALLEL_DETAILS) {
        saveProgress(processedUrls, allArtworks);
        console.log(`\n   💾 Saved (${allArtworks.length} artworks)`);
      }
      
      await new Promise(r => setTimeout(r, DETAIL_DELAY));
    }
    
    // Final save
    const output = {
      museum: 'Centre Pompidou',
      museumId: 'centre-pompidou',
      collectionName: 'Design Graphique Collection',
      scrapedAt: new Date().toISOString(),
      totalObjects: allArtworks.length,
      coverImage: allArtworks[0]?.image || '',
      objects: allArtworks
    };
    
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    saveProgress(processedUrls, allArtworks);
    
    console.log(`\n\n✅ Complete! ${allArtworks.length} artworks saved`);
    console.log('\n📋 Sample:');
    allArtworks.slice(0, 3).forEach((art, i) => {
      console.log(`   ${i + 1}. "${art.title}" by ${art.artist}`);
    });
    
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
