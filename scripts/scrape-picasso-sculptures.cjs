/**
 * Musée Picasso Paris - Sculptures & Objects Collection Scraper
 * 
 * 피카소 미술관 파리 - 조각/오브젝트 컬렉션 스크래핑
 * 3D 작품들 (sculptures + objets)
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Configuration
const BASE_URL = 'https://cep.museepicassoparis.fr';
const SEARCH_URL = 'https://cep.museepicassoparis.fr/explorer?text=&field_domaine%5Bsculptures%5D=sculptures&field_domaine%5Bobjets%5D=objets&sort-image=1';
const PROGRESS_DIR = path.join(__dirname, '../downloads/picasso-paris');
const OUTPUT_DIR = path.join(__dirname, '../downloads/picasso-paris');
const PROGRESS_FILE = path.join(PROGRESS_DIR, 'sculptures-progress.json');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'picasso-sculptures-collection.json');
const COLLECTION_NAME = 'Sculptures & Objects Collection';
const DOMAIN = 'Sculptures';
const DEFAULT_MEDIUM = 'Sculpture';

// Scraping settings - adjusted for proper page rendering
const PARALLEL_PAGES = 3;
const PARALLEL_DETAILS = 4;
const PAGE_DELAY = 1000;
const DETAIL_DELAY = 2000;
const SAVE_INTERVAL = 30;
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

async function getTotalPages(page) {
  try {
    await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1000);
    
    const totalInfo = await page.evaluate(() => {
      const text = document.body.innerText;
      const match = text.match(/(\d+)\s*résultats?/i);
      const totalResults = match ? parseInt(match[1]) : 0;
      
      const paginationLinks = document.querySelectorAll('a[href*="page="]');
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
    return totalInfo.maxPage + 1;
    
  } catch (e) {
    console.error('Error getting total pages:', e.message);
    return 50;
  }
}

async function scrapeListPage(page, pageNum) {
  const url = `${SEARCH_URL}&page=${pageNum}`;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(PAGE_DELAY);
    
    const links = await page.evaluate(() => {
      const results = [];
      const anchors = document.querySelectorAll('a[href*="/explorer/"]');
      anchors.forEach(a => {
        const href = a.href;
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

async function scrapeDetail(browser, detailUrl, retries = MAX_RETRIES) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  
  try {
    await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(DETAIL_DELAY);
    
    const data = await page.evaluate((defaultMedium, domain) => {
      // Title
      let title = '';
      const titleDiv = document.querySelector('.node__content__title .title');
      if (titleDiv) {
        title = titleDiv.textContent?.trim() || '';
      }
      if (!title) {
        const pageTitle = document.querySelector('title');
        if (pageTitle) {
          title = pageTitle.textContent?.trim() || '';
        }
      }
      if (!title) {
        const ogTitle = document.querySelector('meta[property="og:title"]');
        if (ogTitle) {
          title = ogTitle.getAttribute('content') || '';
        }
      }
      
      // Image
      let image = '';
      const imgSelectors = [
        'img[src*="image_liste_visionneuse"]',
        'img[src*="/sites/default/files/"]',
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
      
      // Metadata
      const metadata = {};
      document.querySelectorAll('.notice-table__item').forEach(item => {
        const label = item.querySelector('.notice-table__item__title')?.textContent?.trim();
        const value = item.querySelector('.notice-table__item__content')?.textContent?.trim();
        if (label && value) {
          metadata[label] = value;
        }
      });
      
      const pageText = document.body.innerText;
      
      let artist = metadata['Auteur(s)'] || '';
      if (!artist) {
        const authorLink = document.querySelector('a[href*="/personne/pablo-picasso"]');
        if (authorLink) artist = authorLink.textContent?.trim() || 'Pablo Picasso';
      }
      
      let date = metadata['Date'] || '';
      if (!date) {
        const dateMatch = pageText.match(/Date\s+([^\n]+)/);
        if (dateMatch) date = dateMatch[1].trim();
      }
      
      let inventoryNumber = metadata['Numéro d\'inventaire'] || '';
      if (!inventoryNumber) {
        const invMatch = pageText.match(/(?:MP\d+[^\s]*)/i);
        if (invMatch) inventoryNumber = invMatch[0];
      }
      
      const medium = metadata['Type de support'] || metadata['Technique'] || metadata['Matériaux'] || defaultMedium;
      const dimensions = metadata['Dimensions'] || '';
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
        domain
      };
    }, DEFAULT_MEDIUM, DOMAIN);
    
    await context.close();
    
    if (!data.image) return null;
    
    const yearMatch = data.date?.match(/(\d{4})/);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
    
    return {
      id: slugify(data.title || 'untitled') + '-' + Date.now().toString(36),
      title: data.title,
      artist: data.artist,
      year,
      date: data.date,
      inventoryNumber: data.inventoryNumber,
      medium: data.medium,
      dimensions: data.dimensions,
      place: data.place,
      image: data.image,
      domain: data.domain,
      type: '3D',
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

async function main() {
  console.log(`🎨 Musée Picasso Paris - ${COLLECTION_NAME} Scraper`);
  console.log('📍 3D Objects (sculptures + objets)');
  console.log('');
  
  if (!fs.existsSync(PROGRESS_DIR)) fs.mkdirSync(PROGRESS_DIR, { recursive: true });
  
  let { processedUrls, artworks, lastPage, totalPages, allUrls } = loadProgress();
  console.log(`📥 Loaded: ${artworks.length} artworks, ${allUrls.size} URLs, page ${lastPage}`);
  
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--disable-blink-features=AutomationControlled']
  });
  
  try {
    if (totalPages === 0) {
      const ctx = await browser.newContext();
      const pg = await ctx.newPage();
      totalPages = await getTotalPages(pg);
      await ctx.close();
      console.log(`📊 Total pages: ${totalPages}`);
    }
    
    if (allUrls.size === 0 || lastPage < totalPages) {
      console.log('\n📋 Phase 1: Collecting URLs...\n');
      
      for (let pageStart = lastPage; pageStart < totalPages; pageStart += PARALLEL_PAGES) {
        const pageEnd = Math.min(pageStart + PARALLEL_PAGES, totalPages);
        const promises = [];
        
        for (let p = pageStart; p < pageEnd; p++) {
          const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' });
          const pg = await ctx.newPage();
          promises.push({ page: pg, context: ctx, pageNum: p });
        }
        
        const results = await Promise.all(
          promises.map(async ({ page, context, pageNum }) => {
            const links = await scrapeListPage(page, pageNum);
            await context.close();
            return links;
          })
        );
        
        results.forEach(links => links.forEach(link => allUrls.add(link)));
        lastPage = pageEnd;
        
        if (pageEnd % 10 === 0 || pageEnd >= totalPages) {
          saveProgress(processedUrls, artworks, lastPage, totalPages, allUrls);
          console.log(`📊 Pages ${pageEnd}/${totalPages}, URLs: ${allUrls.size}`);
        }
      }
      console.log(`\n✅ Collected ${allUrls.size} URLs\n`);
    }
    
    console.log('📋 Phase 2: Scraping details...\n');
    const urlArray = [...allUrls].filter(u => !processedUrls.has(u));
    console.log(`🔍 URLs to process: ${urlArray.length}`);
    
    if (urlArray.length > 0) {
      let processed = 0;
      const total = urlArray.length;
      const startTime = Date.now();
      
      for (let i = 0; i < urlArray.length; i += PARALLEL_DETAILS) {
        const batch = urlArray.slice(i, i + PARALLEL_DETAILS);
        const results = await Promise.all(batch.map(url => scrapeDetail(browser, url)));
        
        for (let j = 0; j < batch.length; j++) {
          processedUrls.add(batch[j]);
          if (results[j]) artworks.push(results[j]);
          processed++;
        }
        
        if (processed % 20 === 0 || processed === total) {
          const pct = ((processed / total) * 100).toFixed(1);
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
          console.log(`📊 ${processed}/${total} (${pct}%) | ${artworks.length} artworks | ${elapsed}s`);
        }
        
        if (processed % SAVE_INTERVAL === 0) {
          saveProgress(processedUrls, artworks, totalPages, totalPages, allUrls);
        }
      }
    }
    
    saveProgress(processedUrls, artworks, totalPages, totalPages, allUrls);
    saveFinalOutput(artworks);
    
    console.log('\n🎉 Complete!');
    console.log(`📊 Total: ${artworks.length} artworks`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    saveProgress(processedUrls, artworks, lastPage, totalPages, allUrls);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
