/**
 * Stedelijk Museum Amsterdam Collection Scraper
 * 스크래핑: https://www.stedelijk.nl/en/dig-deeper/collection-online?highlights=1&images=1
 * 테스트: 100개 작품 수집
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.stedelijk.nl';
const COLLECTION_URL = `${BASE_URL}/en/dig-deeper/collection-online?highlights=1&images=1`;

const OUTPUT_FILE = path.join(__dirname, '../public/data/stedelijk-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/stedelijk-progress.json');
const LOG_FILE = path.join(__dirname, '../downloads/stedelijk-log.txt');

const TEST_LIMIT = 100; // 테스트: 100개
const DELAY_BETWEEN_PAGES = 2000;
const DELAY_BETWEEN_ARTWORKS = 500;

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
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
      log(`📥 진행 상황 로드: ${data.artworks?.length || 0}개 작품`);
      return data;
    } catch (e) {
      log('⚠️ 진행 상황 파일 읽기 실패, 새로 시작');
    }
  }
  return { artworks: [], processedUrls: new Set() };
}

function saveProgress(progress) {
  const toSave = {
    ...progress,
    processedUrls: Array.from(progress.processedUrls || [])
  };
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(toSave, null, 2));
}

// 작품 목록 페이지에서 링크 수집
async function collectArtworkLinks(page) {
  log('📋 작품 링크 수집 시작...');
  const artworkLinks = [];
  const processedUrls = new Set();
  let currentPage = 1;
  let hasMorePages = true;
  
  await page.goto(COLLECTION_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await sleep(3000);
  
  while (hasMorePages && artworkLinks.length < TEST_LIMIT) {
    log(`페이지 ${currentPage} 처리 중... (현재 ${artworkLinks.length}개 링크)`);
    
    try {
      // 작품 링크 추출
      const links = await page.evaluate((baseUrl) => {
        const links = [];
        // 작품 카드에서 링크 추출
        const cards = document.querySelectorAll('a[href*="/collection/"], a[href*="/artwork/"]');
        cards.forEach(card => {
          const href = card.getAttribute('href');
          if (href && (href.includes('/collection/') || href.includes('/artwork/')) && !href.includes('#')) {
            const fullUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;
            links.push(fullUrl);
          }
        });
        return [...new Set(links)];
      }, BASE_URL);
      
      log(`페이지 ${currentPage}: ${links.length}개 링크 발견`);
      
      // 새로운 링크 추가
      for (const link of links) {
        if (!processedUrls.has(link) && artworkLinks.length < TEST_LIMIT) {
          artworkLinks.push(link);
          processedUrls.add(link);
        }
      }
      
      // 다음 페이지 확인
      const hasMore = await page.evaluate(() => {
        const nextBtn = document.querySelector('a[aria-label="Next"], .pagination-next, a.next, button.next');
        return nextBtn && nextBtn.offsetParent !== null && nextBtn.getAttribute('aria-disabled') !== 'true';
      });
      
      if (hasMore && artworkLinks.length < TEST_LIMIT) {
        await page.evaluate(() => {
          const nextBtn = document.querySelector('a[aria-label="Next"], .pagination-next, a.next, button.next');
          if (nextBtn) nextBtn.click();
        });
        await sleep(DELAY_BETWEEN_PAGES);
        currentPage++;
      } else {
        hasMorePages = false;
      }
      
      if (artworkLinks.length >= TEST_LIMIT) {
        hasMorePages = false;
      }
      
    } catch (error) {
      log(`❌ 페이지 ${currentPage} 오류: ${error.message}`);
      hasMorePages = false;
    }
  }
  
  log(`✅ 총 ${artworkLinks.length}개 링크 수집 완료`);
  return artworkLinks.slice(0, TEST_LIMIT);
}

// 작품 상세 페이지에서 메타데이터 추출
async function scrapeArtwork(page, url) {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
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
        artworkType: '',
        url: currentUrl
      };
      
      // ID 추출
      const idMatch = currentUrl.match(/\/([^/]+)$/);
      if (idMatch) {
        artwork.id = idMatch[1];
      }
      
      // 제목
      const titleEl = document.querySelector('h1, .artwork-title, [data-testid="artwork-title"], .collection-detail-title');
      if (titleEl) artwork.title = titleEl.textContent.trim();
      
      // 아티스트
      const artistEl = document.querySelector('.artist-name, [data-testid="artist-name"], .creator, .collection-detail-artist, a[href*="/artist/"]');
      if (artistEl) artwork.artist = artistEl.textContent.trim();
      
      // 날짜/년도
      const dateEl = document.querySelector('.artwork-date, [data-testid="artwork-date"], .date, .collection-detail-date');
      if (dateEl) {
        artwork.date = dateEl.textContent.trim();
        const yearMatch = artwork.date.match(/\b(1[5-9]\d{2}|20\d{2})\b/);
        if (yearMatch) artwork.year = parseInt(yearMatch[0], 10);
      }
      
      // 매체/타입
      const mediumEl = document.querySelector('.artwork-medium, [data-testid="artwork-medium"], .medium, .technique, .collection-detail-medium');
      if (mediumEl) artwork.medium = mediumEl.textContent.trim();
      
      // 작품 타입
      const typeEl = document.querySelector('.artwork-type, .type, .category');
      if (typeEl) artwork.artworkType = typeEl.textContent.trim();
      
      // 크기
      const dimensionsEl = document.querySelector('.artwork-dimensions, [data-testid="artwork-dimensions"], .dimensions, .size, .collection-detail-dimensions');
      if (dimensionsEl) artwork.dimensions = dimensionsEl.textContent.trim();
      
      // 설명
      const descEl = document.querySelector('.artwork-description, [data-testid="artwork-description"], .description, .artwork-text, .collection-detail-description');
      if (descEl) artwork.description = descEl.textContent.trim();
      
      // 이미지 URL
      const imgEl = document.querySelector('.artwork-image img, [data-testid="artwork-image"] img, .detail-image img, picture img, .collection-detail-image img');
      if (imgEl) {
        artwork.imageUrl = imgEl.getAttribute('src') || imgEl.getAttribute('data-src') || '';
        if (artwork.imageUrl && !artwork.imageUrl.startsWith('http')) {
          artwork.imageUrl = baseUrl + artwork.imageUrl;
        }
      }
      
      return artwork;
    }, { baseUrl: BASE_URL, currentUrl: url });
    
    return artwork;
  } catch (error) {
    log(`❌ 작품 스크래핑 오류 (${url}): ${error.message}`);
    return null;
  }
}

async function main() {
  log('═══════════════════════════════════════════════════════════════');
  log('  🏛️  Stedelijk Museum Amsterdam Collection Scraper');
  log('═══════════════════════════════════════════════════════════════');
  log(`  테스트 모드: ${TEST_LIMIT}개 작품`);
  log(`  시작 시간: ${new Date().toLocaleString()}`);
  log('───────────────────────────────────────────────────────────────');
  
  const progress = loadProgress();
  const processedUrls = new Set(progress.processedUrls || []);
  
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    // 작품 링크 수집
    const artworkLinks = await collectArtworkLinks(page);
    log(`\n📦 ${artworkLinks.length}개 작품 상세 정보 수집 시작...\n`);
    
    const artworks = [];
    const errors = [];
    
    for (let i = 0; i < artworkLinks.length; i++) {
      const link = artworkLinks[i];
      
      if (processedUrls.has(link)) {
        log(`⏭️  이미 처리됨: ${link}`);
        continue;
      }
      
      log(`[${i + 1}/${artworkLinks.length}] 스크래핑: ${link}`);
      const artwork = await scrapeArtwork(page, link);
      
      if (artwork && artwork.title) {
        artworks.push(artwork);
        processedUrls.add(link);
        log(`  ✅ ${artwork.title} - ${artwork.artist || 'Unknown'}`);
      } else {
        errors.push(link);
        log(`  ❌ 실패`);
      }
      
      // 진행 상황 저장
      if ((i + 1) % 10 === 0) {
        const currentProgress = {
          artworks: [...(progress.artworks || []), ...artworks],
          processedUrls: Array.from(processedUrls)
        };
        saveProgress(currentProgress);
      }
      
      await sleep(DELAY_BETWEEN_ARTWORKS);
    }
    
    // 최종 저장
    const allArtworks = [...(progress.artworks || []), ...artworks];
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify({ items: allArtworks }, null, 2));
    
    const finalProgress = {
      artworks: allArtworks,
      processedUrls: Array.from(processedUrls),
      totalScraped: allArtworks.length,
      errors: errors.length
    };
    saveProgress(finalProgress);
    
    log('\n═══════════════════════════════════════════════════════════════');
    log('  ✅ 스크래핑 완료');
    log('═══════════════════════════════════════════════════════════════');
    log(`  총 수집: ${allArtworks.length}개 작품`);
    log(`  오류: ${errors.length}개`);
    log(`  출력 파일: ${OUTPUT_FILE}`);
    log(`  완료 시간: ${new Date().toLocaleString()}`);
    
  } catch (error) {
    log(`\n❌ 치명적 오류: ${error.message}`);
    log(error.stack);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
