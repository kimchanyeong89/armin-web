/**
 * Musée Picasso Paris - Sculptures & Objects Collection Scraper v2
 * 
 * 피카소 미술관 파리 - 조각/오브젝트 컬렉션 스크래핑
 * 이미지가 있는 작품만 필터링 (sort-image=1)
 * 병렬 처리로 빠르게 스크래핑
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Configuration - Updated URL with image filter
const BASE_URL = 'https://cep.museepicassoparis.fr';
const SEARCH_URL = 'https://cep.museepicassoparis.fr/explorer?text=&field_domaine%5Bsculptures%5D=sculptures&field_domaine%5Bobjets%5D=objets&sort-image=1';
const PROGRESS_DIR = path.join(__dirname, '../downloads/picasso-paris');
const OUTPUT_DIR = path.join(__dirname, '../downloads/picasso-paris');
const PROGRESS_FILE = path.join(PROGRESS_DIR, 'sculptures-v2-progress.json');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'picasso-sculptures-collection.json');
const COLLECTION_NAME = 'Sculptures & Objects Collection';
const DOMAIN = 'Sculptures';
const DEFAULT_MEDIUM = 'Sculpture';

// Scraping settings - Fast parallel
const ITEMS_PER_PAGE = 18;
const PARALLEL_PAGES = 6;      // 동시에 6개 페이지 처리
const PARALLEL_DETAILS = 8;    // 동시에 8개 상세 페이지
const PAGE_DELAY = 400;
const DETAIL_DELAY = 200;
const SAVE_INTERVAL = 50;
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
        lastPage: data.lastPage || 0,
        totalPages: data.totalPages || 0,
        allUrls: new Set(data.allUrls || [])
      };
    }
  } catch (e) {
    console.error('Error loading progress:', e.message);
  }
  return { processedUrls: new Set(), artworks: [], lastPage: 0, totalPages: 0, allUrls: new Set() };
}

function saveProgress(processedUrls, artworks, lastPage, totalPages, allUrls) {
  if (!fs.existsSync(PROGRESS_DIR)) fs.mkdirSync(PROGRESS_DIR, { recursive: true });
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ 
    processedUrls: [...processedUrls],
    artworks, 
    lastPage,
    totalPages,
    allUrls: [...allUrls],
    totalCount: artworks.length,
    savedAt: new Date().toISOString() 
  }, null, 2));
}

function saveFinalOutput(artworks) {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const finalData = {
    museum: 'Musée Picasso Paris',
    museumId: 'musee-picasso-paris',
    collectionName: COLLECTION_NAME,
    scrapedAt: new Date().toISOString(),
    totalObjects: artworks.length,
    coverImage: artworks[0]?.image || '',
    objects: artworks
  };
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalData, null, 2));
  console.log(`✅ Final output saved: ${artworks.length} artworks`);
}

/**
 * Get total number of pages from search results
 */
async function getTotalPages(page) {
  try {
    await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1000);
    
    const totalInfo = await page.evaluate(() => {
      // 결과 수 찾기
      const text = document.body.innerText;
      
      // "1880 résultats" 패턴
      const match = text.match(/(\d+)\s*résultats?/i);
      const totalResults = match ? parseInt(match[1]) : 0;
      
      // 페이지네이션에서 마지막 페이지 찾기
      const paginationLinks = document.querySelectorAll('.pager a, nav.pagination a, a[href*="page="]');
      let maxPage = 0;
      paginationLinks.forEach(a => {
        const href = a.getAttribute('href');
        const pageMatch = href?.match(/page=(\d+)/);
        if (pageMatch) {
          maxPage = Math.max(maxPage, parseInt(pageMatch[1]));
        }
      });
      
      return { totalResults, maxPage };
    });
    
    console.log(`📊 Found ${totalInfo.totalResults} results, max page index: ${totalInfo.maxPage}`);
    
    // 페이지 수 계산 (page index는 0부터 시작)
    const totalPages = totalInfo.maxPage + 1;
    return totalPages;
    
  } catch (e) {
    console.error('Error getting total pages:', e.message);
    return 100; // fallback
  }
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
      // artwork-card 또는 작품 링크 패턴
      const anchors = document.querySelectorAll('a[href*="/explorer/"]');
      anchors.forEach(a => {
        const href = a.href;
        // 필터/페이지네이션 링크 제외
        if (href.includes('page=') || href.includes('field_domaine') || 
            href === 'https://cep.museepicassoparis.fr/explorer' ||
            href.includes('/personne/') || href.includes('sort-image')) {
          return;
        }
        if (!results.includes(href)) {
          results.push(href);
        }
      });
      return results;
    });
    
    console.log(`📄 Page ${pageNum + 1}: Found ${links.length} artwork links`);
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
      // Title - 여러 선택자 시도 (우선순위)
      let title = '';
      // 1. .node__content__title .title (가장 정확)
      const titleDiv = document.querySelector('.node__content__title .title');
      if (titleDiv) {
        title = titleDiv.textContent?.trim() || '';
      }
      // 2. .notice-table에서 "Titre" 필드 찾기
      if (!title) {
        const noticeItems = document.querySelectorAll('.notice-table__item');
        noticeItems.forEach(item => {
          const label = item.querySelector('.notice-table__item__title')?.textContent?.trim();
          const value = item.querySelector('.notice-table__item__content')?.textContent?.trim();
          if (label === 'Titre' && value) {
            title = value;
          }
        });
      }
      // 3. <title> 태그
      if (!title) {
        const pageTitle = document.querySelector('title');
        if (pageTitle) {
          title = pageTitle.textContent?.trim() || '';
        }
      }
      // 4. og:title 메타 태그
      if (!title) {
        const ogTitle = document.querySelector('meta[property="og:title"]');
        if (ogTitle) {
          title = ogTitle.getAttribute('content') || '';
        }
      }
      
      // Image - 여러 선택자 시도
      let image = '';
      const imgSelectors = [
        'img[src*="image_liste_visionneuse"]',
        'img[src*="/sites/default/files/"]',
        'main img[src*="medias/image"]',
        '.field--name-field-media-image img',
        'figure img',
        'article img'
      ];
      for (const sel of imgSelectors) {
        const imgEl = document.querySelector(sel);
        if (imgEl?.src && !imgEl.src.includes('logo') && !imgEl.src.includes('icon')) {
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
      let inventoryNumber = metadata['Numéro d\'inventaire'] || '';
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
        domain: 'Sculptures'
      };
    });
    
    await context.close();
    
    // 이미지가 없으면 스킵
    if (!data.image) {
      return null;
    }
    
    // date에서 year 추출
    const yearMatch = data.date?.match(/(\d{4})/);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
    
    return {
      id: slugify(data.title || 'untitled') + '-' + Date.now().toString(36),
      title: data.title,
      artist: data.artist,
      year: year,
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
      await new Promise(r => setTimeout(r, 500));
      return scrapeDetail(browser, detailUrl, retries - 1);
    }
    console.error(`❌ Failed: ${detailUrl.substring(0, 60)}...`);
    return null;
  }
}

/**
 * Main scraping function
 */
async function main() {
  console.log('🎨 Musée Picasso Paris - Sculptures & Objects Collection Scraper v2');
  console.log('📍 URL: Images only (sort-image=1)');
  console.log('');
  
  // Create directories
  if (!fs.existsSync(PROGRESS_DIR)) fs.mkdirSync(PROGRESS_DIR, { recursive: true });
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  
  // Load progress
  let { processedUrls, artworks, lastPage, totalPages, allUrls } = loadProgress();
  console.log(`📥 Loaded progress: ${artworks.length} artworks, URLs: ${allUrls.size}, last page: ${lastPage}`);
  
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--disable-blink-features=AutomationControlled']
  });
  
  try {
    // Get total pages first
    if (totalPages === 0) {
      const initialContext = await browser.newContext();
      const initialPage = await initialContext.newPage();
      totalPages = await getTotalPages(initialPage);
      await initialContext.close();
      console.log(`📊 Total pages to scrape: ${totalPages}`);
    }
    
    // Phase 1: Collect all artwork URLs from all pages
    if (allUrls.size === 0 || lastPage < totalPages) {
      console.log('\n📋 Phase 1: Collecting artwork URLs from all pages...\n');
      
      // Process pages in batches
      for (let pageStart = lastPage; pageStart < totalPages; pageStart += PARALLEL_PAGES) {
        const pageEnd = Math.min(pageStart + PARALLEL_PAGES, totalPages);
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
          links.forEach(link => allUrls.add(link));
        }
        
        lastPage = pageEnd;
        
        // Save progress periodically
        if ((pageEnd % 10 === 0) || pageEnd >= totalPages) {
          saveProgress(processedUrls, artworks, lastPage, totalPages, allUrls);
          console.log(`\n📊 Progress: Pages ${pageEnd}/${totalPages}, URLs collected: ${allUrls.size}\n`);
        }
      }
      
      console.log(`\n✅ Collected ${allUrls.size} unique artwork URLs\n`);
    }
    
    // Phase 2: Scrape artwork details
    console.log('📋 Phase 2: Scraping artwork details...\n');
    
    const urlArray = [...allUrls].filter(u => !processedUrls.has(u));
    console.log(`🔍 New URLs to process: ${urlArray.length}`);
    
    if (urlArray.length === 0) {
      console.log('✅ All URLs already processed!');
    } else {
      let processed = 0;
      const total = urlArray.length;
      const startTime = Date.now();
      
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
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
          const rate = (processed / (elapsed || 1)).toFixed(1);
          console.log(`📊 ${processed}/${total} (${pct}%) | ${artworks.length} artworks | ${rate}/s | ${elapsed}s`);
        }
        
        // Save periodically
        if (processed % SAVE_INTERVAL === 0) {
          saveProgress(processedUrls, artworks, totalPages, totalPages, allUrls);
        }
      }
    }
    
    // Final save
    saveProgress(processedUrls, artworks, totalPages, totalPages, allUrls);
    saveFinalOutput(artworks);
    
    console.log('\n🎉 Scraping complete!');
    console.log(`📊 Total artworks: ${artworks.length}`);
    console.log(`📁 Progress file: ${PROGRESS_FILE}`);
    console.log(`📁 Output file: ${OUTPUT_FILE}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    saveProgress(processedUrls, artworks, lastPage, totalPages, allUrls);
    console.log('💾 Progress saved on error');
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
