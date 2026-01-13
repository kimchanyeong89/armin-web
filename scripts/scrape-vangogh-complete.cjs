/**
 * Van Gogh Museum Collection Scraper - Complete Version
 * 모든 방법을 동원하여 1796개 전체 수집
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE_URL = 'https://www.vangoghmuseum.nl';
const TYPE_FILTER = 'Type=painting%2Cdrawing%2Csketch%2Cadvertisement%2Cillustration%2Cposter';
const COLLECTION_URL = `${BASE_URL}/en/collection?q=&${TYPE_FILTER}`;
const SEARCH_API = `${BASE_URL}/en/collection/search?q=&${TYPE_FILTER}&from=`;

const OUTPUT_FILE = path.join(__dirname, '../public/data/vangogh-museum-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/vangogh-museum-progress.json');
const LOG_FILE = path.join(__dirname, '../downloads/vangogh-museum-log.txt');

const TARGET_COUNT = 1796;
const BATCH_SIZE = 24;
const DELAY_BETWEEN_API_CALLS = 800;
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

// 방법 1: API로 세밀하게 탐색 (빈 구간 우회)
async function collectLinksFromAPIDetailed(allLinksSet) {
  log('📋 방법 1: API 세밀 탐색 시작...');
  
  // 1299개 이후부터 세밀하게 탐색
  const startFrom = 1680;
  const endFrom = 1800; // 1796개 목표를 위해
  
  log(`  ${startFrom}-${endFrom} 범위 탐색 중...`);
  // 작은 단위로 탐색
  for (let from = startFrom; from <= endFrom; from += 1) {
    try {
      const url = `${SEARCH_API}${from}`;
      const html = await httpGet(url);
      const linkMatches = html.match(/\/en\/collection\/[a-zA-Z0-9]+/g) || [];
      const uniqueLinks = [...new Set(linkMatches)];
      
      const previousSize = allLinksSet.size;
      uniqueLinks.forEach(link => {
        const fullUrl = `${BASE_URL}${link}`;
        allLinksSet.add(fullUrl);
      });
      
      if (allLinksSet.size > previousSize) {
        log(`  ✅ from=${from}: ${uniqueLinks.length}개 링크 발견 (총 ${allLinksSet.size}개)`);
      }
      
      if (from % 10 === 0) {
        log(`  진행: from=${from}, 현재 ${allLinksSet.size}개 링크`);
      }
      
      await sleep(300);
      
    } catch (error) {
      log(`  ⚠️ from=${from} 오류: ${error.message}`);
    }
  }
  
  log(`✅ API 세밀 탐색 완료: ${allLinksSet.size}개 링크`);
}

// 방법 2: 웹페이지 무한 스크롤
async function collectLinksFromScroll(page, allLinksSet) {
  log('📋 방법 2: 웹페이지 무한 스크롤 시작...');
  
  try {
    await page.goto(COLLECTION_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await sleep(5000);
    
    await page.waitForSelector('a[href*="/en/collection/"]', { timeout: 30000 });
    
    let previousCount = allLinksSet.size;
    let noChangeCount = 0;
    let scrollCount = 0;
    const maxScrolls = 200;
    const maxNoChange = 30;
    
    while (scrollCount < maxScrolls && allLinksSet.size < TARGET_COUNT) {
      scrollCount++;
      
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
      
      links.forEach(link => allLinksSet.add(link));
      
      if (allLinksSet.size === previousCount) {
        noChangeCount++;
        if (noChangeCount >= maxNoChange) {
          log(`  ✅ ${noChangeCount}번 연속 변화 없음, 종료`);
          break;
        }
      } else {
        noChangeCount = 0;
      }
      
      previousCount = allLinksSet.size;
      
      if (scrollCount % 20 === 0) {
        log(`  스크롤 ${scrollCount}: ${allLinksSet.size}개 링크`);
      }
      
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await sleep(2000 + Math.random() * 1000);
    }
    
  } catch (error) {
    log(`❌ 스크롤 오류: ${error.message}`);
  }
  
  log(`✅ 스크롤 완료: ${allLinksSet.size}개 링크`);
}

// 방법 3: 높은 from 값들 시도
async function collectLinksFromHighRanges(allLinksSet) {
  log('📋 방법 3: 높은 from 범위 탐색 시작...');
  
  // 1700-2000 범위를 세밀하게
  const ranges = [
    { start: 1700, end: 1750, step: 1 },
    { start: 1750, end: 1800, step: 1 },
    { start: 1800, end: 1900, step: 1 },
    { start: 1900, end: 2000, step: 1 }
  ];
  
  for (const range of ranges) {
    log(`  범위 ${range.start}-${range.end} 탐색 중...`);
    for (let from = range.start; from < range.end; from += range.step) {
      try {
        const url = `${SEARCH_API}${from}`;
        const html = await httpGet(url);
        const linkMatches = html.match(/\/en\/collection\/[a-zA-Z0-9]+/g) || [];
        const uniqueLinks = [...new Set(linkMatches)];
        
        const previousSize = allLinksSet.size;
        uniqueLinks.forEach(link => {
          const fullUrl = `${BASE_URL}${link}`;
          allLinksSet.add(fullUrl);
        });
        
        if (allLinksSet.size > previousSize) {
          log(`  ✅ from=${from}: ${uniqueLinks.length}개 링크 발견 (총 ${allLinksSet.size}개)`);
        }
        
        if (from % 10 === 0) {
          log(`  진행: from=${from}, 현재 ${allLinksSet.size}개`);
        }
        
        await sleep(300);
        
      } catch (error) {
        log(`  ⚠️ from=${from} 오류: ${error.message}`);
      }
    }
  }
  
  log(`✅ 높은 범위 탐색 완료: ${allLinksSet.size}개 링크`);
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
          if (['painting', 'drawing', 'sculpture', 'print', 'photograph', 'applied arts', 'documentary', 'sketch', 'advertisement', 'illustration', 'poster'].includes(lowerLine) ||
              lowerLine.includes('picture') || lowerLine.includes('genre') || lowerLine.includes('still life') ||
              lowerLine.includes('portrait') || lowerLine.includes('landscape') || lowerLine.includes('interior')) {
            if (!artwork.category) artwork.category = line;
            if (!artwork.artworkType && ['painting', 'drawing', 'sculpture', 'print', 'sketch'].includes(lowerLine)) {
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
  log('  🏛️  Van Gogh Museum Collection Scraper - Complete Version');
  log('  📋 모든 방법을 동원하여 1796개 전체 수집');
  log('═══════════════════════════════════════════════════════════════');
  log(`  시작 시간: ${new Date().toLocaleString()}`);
  log('───────────────────────────────────────────────────────────────');
  
  const progress = loadProgress();
  const processedUrls = progress.processedUrls;
  let allArtworks = progress.artworks || [];
  let allLinks = new Set(progress.allLinks || []);
  
  log(`📥 기존 링크: ${allLinks.size}개`);
  
  // 1단계: 모든 방법으로 링크 수집
  if (allLinks.size < TARGET_COUNT) {
    log('\n📋 1단계: 모든 방법으로 링크 수집\n');
    
    // 방법 2: 웹페이지 무한 스크롤 (가장 효과적, 먼저 시도)
    log('🔄 웹페이지 스크롤부터 시작...');
    let browser = await chromium.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    let context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 }
    });
    let page = await context.newPage();
    
    await collectLinksFromScroll(page, allLinks);
    
    await browser.close();
    
    // 방법 1: 세밀한 API 탐색
    await collectLinksFromAPIDetailed(allLinks);
    
    // 방법 3: 높은 from 범위 탐색
    await collectLinksFromHighRanges(allLinks);
    
    const linksArray = Array.from(allLinks);
    log(`\n✅ 모든 방법으로 수집 완료: ${linksArray.length}개 링크\n`);
    
    // progress 저장
    saveProgress({
      allLinks: linksArray,
      artworks: allArtworks,
      processedUrls: Array.from(processedUrls)
    });
  } else {
    log(`📥 저장된 링크 사용: ${allLinks.size}개`);
  }
  
  // 2단계: 작품 상세 정보 수집
  const allLinksArray = Array.from(allLinks);
  log(`\n📦 2단계: 작품 상세 정보 수집\n`);
  log(`목표: ${allLinksArray.length}개, 완료: ${allArtworks.length}개\n`);
  
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
    
    for (let i = 0; i < allLinksArray.length; i++) {
      const link = allLinksArray[i];
      
      if (processedUrls.has(link)) {
        continue;
      }
      
      log(`[${allArtworks.length + 1}/${allLinksArray.length}] 스크래핑: ${link}`);
      
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
        allLinks: allLinksArray,
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
        allLinks: allLinksArray,
        artworks: allArtworks,
        processedUrls: Array.from(processedUrls)
      });
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify({ items: allArtworks }, null, 2));
    } catch (e) {}
    
    try { await browser.close(); } catch (e) {}
  }
}

main().catch(console.error);
