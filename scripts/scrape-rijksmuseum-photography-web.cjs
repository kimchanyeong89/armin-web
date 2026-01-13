/**
 * Rijksmuseum Photography Collection Scraper V2 (Web Scraping)
 * 
 * 전략:
 * 1. 웹사이트 검색 페이지에서 photography 목록 수집 (올바른 URL만 필터링)
 * 2. 각 작품 상세 페이지 방문하여 메타데이터 및 onDisplay 상태 수집
 * 3. 모든 메타데이터 포함하여 JSON 저장
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.rijksmuseum.nl';
const SEARCH_URL = `${BASE_URL}/en/collection/search?collectionSearchContext=Art&sortingType=Popularity&onlyWithImages=true&facets[0].id=8e3331ec82020c8bd7583aa971f33ca0&facets[0].nodeRelationType=HasObjectType`;

const OUTPUT_FILE = path.join(__dirname, '../public/data/rijksmuseum-photography-web-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/rijksmuseum-photography-web-progress.json');
const LOG_FILE = path.join(__dirname, '../downloads/rijksmuseum-photography-web-log.txt');

// Rate limiting
const DELAY_BETWEEN_PAGES = 2000;
const DELAY_BETWEEN_ARTWORKS = 800;

// 테스트 제한 (100개만)
const TEST_LIMIT = 100;

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
      log(`📥 진행 상황 로드: ${data.artworks?.length || 0}개 작품, 마지막 페이지: ${data.lastPage || 1}`);
      return data;
    } catch (e) {
      log('⚠️ 진행 상황 파일 읽기 실패, 새로 시작');
    }
  }
  return { artworks: [], processedUrls: [], lastPage: 1 };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

// 작품 목록 페이지에서 링크 수집 (올바른 URL만 필터링)
async function collectArtworkLinks(page, startPage = 1) {
  log('📋 작품 링크 수집 시작...');
  const artworkLinks = [];
  const processedUrls = new Set();
  let currentPage = startPage;
  let hasMorePages = true;
  
  // 제외할 URL 패턴
  const excludePatterns = [
    '/discover',
    '/art-explorer',
    '/search',
    '/node/',
    '/collection/painting',
    '/collection/art',
    '/collection/explore'
  ];
  
  while (hasMorePages && artworkLinks.length < TEST_LIMIT) {
    const pageUrl = `${SEARCH_URL}&page=${currentPage}`;
    log(`페이지 ${currentPage} 로드 중...`);
    
    try {
      await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 60000 });
      await sleep(2000);
      
      // 작품 링크 추출 (올바른 형식만)
      const links = await page.evaluate(() => {
        const links = [];
        const seen = new Set();
        
        // 작품 카드 링크 찾기
        const cards = document.querySelectorAll('a[href*="/en/collection/"]');
        cards.forEach(card => {
          const href = card.getAttribute('href');
          if (!href) return;
          
          // /en/collection/object/... 형식만 (실제 작품 페이지)
          // 또는 /en/collection/SK-C-5 형식 (object number)
          const isArtworkUrl = href.match(/\/en\/collection\/(object\/[^/?]+|SK-[A-Z0-9-]+|RP-[A-Z0-9-]+)/);
          
          if (isArtworkUrl && !seen.has(href)) {
            const fullUrl = href.startsWith('http') ? href : `https://www.rijksmuseum.nl${href}`;
            links.push(fullUrl);
            seen.add(href);
          }
        });
        
        return links;
      });
      
      log(`페이지 ${currentPage}: ${links.length}개 링크 발견`);
      
      // 필터링: 제외 패턴 확인
      const filteredLinks = links.filter(url => {
        return !excludePatterns.some(pattern => url.includes(pattern));
      });
      
      log(`페이지 ${currentPage}: 필터링 후 ${filteredLinks.length}개 링크`);
      
      // 새로운 링크 추가
      let newLinks = 0;
      for (const link of filteredLinks) {
        if (!processedUrls.has(link) && artworkLinks.length < TEST_LIMIT) {
          artworkLinks.push(link);
          processedUrls.add(link);
          newLinks++;
        }
      }
      
      log(`페이지 ${currentPage}: ${newLinks}개 새 링크 추가 (총: ${artworkLinks.length}개)`);
      
      // TEST_LIMIT에 도달했는지 확인
      if (artworkLinks.length >= TEST_LIMIT) {
        log(`✅ 테스트 제한 도달: ${TEST_LIMIT}개 링크 수집 완료`);
        break;
      }
      
      // 다음 페이지 확인
      const hasNext = await page.evaluate((currentPageNum) => {
        const allLinks = Array.from(document.querySelectorAll('a[href*="page="]'));
        for (const link of allLinks) {
          const href = link.getAttribute('href');
          const pageMatch = href.match(/page=(\d+)/);
          if (pageMatch) {
            const pageNum = parseInt(pageMatch[1], 10);
            if (pageNum > currentPageNum) {
              return true;
            }
          }
        }
        
        const nextButtons = Array.from(document.querySelectorAll('a, button'));
        for (const btn of nextButtons) {
          const text = btn.textContent?.trim().toLowerCase();
          if ((text === 'next' || text.includes('volgende')) && btn.getAttribute('href')) {
            return true;
          }
        }
        
        return false;
      }, currentPage);
      
      if (!hasNext || filteredLinks.length === 0) {
        log('더 이상 페이지 없음');
        hasMorePages = false;
      } else {
        currentPage++;
        await sleep(DELAY_BETWEEN_PAGES);
      }
      
    } catch (error) {
      log(`⚠️ 페이지 ${currentPage} 오류: ${error.message}`);
      hasMorePages = false;
    }
  }
  
  log(`✅ 총 ${artworkLinks.length}개 작품 링크 수집 완료`);
  return artworkLinks;
}

// 작품 상세 페이지에서 메타데이터 추출
async function scrapeArtworkDetail(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(1500);
    
    const artwork = await page.evaluate((pageUrl) => {
      const result = {
        id: '',
        objectNumber: '',
        title: '',
        artist: '',
        date: '',
        year: null,
        medium: '',
        materials: [],
        dimensions: '',
        description: '',
        imageUrl: '',
        thumbnailUrl: '',
        onDisplay: false,
        displayLocation: '',
        sourceUrl: pageUrl,
        category: '',
        metadata: {}
      };
      
      // URL에서 object number 추출
      const urlMatch = pageUrl.match(/\/collection\/(?:object\/)?([^/?]+)/);
      if (urlMatch) {
        result.objectNumber = urlMatch[1];
        result.id = urlMatch[1].replace(/--[a-f0-9]+$/, ''); // 해시 제거
      }
      
      // 제목 - h1 태그
      const h1 = document.querySelector('h1');
      if (h1) {
        result.title = h1.textContent?.trim() || '';
      }
      
      // 메타데이터 섹션에서 정보 추출
      // Rijksmuseum는 보통 dt/dd 또는 특정 클래스를 사용
      const metadata = {};
      const metadataElements = document.querySelectorAll('dt, [class*="label"], [class*="metadata"] dt, th');
      
      metadataElements.forEach(labelEl => {
        const labelText = labelEl.textContent?.trim().toLowerCase();
        const valueEl = labelEl.nextElementSibling || 
                       labelEl.parentElement?.querySelector('dd, td, [class*="value"]');
        if (valueEl) {
          const value = valueEl.textContent?.trim() || '';
          if (value) {
            metadata[labelText] = value;
          }
        }
      });
      
      result.metadata = metadata;
      
      // Artist/Creator
      const artistKeys = ['made by', 'artist', 'creator', 'maker', 'kunstenaar', 'schilder'];
      for (const key of artistKeys) {
        if (metadata[key]) {
          result.artist = metadata[key];
          break;
        }
      }
      
      // 페이지 텍스트에서도 artist 찾기
      if (!result.artist) {
        const artistPattern = /(?:made by|artist|creator):\s*([^\n,]+)/i;
        const bodyText = document.body.textContent;
        const artistMatch = bodyText.match(artistPattern);
        if (artistMatch) {
          result.artist = artistMatch[1].trim();
        }
      }
      
      // Date/Year
      const dateKeys = ['dated', 'date', 'year', 'period', 'datering'];
      for (const key of dateKeys) {
        if (metadata[key]) {
          result.date = metadata[key];
          const yearMatch = metadata[key].match(/\b(\d{4})\b/);
          if (yearMatch) {
            result.year = parseInt(yearMatch[1], 10);
          }
          break;
        }
      }
      
      // Medium/Material/Technique
      const mediumKeys = ['material', 'technique', 'medium', 'materiaal', 'techniek'];
      for (const key of mediumKeys) {
        if (metadata[key]) {
          result.medium = metadata[key];
          break;
        }
      }
      
      // Dimensions
      const dimensionKeys = ['dimensions', 'size', 'measurement', 'afmetingen'];
      for (const key of dimensionKeys) {
        if (metadata[key]) {
          // dimensions 값 정리 (너무 긴 경우 자르기)
          let dimValue = metadata[key];
          // 첫 200자만 사용 (너무 긴 텍스트 제거)
          if (dimValue.length > 200) {
            dimValue = dimValue.substring(0, 200).trim();
          }
          result.dimensions = dimValue;
          break;
        }
      }
      
      // Category/Object Type
      // Rijksmuseum는 "is type of work" 키를 사용
      const categoryKeys = ['is type of work', 'object type', 'type', 'categorie', 'soort', 'category'];
      for (const key of categoryKeys) {
        if (metadata[key]) {
          // category 값 정리 (첫 줄이나 첫 부분만 사용)
          let catValue = metadata[key];
          // 첫 번째 줄이나 첫 50자만 사용
          const firstLine = catValue.split('\n')[0].trim();
          if (firstLine.length > 0 && firstLine.length <= 100) {
            result.category = firstLine;
          } else if (catValue.length <= 100) {
            result.category = catValue.trim();
          } else {
            result.category = catValue.substring(0, 100).trim();
          }
          break;
        }
      }
      
      // On Display 상태 확인
      const pageText = document.body.textContent.toLowerCase();
      const displayIndicators = [
        'on display',
        'te zien',
        'currently on display',
        'nu te zien',
        'on view'
      ];
      
      if (displayIndicators.some(indicator => pageText.includes(indicator))) {
        result.onDisplay = true;
        
        // Display location 찾기 (예: "Gallery of Honour", "Room 2.1")
        const locationMatches = [
          pageText.match(/(?:gallery of|room|zaal|galerij)\s+([^.,\n]+)/i),
          pageText.match(/(?:on display in|te zien in)\s+([^.,\n]+)/i)
        ];
        
        for (const match of locationMatches) {
          if (match && match[1]) {
            result.displayLocation = match[1].trim();
            break;
          }
        }
      }
      
      // 이미지 추출
      const imageSelectors = [
        'img[src*="rijksmuseum"][src*="assets"]',
        '.artwork-image img',
        '[class*="artwork"] img[src*="assets"]',
        'meta[property="og:image"]',
        'img[src*="micr.io"]'
      ];
      
      for (const selector of imageSelectors) {
        const img = document.querySelector(selector);
        if (img) {
          const src = img.getAttribute('src') || img.getAttribute('content');
          if (src && !src.includes('placeholder') && !src.includes('logo')) {
            if (src.includes('micr.io')) {
              // IIIF Micrio 이미지
              result.imageUrl = src;
              result.thumbnailUrl = src.replace('/full/max/', '/full/400,/');
            } else if (src.includes('assets')) {
              result.thumbnailUrl = src.startsWith('http') ? src : `https://www.rijksmuseum.nl${src}`;
              // 고해상도 이미지 URL 생성 (파라미터 조정)
              result.imageUrl = result.thumbnailUrl.replace(/[?&]w=\d+/, '&w=1200').replace(/[?&]h=\d+/, '&h=1200');
            }
            if (result.imageUrl) break;
          }
        }
      }
      
      // 설명
      const descSelectors = [
        '.description',
        '[class*="description"]',
        '.artwork-description',
        'meta[name="description"]'
      ];
      
      for (const selector of descSelectors) {
        const descEl = document.querySelector(selector);
        if (descEl) {
          const desc = descEl.textContent?.trim() || descEl.getAttribute('content') || '';
          if (desc && desc.length > 20) {
            result.description = desc.substring(0, 1000);
            break;
          }
        }
      }
      
      return result;
    }, url);
    
    return artwork;
    
  } catch (error) {
    log(`⚠️ 작품 상세 페이지 오류 (${url}): ${error.message}`);
    return null;
  }
}

async function main() {
  log('📷 Rijksmuseum Photography Collection Scraper V2 (Web) - 테스트 100개');
  log('='.repeat(60));

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    let progress = loadProgress();
    const processedUrls = new Set(progress.processedUrls || []);
    let artworks = progress.artworks || [];
    
    // 1단계: 작품 링크 수집
    const artworkLinks = await collectArtworkLinks(page, progress.lastPage || 1);
    
    // 2단계: 각 작품 상세 페이지에서 메타데이터 수집
    log(`\n📊 총 ${artworkLinks.length}개 작품 처리 시작`);
    log(`🧪 테스트 모드: ${TEST_LIMIT}개만 처리`);
    
    for (let i = 0; i < artworkLinks.length; i++) {
      const url = artworkLinks[i];
      
      if (processedUrls.has(url)) {
        log(`⏭️ 이미 처리됨: ${i + 1}/${artworkLinks.length} - ${url}`);
        continue;
      }
      
      log(`📄 ${i + 1}/${artworkLinks.length} 처리 중: ${url}`);
      
      const artwork = await scrapeArtworkDetail(page, url);
      
      if (artwork) {
        artworks.push(artwork);
        processedUrls.add(url);
        
        // 진행 상황 저장 (매 10개마다)
        if ((i + 1) % 10 === 0) {
          progress.artworks = artworks;
          progress.processedUrls = Array.from(processedUrls);
          progress.lastPage = Math.ceil((i + 1) / 20); // 대략적인 페이지 번호
          saveProgress(progress);
          log(`💾 진행 상황 저장: ${artworks.length}개 작품`);
        }
      }
      
      await sleep(DELAY_BETWEEN_ARTWORKS);
    }
    
    log('\n✅ 모든 작품 수집 완료');
    
    // 최종 저장
    const output = {
      museum: 'Rijksmuseum',
      collection: 'Photography (Web Scraping)',
      website: 'https://www.rijksmuseum.nl',
      scraped_date: new Date().toISOString(),
      total_count: artworks.length,
      artworks: artworks
    };
    
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    log(`💾 최종 파일 저장: ${OUTPUT_FILE}`);
    log(`📊 총 ${artworks.length}개 작품 수집 완료`);
    
  } catch (error) {
    log(`❌ 오류 발생: ${error.message}`);
    console.error(error);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
