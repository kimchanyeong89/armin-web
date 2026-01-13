/**
 * Stedelijk Museum Amsterdam Collection Scraper V2
 * 이미지 URL 추출 개선
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.stedelijk.nl';
const COLLECTION_URL = `${BASE_URL}/en/dig-deeper/collection-online?highlights=1&images=1`;

const OUTPUT_FILE = path.join(__dirname, '../public/data/stedelijk-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/stedelijk-progress.json');
const LOG_FILE = path.join(__dirname, '../downloads/stedelijk-log.txt');

const TEST_LIMIT = 10000; // 전체 수집
const DELAY_BETWEEN_PAGES = 2000;
const DELAY_BETWEEN_ARTWORKS = 500;

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
  let noChangeCount = 0;
  
  while (hasMorePages && artworkLinks.length < TEST_LIMIT) {
    log(`페이지 ${currentPage} 처리 중... (현재 ${artworkLinks.length}개 링크)`);
    
    try {
      // URL 파라미터로 페이지 이동
      const pageUrl = currentPage === 1 ? COLLECTION_URL : `${COLLECTION_URL}&page=${currentPage}`;
      await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 60000 });
      await sleep(3000);
      
      // 현재 페이지에서 링크 추출
      const links = await page.evaluate((baseUrl) => {
        const links = [];
        const cards = document.querySelectorAll('a[href*="/collection/"]');
        cards.forEach(card => {
          const href = card.getAttribute('href');
          if (href && href.includes('/collection/') && !href.includes('collection-online') && !href.includes('#')) {
            const fullUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;
            links.push(fullUrl);
          }
        });
        return [...new Set(links)];
      }, BASE_URL);
      
      log(`페이지 ${currentPage}: ${links.length}개 링크 발견`);
      
      const previousCount = artworkLinks.length;
      for (const link of links) {
        if (!processedUrls.has(link) && artworkLinks.length < TEST_LIMIT) {
          artworkLinks.push(link);
          processedUrls.add(link);
        }
      }
      
      // 링크 개수가 증가하지 않으면 종료
      if (artworkLinks.length === previousCount) {
        noChangeCount++;
        if (noChangeCount >= 2) {
          log(`페이지 ${currentPage}: 새로운 링크 없음, 수집 종료`);
          hasMorePages = false;
        }
      } else {
        noChangeCount = 0;
      }
      
      // 다음 페이지로 이동
      if (hasMorePages && artworkLinks.length < TEST_LIMIT && links.length > 0) {
        currentPage++;
        await sleep(DELAY_BETWEEN_PAGES);
      } else {
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
    await sleep(2000);
    
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
      const idMatch = currentUrl.match(/\/collection\/([^/?]+)/);
      if (idMatch) {
        artwork.id = idMatch[1];
      }
      
      // 제목
      const h1 = document.querySelector('h1');
      if (h1) artwork.title = h1.textContent.trim();
      
      // 이미지 URL - HTML에서 adlib 경로의 실제 작품 이미지 찾기
      const html = document.documentElement.innerHTML;
      // adlib 경로에 있는 실제 작품 이미지 패턴
      const adlibPattern = /https:\/\/s3-eu-west-1\.amazonaws\.com\/production-static-stedelijk\/images\/adlib[^"'\s]+\.(?:jpg|png|jpeg)/gi;
      const matches = html.match(adlibPattern);
      
      if (matches) {
        // 가장 큰 해상도 이미지 찾기 (scaled가 없는 것 우선)
        const unscaled = matches.find(m => !m.includes('/scaled/'));
        const scaled1024 = matches.find(m => m.includes('/1024/') || m.includes('/1440/'));
        artwork.imageUrl = unscaled || scaled1024 || matches[0];
      }
      
      // 텍스트에서 아티스트 추출 ("MAKERS" 섹션 또는 h1 다음)
      const text = document.body.innerText;
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      
      // "MAKERS" 섹션 찾기
      const makersIndex = lines.findIndex(l => l.includes('MAKERS') || l.includes('MAKER'));
      if (makersIndex >= 0 && makersIndex < lines.length - 1) {
        const artistLine = lines[makersIndex + 1];
        if (artistLine && artistLine.length > 2 && artistLine.length < 100) {
          artwork.artist = artistLine;
        }
      }
      
      // 폴백: h1 다음 줄 (대문자로 된 아티스트 이름)
      if (!artwork.artist) {
        const h1Index = lines.findIndex(l => l === artwork.title);
        if (h1Index >= 0 && h1Index < lines.length - 1) {
          const nextLine = lines[h1Index + 1];
          if (nextLine && nextLine.length > 2 && nextLine.length < 100 && 
              !nextLine.match(/^\d{4}/) && !nextLine.toLowerCase().includes('download') &&
              !nextLine.includes('MAKERS') && !nextLine.includes('TRANSLATED')) {
            artwork.artist = nextLine;
          }
        }
      }
      
      // 년도 추출
      const yearMatch = text.match(/\b(1[5-9]\d{2}|20\d{2})\b/);
      if (yearMatch) {
        artwork.year = parseInt(yearMatch[0], 10);
        artwork.date = yearMatch[0];
      }
      
      // MATERIAL (medium) 추출
      const materialIndex = lines.findIndex(l => l === 'MATERIAL' || l.includes('MATERIAL'));
      if (materialIndex >= 0 && materialIndex < lines.length - 1) {
        artwork.medium = lines[materialIndex + 1];
      }
      
      // DIMENSIONS 추출
      const dimensionsIndex = lines.findIndex(l => l === 'DIMENSIONS' || l.includes('DIMENSIONS'));
      if (dimensionsIndex >= 0 && dimensionsIndex < lines.length - 1) {
        artwork.dimensions = lines[dimensionsIndex + 1];
      }
      
      // COLLECTION (category) 추출
      const collectionIndex = lines.findIndex(l => l === 'COLLECTION' || l.includes('COLLECTION'));
      if (collectionIndex >= 0 && collectionIndex < lines.length - 1) {
        const category = lines[collectionIndex + 1];
        artwork.category = category;
        artwork.artworkType = category; // category와 artworkType 동일하게 설정
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
  log('  🏛️  Stedelijk Museum Amsterdam Collection Scraper V2');
  log('═══════════════════════════════════════════════════════════════');
  log(`  테스트 모드: ${TEST_LIMIT}개 작품`);
  log(`  시작 시간: ${new Date().toLocaleString()}`);
  log('───────────────────────────────────────────────────────────────');
  
  const progress = loadProgress();
  const processedUrls = new Set(progress.processedUrls || []);
  
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
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
      
      if (artwork && artwork.title && artwork.imageUrl) {
        artworks.push(artwork);
        processedUrls.add(link);
        log(`  ✅ ${artwork.title} - ${artwork.artist || 'Unknown'}`);
      } else {
        errors.push(link);
        log(`  ❌ 실패 (이미지 없음 또는 제목 없음)`);
      }
      
      if ((i + 1) % 10 === 0) {
        const currentProgress = {
          artworks: [...(progress.artworks || []), ...artworks],
          processedUrls: Array.from(processedUrls)
        };
        saveProgress(currentProgress);
      }
      
      await sleep(DELAY_BETWEEN_ARTWORKS);
    }
    
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
