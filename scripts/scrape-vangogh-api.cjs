/**
 * Van Gogh Museum Collection Scraper - API Based
 * /en/collection/search API를 사용하여 5000개 이상 전체 수집
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE_URL = 'https://www.vangoghmuseum.nl';
// Type 파라미터: painting,drawing,sketch,advertisement,illustration,poster
const TYPE_FILTER = 'Type=painting%2Cdrawing%2Csketch%2Cadvertisement%2Cillustration%2Cposter';
const SEARCH_API = `${BASE_URL}/en/collection/search?q=&${TYPE_FILTER}&from=`;

const OUTPUT_FILE = path.join(__dirname, '../public/data/vangogh-museum-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/vangogh-museum-progress.json');
const LOG_FILE = path.join(__dirname, '../downloads/vangogh-museum-log.txt');

const BATCH_SIZE = 24; // API가 24개씩 반환
const DELAY_BETWEEN_API_CALLS = 1000;
const DELAY_BETWEEN_ARTWORKS = 800;
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

// HTTP GET 요청
function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function loadProgress() {
  let existingArtworks = [];
  let processedUrls = new Set();
  let allLinks = [];
  
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
        log(`📥 저장된 링크: ${allLinks.length}개`);
      }
    } catch (e) {
      log('⚠️ 진행 상황 파일 읽기 실패');
    }
  }
  
  return { artworks: existingArtworks, processedUrls, allLinks };
}

function saveProgress(progress) {
  const toSave = {
    ...progress,
    processedUrls: Array.from(progress.processedUrls || [])
  };
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(toSave, null, 2));
}

// API로 링크 수집
async function collectLinksFromAPI() {
  log('📋 API로 링크 수집 시작...');
  const allLinks = new Set();
  let from = 0;
  let noNewLinksCount = 0;
  const maxNoNewLinks = 10;
  
  while (noNewLinksCount < maxNoNewLinks) {
    try {
      const url = `${SEARCH_API}${from}`;
      const html = await httpGet(url);
      
      // 링크 추출
      const linkMatches = html.match(/\/en\/collection\/[a-zA-Z0-9]+/g) || [];
      const uniqueLinks = [...new Set(linkMatches)];
      
      const previousSize = allLinks.size;
      uniqueLinks.forEach(link => {
        const fullUrl = `${BASE_URL}${link}`;
        allLinks.add(fullUrl);
      });
      
      const newLinks = allLinks.size - previousSize;
      
      if (from % 240 === 0) {
        log(`  API from=${from}: ${uniqueLinks.length}개 링크 (총 ${allLinks.size}개, 새 ${newLinks}개)`);
      }
      
      if (newLinks === 0) {
        noNewLinksCount++;
      } else {
        noNewLinksCount = 0;
      }
      
      from += BATCH_SIZE;
      
      // 100개마다 중간 저장
      if (from % 240 === 0) {
        const tempLinks = Array.from(allLinks);
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ allLinks: tempLinks }, null, 2));
        log(`💾 중간 저장: ${tempLinks.length}개 링크`);
      }
      
      await sleep(DELAY_BETWEEN_API_CALLS);
      
    } catch (error) {
      log(`❌ API 오류 (from=${from}): ${error.message}`);
      await sleep(3000);
      noNewLinksCount++;
    }
  }
  
  const links = Array.from(allLinks);
  log(`✅ 총 ${links.length}개 링크 수집 완료`);
  return links;
}

// 작품 상세 페이지 스크래핑
async function scrapeArtwork(page, url, retryCount = 0) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    
    try {
      await page.waitForSelector('h1', { timeout: 8000 });
    } catch (e) {}
    
    await sleep(1000);
    
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
        l.toLowerCase().includes('ink') ||
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
          if (['painting', 'drawing', 'sculpture', 'print', 'photograph', 'applied arts', 'documentary'].includes(lowerLine) ||
              lowerLine.includes('picture') || lowerLine.includes('genre') || lowerLine.includes('still life') ||
              lowerLine.includes('portrait') || lowerLine.includes('landscape') || lowerLine.includes('interior')) {
            if (!artwork.category) artwork.category = line;
            if (!artwork.artworkType && ['painting', 'drawing', 'sculpture', 'print'].includes(lowerLine)) {
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
      await sleep(2000);
      return scrapeArtwork(page, url, retryCount + 1);
    }
    return null;
  }
}

async function main() {
  log('═══════════════════════════════════════════════════════════════');
  log('  🏛️  Van Gogh Museum Collection Scraper - API Based');
  log('  📋 Search API로 5000개 이상 전체 수집');
  log('═══════════════════════════════════════════════════════════════');
  log(`  시작 시간: ${new Date().toLocaleString()}`);
  log('───────────────────────────────────────────────────────────────');
  
  const progress = loadProgress();
  const processedUrls = progress.processedUrls;
  let allArtworks = progress.artworks || [];
  let allLinks = progress.allLinks || [];
  
  // 1단계: API로 링크 수집
  if (allLinks.length < 5000) {
    allLinks = await collectLinksFromAPI();
    
    const linkProgress = {
      allLinks: allLinks,
      artworks: allArtworks,
      processedUrls: Array.from(processedUrls)
    };
    saveProgress(linkProgress);
    log(`💾 ${allLinks.length}개 링크 저장 완료`);
  }
  
  // 2단계: 작품 상세 정보 수집
  log(`\n📦 ${allLinks.length}개 작품 상세 정보 수집 시작... (${allArtworks.length}개 이미 완료)\n`);
  
  let browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  let context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  let page = await context.newPage();
  
  try {
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
          processedUrls.add(link);
          consecutiveErrors++;
        }
      } catch (error) {
        errors.push(link);
        consecutiveErrors++;
        
        if (error.message.includes('browser') || error.message.includes('Target') || error.message.includes('context')) {
          log(`  🔄 브라우저 재시작 중...`);
          try { await browser.close(); } catch (e) {}
          await sleep(5000);
          browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
          context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            viewport: { width: 1920, height: 1080 }
          });
          page = await context.newPage();
          consecutiveErrors = 0;
        }
      }
      
      if (consecutiveErrors >= 10) {
        log(`  🔄 연속 오류, 브라우저 재시작...`);
        try { await browser.close(); } catch (e) {}
        await sleep(10000);
        browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
        context = await browser.newContext({
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          viewport: { width: 1920, height: 1080 }
        });
        page = await context.newPage();
        consecutiveErrors = 0;
      }
      
      // 매 작품마다 progress 저장
      saveProgress({
        allLinks: allLinks,
        artworks: allArtworks,
        processedUrls: Array.from(processedUrls),
        errors: errors.length
      });
      
      if (allArtworks.length % 100 === 0 && allArtworks.length > 0) {
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify({ items: allArtworks }, null, 2));
        log(`💾 ${allArtworks.length}개 작품 저장 완료`);
      }
      
      await sleep(DELAY_BETWEEN_ARTWORKS);
    }
    
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
    
    try {
      saveProgress({
        allLinks: allLinks,
        artworks: allArtworks,
        processedUrls: Array.from(processedUrls)
      });
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify({ items: allArtworks }, null, 2));
    } catch (e) {}
    
    try { await browser.close(); } catch (e) {}
  }
}

main().catch(console.error);
