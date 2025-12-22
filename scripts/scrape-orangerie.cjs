/**
 * Musée de l'Orangerie Scraper - Full with Progress Saving & Parallel
 * URL: https://www.musee-orangerie.fr/fr/la-collection
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.musee-orangerie.fr/en/collections/search';
const SEARCH_PARAMS = 'search=&sort_by=search_api_relevance&items_per_page=15&search_type=simple_search&display_type=grid';
const OUTPUT_DIR = path.join(__dirname, '../public/data');
const PROGRESS_DIR = path.join(__dirname, '../downloads/orangerie');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'orangerie-collection.json');
const PROGRESS_FILE = path.join(PROGRESS_DIR, 'scrape-progress.json');

// Full scrape: 253 pages
const MAX_PAGES = 253;
const PARALLEL_COUNT = 5;  // Parallel for speed
const DELAY_BETWEEN_BATCHES = 500;
const SAVE_INTERVAL = 5;

// 2D/3D classification (French keywords)
const MEDIUM_2D = ['huile', 'peinture', 'toile', 'papier', 'aquarelle', 'gouache', 'pastel', 'encre', 'dessin', 'lithographie', 'gravure', 'sérigraphie', 'estampe', 'carton'];
const MEDIUM_3D = ['bois', 'bronze', 'pierre', 'marbre', 'terre', 'céramique', 'plâtre', 'ivoire', 'os', 'corne', 'métal', 'fer', 'cuivre', 'sculpture', 'masque', 'statuette', 'figurine', 'relief'];

function classifyType(medium, title) {
  const text = (medium + ' ' + title).toLowerCase();
  if (MEDIUM_3D.some(k => text.includes(k))) return '3D';
  if (MEDIUM_2D.some(k => text.includes(k))) return '2D';
  return 'unknown';
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 50);
}

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
      return { lastPage: data.lastPage || 0, artworks: data.artworks || [] };
    }
  } catch (e) {}
  return { lastPage: 0, artworks: [] };
}

function saveProgress(lastPage, artworks) {
  if (!fs.existsSync(PROGRESS_DIR)) fs.mkdirSync(PROGRESS_DIR, { recursive: true });
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ lastPage, artworks, savedAt: new Date().toISOString() }, null, 2));
}

async function scrapePage(browser, pageNum, existingUrls) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const page = await context.newPage();
  const artworks = [];
  
  try {
    const url = `${BASE_URL}?${SEARCH_PARAMS}&page=${pageNum}`;
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1500);
    
    const links = await page.$$eval('a[href*="/en/artworks/"]', els => 
      [...new Set(els.map(el => el.href).filter(h => h.includes('/artworks/')))]
    );
    
    console.log(`   Found ${links.length} artworks`);
    
    for (const detailUrl of links) {
      if (existingUrls.has(detailUrl)) {
        process.stdout.write('○');
        continue;
      }
      
      try {
        await page.goto(detailUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(800);
        
        const data = await page.evaluate(() => {
          const title = document.querySelector('h1')?.textContent?.trim() || '';
          
          // Artist - use class*=artist or author
          let artist = document.querySelector('[class*="artist"], [class*="author"]')?.textContent?.trim() || 'Anonyme';
          artist = artist.replace(/\s+/g, ' ').trim();
          
          // Year - use class*=date
          const year = document.querySelector('[class*="date"]')?.textContent?.trim() || '';
          
          // Medium/technique
          const medium = document.querySelector('[class*="technique"], [class*="medium"]')?.textContent?.trim() || '';
          
          // Dimensions
          let dimensions = '';
          const dimEl = document.querySelector('[class*="dimension"]');
          if (dimEl) {
            const dimText = dimEl.textContent || '';
            const match = dimText.match(/(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)/i) ||
                          dimText.match(/H\.\s*(\d+(?:[.,]\d+)?)\s*;\s*L\.\s*(\d+(?:[.,]\d+)?)/i);
            if (match) dimensions = `${match[1].replace(',', '.')} x ${match[2].replace(',', '.')} cm`;
          }
          
          // Image - from CDN
          const imgEl = document.querySelector('figure img, main img');
          let image = imgEl?.src || '';
          
          return { title, artist, year, medium, dimensions, image };
        });
        
        if (data.title && data.image) {
          const type = classifyType(data.medium, data.title);
          artworks.push({
            id: `orangerie-${slugify(data.title)}-${Date.now().toString(36).slice(-4)}`,
            title: data.title, artist: data.artist, year: data.year, image: data.image,
            dimensions: data.dimensions, medium: data.medium, type,
            source: "Musée de l'Orangerie", detailUrl
          });
          process.stdout.write(`[${type}]`);
        } else {
          process.stdout.write('⚠');
        }
      } catch (err) {
        process.stdout.write('✗');
      }
    }
  } catch (err) {
    console.error(`Error on page ${pageNum}:`, err.message);
  } finally {
    await context.close();
  }
  
  return artworks;
}

async function main() {
  console.log("🍊 Musée de l'Orangerie Scraper (Full with Progress)\n");
  
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  
  const progress = loadProgress();
  const startPage = progress.lastPage;
  const allArtworks = progress.artworks;
  const existingUrls = new Set(allArtworks.map(a => a.detailUrl));
  
  if (startPage > 0) {
    console.log(`📌 Resuming from page ${startPage + 1}, ${allArtworks.length} artworks already collected\n`);
  }
  
  const browser = await chromium.launch({ headless: true });
  
  try {
    for (let i = startPage; i < MAX_PAGES; i += PARALLEL_COUNT) {
      const batch = [];
      for (let j = 0; j < PARALLEL_COUNT && (i + j) < MAX_PAGES; j++) {
        batch.push(i + j);
      }
      
      console.log(`\n📄 Pages ${batch.map(p => p + 1).join(', ')}/${MAX_PAGES}`);
      
      const results = await Promise.all(
        batch.map(pageNum => scrapePage(browser, pageNum, existingUrls))
      );
      
      for (const artworks of results) {
        for (const art of artworks) {
          if (!existingUrls.has(art.detailUrl)) {
            allArtworks.push(art);
            existingUrls.add(art.detailUrl);
          }
        }
      }
      
      console.log(`\n   📊 Total: ${allArtworks.length} artworks`);
      
      // Save progress
      const currentPage = Math.min(i + PARALLEL_COUNT, MAX_PAGES);
      if (currentPage % (SAVE_INTERVAL * PARALLEL_COUNT) < PARALLEL_COUNT) {
        saveProgress(currentPage, allArtworks);
        console.log(`   💾 Progress saved (page ${currentPage})`);
      }
      
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES));
    }
    
    // Final save
    const output = {
      museum: "Musée de l'Orangerie",
      museumId: 'musee-orangerie',
      collectionName: "Musée de l'Orangerie Collection",
      scrapedAt: new Date().toISOString(),
      totalObjects: allArtworks.length,
      coverImage: allArtworks[0]?.image || '',
      objects: allArtworks
    };
    
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    saveProgress(MAX_PAGES, allArtworks);
    console.log(`\n✅ Complete! Saved ${allArtworks.length} artworks to ${OUTPUT_FILE}`);
    
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
