/**
 * Musée Picasso Paris - Drawings (Dessins) Collection Scraper
 * 
 * 피카소 미술관 파리 - 드로잉 컬렉션 스크래핑
 * 페이지네이션 방식 (105 페이지, 약 1880개 작품)
 * 병렬 처리로 빠르게 스크래핑
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Configuration
const BASE_URL = 'https://cep.museepicassoparis.fr';
const SEARCH_URL = 'https://cep.museepicassoparis.fr/explorer?text=&field_domaine%5Bdessins%5D=dessins';
const PROGRESS_DIR = path.join(__dirname, '../downloads/picasso-paris');
const OUTPUT_DIR = path.join(__dirname, '../public/data');
const PROGRESS_FILE = path.join(PROGRESS_DIR, 'drawings-scrape-progress.json');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'picasso-drawings-collection.json');

// Scraping settings - Fast parallel
const TOTAL_PAGES = 105;
const ITEMS_PER_PAGE = 18;
const PARALLEL_PAGES = 5;      // 동시에 5개 페이지 처리
const PARALLEL_DETAILS = 4;    // 동시에 4개 상세 페이지
const PAGE_DELAY = 500;
const DETAIL_DELAY = 300;
const SAVE_INTERVAL = 100;
const MAX_RETRIES = 3;

function slugify(text) {
  return text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60);
}

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
      return { 
        processedUrls: new Set(data.processedUrls || []), 
        artworks: data.artworks || [],
        lastPage: data.lastPage || 0
      };
    }
  } catch (e) {
    console.error('Error loading progress:', e.message);
  }
  return { processedUrls: new Set(), artworks: [], lastPage: 0 };
}

function saveProgress(processedUrls, artworks, lastPage) {
  if (!fs.existsSync(PROGRESS_DIR)) fs.mkdirSync(PROGRESS_DIR, { recursive: true });
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ 
    processedUrls: [...processedUrls],
    artworks, 
    lastPage,
    totalCount: artworks.length,
    savedAt: new Date().toISOString() 
  }, null, 2));
}

function saveFinalOutput(artworks) {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const finalData = {
    museum: 'Musée Picasso Paris',
    museumId: 'musee-picasso-paris',
    collectionName: 'Drawings Collection (Dessins)',
    scrapedAt: new Date().toISOString(),
    totalObjects: artworks.length,
    coverImage: artworks[0]?.image || '',
    objects: artworks
  };
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalData, null, 2));
  console.log(`✅ Final output saved: ${artworks.length} artworks`);
}

/**
 * Extract artwork links from a list page
 */
async function scrapeListPage(page, pageNum) {
  const url = `${SEARCH_URL}&page=${pageNum}`;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(PAGE_DELAY);
    
    const links = await page.evaluate(() => {
      const results = [];
      // artwork-card-link 또는 작품 링크 패턴
      const anchors = document.querySelectorAll('a[href*="/explorer/"]');
      anchors.forEach(a => {
        const href = a.href;
        // 필터/페이지네이션 링크 제외
        if (href.includes('page=') || href.includes('field_domaine') || 
            href === 'https://cep.museepicassoparis.fr/explorer' ||
            href.includes('/personne/')) {
          return;
        }
        if (!results.includes(href)) {
          results.push(href);
        }
      });
      return results;
    });
    
    console.log(`📄 Page ${pageNum + 1}/${TOTAL_PAGES}: Found ${links.length} artwork links`);
    return links;
  } catch (e) {
    console.error(`❌ Error on page ${pageNum}:`, e.message);
    return [];
  }
}

/**
 * Scrape artwork detail page
 */
async function scrapeDetail(browser, detailUrl, retries = MAX_RETRIES) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  
  try {
    await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(DETAIL_DELAY);
    
    const data = await page.evaluate(() => {
      // Title - h1 또는 특정 클래스
      let title = '';
      const h1 = document.querySelector('h1');
      if (h1) {
        title = h1.textContent?.trim() || '';
      }
      
      // Image - 여러 선택자 시도
      let image = '';
      const imgSelectors = [
        'img[src*="image_liste_visionneuse"]',
        'img[src*="/sites/default/files/"]',
        'main img[src*="medias/image"]',
        '.field--name-field-media-image img',
        'figure img'
      ];
      for (const sel of imgSelectors) {
        const imgEl = document.querySelector(sel);
        if (imgEl?.src && !imgEl.src.includes('logo')) {
          image = imgEl.src;
          break;
        }
      }
      
      // Extract metadata from notice/table structure
      const metadata = {};
      
      // 패턴 1: Notice 테이블 형식
      document.querySelectorAll('.field, [class*="field--name"]').forEach(el => {
        const label = el.querySelector('.field__label, dt')?.textContent?.trim();
        const value = el.querySelector('.field__item, dd, a')?.textContent?.trim();
        if (label && value) {
          metadata[label] = value;
        }
      });
      
      // 패턴 2: 텍스트에서 직접 추출
      const pageText = document.body.innerText;
      
      // Auteur(s) / Author
      let artist = metadata['Auteur(s)'] || metadata['Auteur'] || '';
      if (!artist) {
        const authorLink = document.querySelector('a[href*="/personne/pablo-picasso"]');
        if (authorLink) artist = authorLink.textContent?.trim() || 'Pablo Picasso';
      }
      
      // Date
      let date = metadata['Date'] || '';
      if (!date) {
        const dateMatch = pageText.match(/Date\s+([^\n]+)/);
        if (dateMatch) date = dateMatch[1].trim();
      }
      
      // Numéro d'inventaire (Inventory Number)
      let inventoryNumber = metadata['Numéro d\'inventaire'] || metadata['Numéro d\'inventaire'] || '';
      if (!inventoryNumber) {
        const invMatch = pageText.match(/(?:MP\d+[^\s]*|N°\s*[\d\w-]+)/i);
        if (invMatch) inventoryNumber = invMatch[0];
      }
      
      // Type de support (Medium/Type)
      const medium = metadata['Type de support'] || metadata['Technique'] || 'Dessin';
      
      // Dimensions
      const dimensions = metadata['Dimensions'] || '';
      
      // Lieu de création (Place)
      const place = metadata['Lieu de création'] || '';
      
      return {
        title: title || 'Sans titre',
        artist: artist || 'Pablo Picasso',
        date,
        inventoryNumber,
        medium,
        dimensions,
        place,
        image,
        domain: 'Dessins'
      };
    });
    
    await context.close();
    
    return {
      id: slugify(data.title || 'untitled') + '-' + Date.now().toString(36),
      title: data.title,
      artist: data.artist,
      date: data.date,
      inventoryNumber: data.inventoryNumber,
      medium: data.medium,
      dimensions: data.dimensions,
      place: data.place,
      image: data.image,
      domain: data.domain,
      url: detailUrl
    };
    
  } catch (e) {
    await context.close();
    if (retries > 0) {
      console.log(`⚠️ Retry ${MAX_RETRIES - retries + 1} for ${detailUrl}`);
      await new Promise(r => setTimeout(r, 1000));
      return scrapeDetail(browser, detailUrl, retries - 1);
    }
    console.error(`❌ Failed: ${detailUrl} - ${e.message}`);
    return null;
  }
}

/**
 * Process a batch of detail URLs in parallel
 */
async function processDetailBatch(browser, urls, processedUrls, artworks) {
  const newUrls = urls.filter(u => !processedUrls.has(u));
  if (newUrls.length === 0) return;
  
  const batches = [];
  for (let i = 0; i < newUrls.length; i += PARALLEL_DETAILS) {
    batches.push(newUrls.slice(i, i + PARALLEL_DETAILS));
  }
  
  for (const batch of batches) {
    const results = await Promise.all(
      batch.map(url => scrapeDetail(browser, url))
    );
    
    for (let i = 0; i < batch.length; i++) {
      processedUrls.add(batch[i]);
      if (results[i]) {
        artworks.push(results[i]);
      }
    }
  }
}

/**
 * Main scraping function
 */
async function main() {
  console.log('🎨 Musée Picasso Paris - Drawings Collection Scraper');
  console.log(`📊 Total pages: ${TOTAL_PAGES} (approx 1880 artworks)`);
  console.log('');
  
  // Create directories
  if (!fs.existsSync(PROGRESS_DIR)) fs.mkdirSync(PROGRESS_DIR, { recursive: true });
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  
  // Load progress
  let { processedUrls, artworks, lastPage } = loadProgress();
  console.log(`📥 Loaded progress: ${artworks.length} artworks, last page: ${lastPage}`);
  
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--disable-blink-features=AutomationControlled']
  });
  
  try {
    // Phase 1: Collect all artwork URLs from all pages
    console.log('\n📋 Phase 1: Collecting artwork URLs from all pages...\n');
    
    const allArtworkUrls = new Set();
    
    // Process pages in batches
    for (let pageStart = lastPage; pageStart < TOTAL_PAGES; pageStart += PARALLEL_PAGES) {
      const pageEnd = Math.min(pageStart + PARALLEL_PAGES, TOTAL_PAGES);
      const pagePromises = [];
      
      for (let p = pageStart; p < pageEnd; p++) {
        const context = await browser.newContext({
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        });
        const page = await context.newPage();
        pagePromises.push({ page, context, pageNum: p });
      }
      
      // Scrape pages in parallel
      const pageResults = await Promise.all(
        pagePromises.map(async ({ page, context, pageNum }) => {
          const links = await scrapeListPage(page, pageNum);
          await context.close();
          return { pageNum, links };
        })
      );
      
      // Collect all URLs
      for (const { pageNum, links } of pageResults) {
        links.forEach(link => allArtworkUrls.add(link));
      }
      
      lastPage = pageEnd;
      
      // Save progress periodically
      if ((pageEnd % 10 === 0) || pageEnd >= TOTAL_PAGES) {
        console.log(`\n📊 Progress: Pages ${pageEnd}/${TOTAL_PAGES}, URLs collected: ${allArtworkUrls.size}\n`);
      }
    }
    
    console.log(`\n✅ Collected ${allArtworkUrls.size} unique artwork URLs\n`);
    
    // Phase 2: Scrape artwork details
    console.log('📋 Phase 2: Scraping artwork details...\n');
    
    const urlArray = [...allArtworkUrls].filter(u => !processedUrls.has(u));
    console.log(`🔍 New URLs to process: ${urlArray.length}`);
    
    let processed = 0;
    const total = urlArray.length;
    
    for (let i = 0; i < urlArray.length; i += PARALLEL_DETAILS) {
      const batch = urlArray.slice(i, i + PARALLEL_DETAILS);
      
      const results = await Promise.all(
        batch.map(url => scrapeDetail(browser, url))
      );
      
      for (let j = 0; j < batch.length; j++) {
        processedUrls.add(batch[j]);
        if (results[j]) {
          artworks.push(results[j]);
        }
        processed++;
      }
      
      // Progress update
      if (processed % 20 === 0 || processed === total) {
        const pct = ((processed / total) * 100).toFixed(1);
        console.log(`📊 Detail progress: ${processed}/${total} (${pct}%) - Total artworks: ${artworks.length}`);
      }
      
      // Save periodically
      if (processed % SAVE_INTERVAL === 0) {
        saveProgress(processedUrls, artworks, TOTAL_PAGES);
        console.log(`💾 Progress saved: ${artworks.length} artworks`);
      }
    }
    
    // Final save
    saveProgress(processedUrls, artworks, TOTAL_PAGES);
    saveFinalOutput(artworks);
    
    console.log('\n🎉 Scraping complete!');
    console.log(`📊 Total artworks: ${artworks.length}`);
    console.log(`📁 Progress file: ${PROGRESS_FILE}`);
    console.log(`📁 Output file: ${OUTPUT_FILE}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    saveProgress(processedUrls, artworks, lastPage);
    console.log('💾 Progress saved on error');
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
