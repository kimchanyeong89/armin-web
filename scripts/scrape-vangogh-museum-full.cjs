/**
 * Van Gogh Museum Collection Scraper - FULL VERSION
 * 카테고리별로 수집하여 5000개 이상 전체 수집
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.vangoghmuseum.nl';

// 카테고리별 URL (각 카테고리 약 500~2000개)
const CATEGORIES = [
  { name: 'painting', url: `${BASE_URL}/en/collection?q=&f.objectType=painting` },
  { name: 'drawing', url: `${BASE_URL}/en/collection?q=&f.objectType=drawing` },
  { name: 'print', url: `${BASE_URL}/en/collection?q=&f.objectType=print` },
  { name: 'photograph', url: `${BASE_URL}/en/collection?q=&f.objectType=photograph` },
  { name: 'sculpture', url: `${BASE_URL}/en/collection?q=&f.objectType=sculpture` },
  { name: 'applied-arts', url: `${BASE_URL}/en/collection?q=&f.objectType=applied%20arts` },
  { name: 'documentary', url: `${BASE_URL}/en/collection?q=&f.objectType=documentary` },
];

const OUTPUT_FILE = path.join(__dirname, '../public/data/vangogh-museum-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/vangogh-museum-progress.json');
const LOG_FILE = path.join(__dirname, '../downloads/vangogh-museum-log.txt');

const DELAY_BETWEEN_ARTWORKS = 1500; // 더 긴 대기
const MAX_RETRIES = 2;

// 디렉토리 생성
const OUTPUT_DIR = path.dirname(OUTPUT_FILE);
const DOWNLOADS_DIR = path.dirname(PROGRESS_FILE);
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

function log(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loadProgress() {
  let existingArtworks = [];
  let processedUrls = new Set();
  let allLinks = [];
  let completedCategories = [];
  
  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      const existingData = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
      if (existingData.items && Array.isArray(existingData.items)) {
        existingArtworks = existingData.items;
        existingArtworks.forEach(art => {
          if (art.url) processedUrls.add(art.url);
        });
        log(`📥 기존 데이터 로드: ${existingArtworks.length}개 작품`);
      }
    } catch (e) {
      log('⚠️ 기존 출력 파일 읽기 실패');
    }
  }
  
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      const progressData = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
      if (progressData.processedUrls && Array.isArray(progressData.processedUrls)) {
        progressData.processedUrls.forEach(url => processedUrls.add(url));
      }
      if (progressData.allLinks && Array.isArray(progressData.allLinks)) {
        allLinks = progressData.allLinks;
      }
      if (progressData.completedCategories && Array.isArray(progressData.completedCategories)) {
        completedCategories = progressData.completedCategories;
      }
    } catch (e) {
      log('⚠️ 진행 상황 파일 읽기 실패');
    }
  }
  
  return { artworks: existingArtworks, processedUrls, allLinks, completedCategories };
}

function saveProgress(progress) {
  const toSave = {
    ...progress,
    processedUrls: Array.from(progress.processedUrls || [])
  };
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(toSave, null, 2));
}

// 카테고리별 링크 수집
async function collectLinksFromCategory(page, categoryUrl, categoryName) {
  log(`📋 [${categoryName}] 링크 수집 시작...`);
  const collectedUrls = new Set();
  
  try {
    await page.goto(categoryUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await sleep(5000);
    
    await page.waitForSelector('a[href*="/en/collection/"]', { timeout: 30000 });
    
    let previousCount = 0;
    let noNewLinksCount = 0;
    let totalScrolls = 0;
    const maxNoNewLinksCount = 30;
    const maxScrolls = 500;
    
    while (totalScrolls < maxScrolls) {
      totalScrolls++;
      
      const links = await page.evaluate(() => {
        const links = [];
        const cards = document.querySelectorAll('a[href*="/en/collection/"]');
        cards.forEach(card => {
          const href = card.getAttribute('href');
          if (href && href.includes('/en/collection/') && 
              !href.includes('/search') && !href.includes('?') && 
              !href.includes('/highlights') && href.length > 20) {
            const fullUrl = href.startsWith('http') ? href : `https://www.vangoghmuseum.nl${href}`;
            links.push(fullUrl);
          }
        });
        return [...new Set(links)];
      });
      
      links.forEach(link => collectedUrls.add(link));
      
      if (totalScrolls % 20 === 0) {
        log(`  [${categoryName}] 스크롤 ${totalScrolls}: ${collectedUrls.size}개 링크`);
      }
      
      if (collectedUrls.size === previousCount) {
        noNewLinksCount++;
        if (noNewLinksCount >= maxNoNewLinksCount) {
          log(`  [${categoryName}] ${noNewLinksCount}번 연속 새 링크 없음, 완료`);
          break;
        }
      } else {
        noNewLinksCount = 0;
      }
      
      previousCount = collectedUrls.size;
      
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await sleep(2000 + Math.random() * 1000);
    }
    
  } catch (error) {
    log(`❌ [${categoryName}] 링크 수집 오류: ${error.message}`);
  }
  
  log(`✅ [${categoryName}] ${collectedUrls.size}개 링크 수집 완료`);
  return Array.from(collectedUrls);
}

// 작품 상세 페이지 스크래핑
async function scrapeArtwork(page, url, retryCount = 0) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    try {
      await page.waitForSelector('h1', { timeout: 10000 });
    } catch (e) {
      try {
        await page.waitForSelector('title', { timeout: 5000 });
      } catch (e2) {}
    }
    
    await sleep(1500);
    
    const artwork = await page.evaluate(({ baseUrl, currentUrl }) => {
      const artwork = {
        id: '',
        title: '',
        artist: '',
        year: null,
        date: '',
        medium: '',
        dimensions: '',
        description: '',
        imageUrl: '',
        category: '',
        artworkType: '',
        url: currentUrl
      };
      
      const idMatch = currentUrl.match(/\/collection\/([^/?]+)/);
      if (idMatch) artwork.id = idMatch[1];
      
      const h1 = document.querySelector('h1');
      if (h1) artwork.title = h1.textContent.trim();
      
      if (!artwork.title) {
        const titleTag = document.querySelector('title');
        if (titleTag) {
          const titleText = titleTag.textContent.trim();
          const titleMatch = titleText.match(/^(.+?)\s*[-–]\s*Van Gogh/i);
          if (titleMatch) artwork.title = titleMatch[1].trim();
          else artwork.title = titleText.replace(/\s*[-–]\s*Van Gogh.*$/i, '').trim();
        }
      }
      
      const text = document.body.innerText;
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      
      const artistLine = lines.find(l => 
        (l.includes('Vincent') && l.includes('van Gogh')) ||
        (l.includes('(') && l.includes(')') && /\(\d{4}/.test(l))
      );
      if (artistLine) {
        const artistMatch = artistLine.match(/^([^(]+?)(?:\s*\(|,|$)/);
        if (artistMatch) artwork.artist = artistMatch[1].trim();
        
        const yearMatch = artistLine.match(/\b(18\d{2}|19\d{2}|20\d{2})\b/);
        if (yearMatch) {
          artwork.year = parseInt(yearMatch[1], 10);
          artwork.date = yearMatch[1];
        }
      }
      
      const mediumLine = lines.find(l => 
        l.toLowerCase().includes('oil') || 
        l.toLowerCase().includes('canvas') || 
        l.toLowerCase().includes('paper') ||
        l.toLowerCase().includes('pencil') ||
        l.toLowerCase().includes('chalk') ||
        (l.includes('cm') && l.includes('x'))
      );
      if (mediumLine) {
        const parts = mediumLine.split(',');
        if (parts.length > 0) artwork.medium = parts[0].trim();
        if (parts.length > 1 && parts[1].includes('cm')) {
          artwork.dimensions = parts.slice(1).join(',').trim();
        } else if (mediumLine.includes('cm')) {
          const dimMatch = mediumLine.match(/([\d\.]+\s*cm\s*x\s*[\d\.]+\s*cm)/i);
          if (dimMatch) {
            artwork.dimensions = dimMatch[1];
            artwork.medium = mediumLine.replace(dimMatch[1], '').replace(/,\s*$/, '').trim();
          }
        }
      }
      
      const descEl = document.querySelector('p, .description, [class*="description"]');
      if (descEl) artwork.description = descEl.textContent.trim().substring(0, 500);
      
      const objectDataIndex = lines.findIndex(l => l.includes('Object data'));
      if (objectDataIndex >= 0) {
        const categoryLines = lines.slice(objectDataIndex + 1, objectDataIndex + 10);
        for (const line of categoryLines) {
          const lowerLine = line.toLowerCase();
          if (lowerLine === 'painting' || lowerLine === 'drawing' || lowerLine === 'sculpture' || 
              lowerLine === 'print' || lowerLine === 'photograph' ||
              lowerLine.includes('picture') || lowerLine.includes('genre') || lowerLine.includes('still life') ||
              lowerLine.includes('portrait') || lowerLine.includes('landscape') || lowerLine.includes('interior')) {
            if (!artwork.category) artwork.category = line;
            if (!artwork.artworkType && (lowerLine === 'painting' || lowerLine === 'drawing' || lowerLine === 'sculpture' || lowerLine === 'print')) {
              artwork.artworkType = line;
            }
          }
        }
        if (!artwork.artworkType && categoryLines.length > 0) {
          const firstType = categoryLines.find(l => l.length > 2 && l.length < 50 && !/^\d{4}/.test(l));
          if (firstType) artwork.artworkType = firstType;
        }
      }
      
      const imgSelectors = [
        'img[src*="iiif"]',
        'img[src*="micr.io"]',
        'picture img',
        '.artwork-image img',
        'main img',
        'article img'
      ];
      for (const selector of imgSelectors) {
        const imgEl = document.querySelector(selector);
        if (imgEl) {
          artwork.imageUrl = imgEl.getAttribute('src') || imgEl.getAttribute('data-src') || '';
          if (artwork.imageUrl && artwork.imageUrl.length > 10) {
            if (!artwork.imageUrl.startsWith('http')) {
              artwork.imageUrl = baseUrl + artwork.imageUrl;
            }
            break;
          }
        }
      }
      
      return artwork;
    }, { baseUrl: BASE_URL, currentUrl: url });
    
    return artwork;
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      log(`  ⚠️ 재시도 ${retryCount + 1}/${MAX_RETRIES}: ${url}`);
      await sleep(3000);
      return scrapeArtwork(page, url, retryCount + 1);
    }
    log(`❌ 작품 스크래핑 오류 (${url}): ${error.message}`);
    return null;
  }
}

async function main() {
  log('═══════════════════════════════════════════════════════════════');
  log('  🏛️  Van Gogh Museum Collection FULL Scraper');
  log('  📋 카테고리별 수집으로 5000개 이상 전체 수집');
  log('═══════════════════════════════════════════════════════════════');
  log(`  시작 시간: ${new Date().toLocaleString()}`);
  log('───────────────────────────────────────────────────────────────');
  
  const progress = loadProgress();
  const processedUrls = progress.processedUrls;
  let allArtworks = progress.artworks || [];
  let allLinks = progress.allLinks || [];
  let completedCategories = progress.completedCategories || [];
  
  let browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  let context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  let page = await context.newPage();
  
  try {
    // 1단계: 각 카테고리에서 링크 수집
    if (allLinks.length < 5000) {
      log('\n📋 1단계: 카테고리별 링크 수집\n');
      
      for (const category of CATEGORIES) {
        if (completedCategories.includes(category.name)) {
          log(`⏭️  [${category.name}] 이미 완료됨, 건너뜀`);
          continue;
        }
        
        const categoryLinks = await collectLinksFromCategory(page, category.url, category.name);
        
        // 중복 제거하고 추가
        categoryLinks.forEach(link => {
          if (!allLinks.includes(link)) {
            allLinks.push(link);
          }
        });
        
        completedCategories.push(category.name);
        
        // 중간 저장
        const linkProgress = {
          allLinks: allLinks,
          artworks: allArtworks,
          processedUrls: Array.from(processedUrls),
          completedCategories: completedCategories
        };
        saveProgress(linkProgress);
        log(`💾 현재 총 ${allLinks.length}개 링크 저장됨`);
        
        await sleep(3000);
      }
      
      log(`\n✅ 모든 카테고리 링크 수집 완료: 총 ${allLinks.length}개 링크\n`);
    } else {
      log(`📥 저장된 링크 사용: ${allLinks.length}개`);
    }
    
    // 2단계: 작품 상세 정보 수집
    log('\n📦 2단계: 작품 상세 정보 수집\n');
    log(`목표: ${allLinks.length}개, 완료: ${allArtworks.length}개\n`);
    
    const errors = [];
    let consecutiveErrors = 0;
    
    for (let i = 0; i < allLinks.length; i++) {
      const link = allLinks[i];
      
      if (processedUrls.has(link)) {
        continue;
      }
      
      log(`[${allArtworks.length + 1}/${allLinks.length}] 스크래핑: ${link}`);
      
      try {
        const artwork = await scrapeArtwork(page, link);
        
        if (artwork && artwork.title) {
          allArtworks.push(artwork);
          processedUrls.add(link);
          log(`  ✅ ${artwork.title}`);
          consecutiveErrors = 0;
        } else {
          errors.push(link);
          log(`  ❌ 실패`);
          consecutiveErrors++;
          processedUrls.add(link);
        }
      } catch (error) {
        log(`  ❌ 오류: ${error.message}`);
        errors.push(link);
        consecutiveErrors++;
        
        if (error.message.includes('browser has been closed') || error.message.includes('Target page')) {
          log(`  🔄 브라우저 재시작 중...`);
          try { await browser.close(); } catch (e) {}
          await sleep(10000);
          browser = await chromium.launch({ 
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
          });
          context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport: { width: 1920, height: 1080 }
          });
          page = await context.newPage();
          log(`  ✅ 브라우저 재시작 완료`);
          consecutiveErrors = 0;
        }
      }
      
      if (consecutiveErrors >= 10) {
        log(`  🔄 연속 오류 ${consecutiveErrors}번, 브라우저 재시작 중...`);
        try { await browser.close(); } catch (e) {}
        await sleep(15000);
        browser = await chromium.launch({ 
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });
        context = await browser.newContext({
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          viewport: { width: 1920, height: 1080 }
        });
        page = await context.newPage();
        log(`  ✅ 브라우저 재시작 완료`);
        consecutiveErrors = 0;
      }
      
      // 매 작품마다 progress 저장
      const currentProgress = {
        allLinks: allLinks,
        artworks: allArtworks,
        processedUrls: Array.from(processedUrls),
        completedCategories: completedCategories,
        errors: errors.length
      };
      saveProgress(currentProgress);
      
      // 100개마다 출력 파일 저장
      if (allArtworks.length % 100 === 0 && allArtworks.length > 0) {
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify({ items: allArtworks }, null, 2));
        log(`💾 ${allArtworks.length}개 작품 저장 완료`);
      }
      
      await sleep(DELAY_BETWEEN_ARTWORKS);
    }
    
    // 최종 저장
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify({ items: allArtworks }, null, 2));
    
    log('\n═══════════════════════════════════════════════════════════════');
    log('  ✅ 스크래핑 완료');
    log('═══════════════════════════════════════════════════════════════');
    log(`  총 수집: ${allArtworks.length}개 작품`);
    log(`  오류: ${errors.length}개`);
    log(`  완료 시간: ${new Date().toLocaleString()}`);
    
    await browser.close();
    
  } catch (error) {
    log(`\n❌ 치명적 오류: ${error.message}`);
    log(error.stack);
    
    try {
      const errorProgress = {
        allLinks: allLinks,
        artworks: allArtworks,
        processedUrls: Array.from(processedUrls),
        completedCategories: completedCategories,
        error: error.message
      };
      saveProgress(errorProgress);
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify({ items: allArtworks }, null, 2));
      log(`💾 오류 발생 시 progress 저장 완료`);
    } catch (saveError) {
      log(`❌ Progress 저장 실패: ${saveError.message}`);
    }
    
    try { await browser.close(); } catch (e) {}
  }
}

main().catch(console.error);
