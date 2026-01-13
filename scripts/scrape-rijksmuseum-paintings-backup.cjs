/**
 * Rijksmuseum Painting Collection Scraper
 * 
 * 전략:
 * 1. 웹사이트 검색 페이지에서 painting 목록 수집 (페이지네이션)
 * 2. 각 작품 상세 페이지 방문하여 메타데이터 및 onDisplay 상태 수집
 * 3. 모든 메타데이터 포함하여 JSON 저장
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.rijksmuseum.nl';
const SEARCH_URL = `${BASE_URL}/en/collection/search?collectionSearchContext=Art&sortingType=Popularity&onlyWithImages=true&facets[0].id=3159edbfc6b22de59dfb2522fecc2706&facets[0].nodeRelationType=HasObjectType`;

const OUTPUT_FILE = path.join(__dirname, '../public/data/rijksmuseum-paintings-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/rijksmuseum-paintings-progress.json');
const LOG_FILE = path.join(__dirname, '../downloads/rijksmuseum-paintings-log.txt');

// Rate limiting
const DELAY_BETWEEN_PAGES = 2000; // 2초
const DELAY_BETWEEN_ARTWORKS = 500; // 0.5초

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

// 작품 목록 페이지에서 링크 수집
async function collectArtworkLinks(page, startPage = 1) {
  log('📋 작품 링크 수집 시작...');
  const artworkLinks = [];
  const processedUrls = new Set();
  let currentPage = startPage;
  let hasMorePages = true;
  
  while (hasMorePages) {
    const pageUrl = `${SEARCH_URL}&page=${currentPage}`;
    log(`페이지 ${currentPage} 로드 중...`);
    
    try {
      await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 60000 });
      await sleep(2000);
      
      // 작품 링크 추출
      const links = await page.evaluate(() => {
        const links = [];
        // 작품 카드에서 링크 추출
        const cards = document.querySelectorAll('a[href*="/en/collection/"]');
        cards.forEach(card => {
          const href = card.getAttribute('href');
          if (href && href.includes('/en/collection/') && !href.includes('/search')) {
            const fullUrl = href.startsWith('http') ? href : `https://www.rijksmuseum.nl${href}`;
            links.push(fullUrl);
          }
        });
        return [...new Set(links)]; // 중복 제거
      });
      
      log(`페이지 ${currentPage}: ${links.length}개 링크 발견`);
      
      // 새로운 링크 추가
      let newLinks = 0;
      for (const link of links) {
        if (!processedUrls.has(link)) {
          artworkLinks.push(link);
          processedUrls.add(link);
          newLinks++;
        }
      }
      
      log(`페이지 ${currentPage}: ${newLinks}개 새 링크 추가 (총: ${artworkLinks.length}개)`);
      
      // 다음 페이지 확인
      const hasNext = await page.evaluate((currentPageNum) => {
        // 다음 페이지 링크 확인
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
        
        // 다음 버튼 텍스트로 확인
        const nextButtons = Array.from(document.querySelectorAll('a, button'));
        for (const btn of nextButtons) {
          const text = btn.textContent?.trim().toLowerCase();
          if (text === 'next' && btn.getAttribute('href')) {
            return true;
          }
        }
        
        return false;
      }, currentPage);
      
      if (!hasNext || links.length === 0) {
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
    await sleep(1000);
    
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
        metadata: {}
      };
      
      // URL에서 object number 추출 (예: /en/collection/SK-C-5)
      const urlMatch = pageUrl.match(/\/collection\/([^/?]+)/);
      if (urlMatch) {
        result.objectNumber = urlMatch[1];
        result.id = urlMatch[1];
      }
      
      // 제목
      const titleEl = document.querySelector('h1, .artwork-title, [class*="title"]');
      if (titleEl) {
        result.title = titleEl.textContent?.trim() || '';
      }
      
      // 메타데이터 테이블/리스트에서 정보 추출
      const extractMetadata = () => {
        const metadata = {};
        
        // 다양한 선택자로 메타데이터 찾기
        const selectors = [
          'dl dt', 'dl dd',
          '.metadata dt', '.metadata dd',
          '[class*="metadata"] dt', '[class*="metadata"] dd',
          'table th', 'table td',
          '.detail-info dt', '.detail-info dd'
        ];
        
        const labels = document.querySelectorAll('dt, th, [class*="label"]');
        labels.forEach(label => {
          const labelText = label.textContent?.trim().toLowerCase();
          const valueEl = label.nextElementSibling || 
                         label.parentElement?.querySelector('dd, td, [class*="value"]');
          if (valueEl) {
            const value = valueEl.textContent?.trim() || '';
            if (value) {
              metadata[labelText] = value;
            }
          }
        });
        
        return metadata;
      };
      
      const metadata = extractMetadata();
      result.metadata = metadata;
      
      // Artist/Creator
      const artistKeys = ['artist', 'creator', 'maker', 'by', 'schilder', 'kunstenaar'];
      for (const key of artistKeys) {
        if (metadata[key]) {
          result.artist = metadata[key];
          break;
        }
      }
      if (!result.artist) {
        const artistEl = document.querySelector('[class*="artist"], [class*="creator"], [class*="maker"]');
        if (artistEl) {
          result.artist = artistEl.textContent?.trim() || '';
        }
      }
      
      // Date/Year
      const dateKeys = ['date', 'year', 'period', 'dated', 'datering'];
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
      const mediumKeys = ['medium', 'material', 'technique', 'materiaal', 'techniek'];
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
          result.dimensions = metadata[key];
          break;
        }
      }
      
      // On Display 상태 확인
      const pageText = document.body.textContent.toLowerCase();
      if (pageText.includes('on display') || 
          pageText.includes('te zien') || 
          pageText.includes('currently on display') ||
          pageText.includes('nu te zien')) {
        result.onDisplay = true;
        
        // Display location 찾기
        const locationMatch = pageText.match(/(?:room|zaal|gallery|galerij)\s+([^.,\n]+)/i);
        if (locationMatch) {
          result.displayLocation = locationMatch[1].trim();
        }
      }
      
      // 클래스 이름으로도 확인
      const displayElements = document.querySelectorAll('[class*="on-display"], [class*="display"]');
      if (displayElements.length > 0) {
        result.onDisplay = true;
      }
      
      // 이미지
      const imageSelectors = [
        'img[src*="rijksmuseum"], img[src*="collection"]',
        '.artwork-image img',
        '[class*="artwork"] img',
        'meta[property="og:image"]'
      ];
      
      for (const selector of imageSelectors) {
        const img = document.querySelector(selector);
        if (img) {
          const src = img.getAttribute('src') || img.getAttribute('content');
          if (src && !src.includes('placeholder') && !src.includes('logo')) {
            result.thumbnailUrl = src.startsWith('http') ? src : `https://www.rijksmuseum.nl${src}`;
            result.imageUrl = result.thumbnailUrl; // 고해상도 이미지 URL은 나중에 처리
            break;
          }
        }
      }
      
      // 설명
      const descEl = document.querySelector('.description, [class*="description"], .artwork-description');
      if (descEl) {
        result.description = descEl.textContent?.trim() || '';
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
  log('🎨 Rijksmuseum Painting Collection Scraper 시작');
  log('='.repeat(60));
  
  // 진행 상황 로드
  let progress = loadProgress();
  const processedUrls = new Set(progress.processedUrls || []);
  let artworks = progress.artworks || [];
  
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    // 1단계: 작품 링크 수집 (이미 수집했다면 건너뛰기)
    let artworkLinks = [];
    if (progress.allLinks && progress.allLinks.length > 0) {
      log('📋 저장된 링크 사용');
      artworkLinks = progress.allLinks;
    } else {
      artworkLinks = await collectArtworkLinks(page, progress.lastPage);
      progress.allLinks = artworkLinks;
      progress.lastPage = 1;
      saveProgress(progress);
    }
    
    log(`\n📊 총 ${artworkLinks.length}개 작품 처리 시작`);
    
    // 2단계: 각 작품 상세 정보 수집
    const startIndex = artworks.length;
    for (let i = startIndex; i < artworkLinks.length; i++) {
      const url = artworkLinks[i];
      
      if (processedUrls.has(url)) {
        log(`⏭️  ${i + 1}/${artworkLinks.length} 이미 처리됨: ${url}`);
        continue;
      }
      
      process.stdout.write(`\r📄 ${i + 1}/${artworkLinks.length} 처리 중...`);
      
      const artwork = await scrapeArtworkDetail(page, url);
      if (artwork) {
        artworks.push(artwork);
        processedUrls.add(url);
      }
      
      // 진행 상황 저장 (매 10개마다)
      if ((i + 1) % 10 === 0) {
        progress.artworks = artworks;
        progress.processedUrls = Array.from(processedUrls);
        saveProgress(progress);
        process.stdout.write(' 💾');
      }
      
      await sleep(DELAY_BETWEEN_ARTWORKS);
    }
    
    log('\n✅ 모든 작품 수집 완료');
    
    // 최종 저장
    const output = {
      museum: 'Rijksmuseum',
      collection: 'Paintings',
      website: BASE_URL,
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
