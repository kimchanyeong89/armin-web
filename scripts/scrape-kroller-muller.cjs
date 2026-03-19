/**
 * Kröller-Müller Museum Collection Scraper
 * 스크래핑: https://krollermuller.nl/en/search-the-collection
 * 3가지 타입: Schilderijen (Paintings), Film en video, Foto's (Photography)
 * 테스트: 각 타입당 100개 작품 수집
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://krollermuller.nl';
const COLLECTION_BASE_URL = `${BASE_URL}/en/search-the-collection`;

const COLLECTIONS = {
  paintings: {
    name: 'Schilderijen',
    filter: 'Schilderijen',
    url: `${COLLECTION_BASE_URL}/object_type=Schilderijen`,
    outputFile: 'kroller-muller-paintings.json',
    progressFile: 'kroller-muller-paintings-progress.json',
    logFile: 'kroller-muller-paintings-log.txt'
  },
  film: {
    name: 'Film en video',
    filter: 'Film en video',
    url: `${COLLECTION_BASE_URL}/object_type=Film+en+video`,
    outputFile: 'kroller-muller-film-video.json',
    progressFile: 'kroller-muller-film-video-progress.json',
    logFile: 'kroller-muller-film-video-log.txt'
  },
  photography: {
    name: 'Foto\'s',
    filter: 'Foto\'s',
    url: `${COLLECTION_BASE_URL}/object_type=Foto%27s`,
    outputFile: 'kroller-muller-photography.json',
    progressFile: 'kroller-muller-photography-progress.json',
    logFile: 'kroller-muller-photography-log.txt'
  }
};

const TEST_LIMIT = 10000; // 전체 수집
const DELAY_BETWEEN_PAGES = 2000;
const DELAY_BETWEEN_ARTWORKS = 500;

// 디렉토리 생성
const OUTPUT_DIR = path.join(__dirname, '../public/data');
const DOWNLOADS_DIR = path.join(__dirname, '../downloads');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

function log(message, logFile) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}`;
  console.log(line);
  if (logFile) {
    fs.appendFileSync(logFile, line + '\n');
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loadProgress(progressFile, outputFile) {
  let artworks = [];
  let processedUrls = new Set();
  let artworkLinks = [];
  
  // 먼저 출력 파일에서 기존 데이터 로드 (progress 파일이 손실되었을 경우 복구)
  if (fs.existsSync(outputFile)) {
    try {
      const outputData = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
      if (outputData.items && Array.isArray(outputData.items)) {
        artworks = outputData.items;
        // 기존 작품들의 URL을 processedUrls에 추가
        artworks.forEach(art => {
          if (art.url) processedUrls.add(art.url);
        });
      }
    } catch (e) {
      // ignore
    }
  }
  
  // progress 파일이 있으면 우선 사용 (더 최신 정보)
  if (fs.existsSync(progressFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
      if (data.artworks && Array.isArray(data.artworks) && data.artworks.length > 0) {
        artworks = data.artworks;
      }
      if (data.processedUrls && Array.isArray(data.processedUrls)) {
        data.processedUrls.forEach(url => processedUrls.add(url));
      }
      if (data.artworkLinks && Array.isArray(data.artworkLinks)) {
        artworkLinks = data.artworkLinks;
      }
    } catch (e) {
      // ignore
    }
  }
  
  return {
    artworks: artworks,
    artworkLinks: artworkLinks,
    processedUrls: Array.from(processedUrls)
  };
}

function saveProgress(progress, progressFile) {
  const toSave = {
    ...progress,
    processedUrls: Array.from(progress.processedUrls || [])
  };
  fs.writeFileSync(progressFile, JSON.stringify(toSave, null, 2));
}

// 작품 목록 페이지에서 링크 수집
async function collectArtworkLinks(page, collectionUrl, logFile) {
  log('📋 작품 링크 수집 시작...', logFile);
  const artworkLinks = [];
  const processedUrls = new Set();
  let currentPage = 1;
  let hasMorePages = true;
  
  await page.goto(collectionUrl, { waitUntil: 'networkidle', timeout: 60000 });
  await sleep(3000);
  
  let noNewLinksCount = 0;
  const maxNoNewLinksCount = 10; // 연속 10번 새 링크 없으면 종료
  
  while (hasMorePages && artworkLinks.length < TEST_LIMIT) {
    log(`페이지 ${currentPage} 처리 중... (현재 ${artworkLinks.length}개 링크)`, logFile);
    
    try {
      // 작품 링크 추출 (작품 카드 내부 링크만)
      const links = await page.evaluate((baseUrl) => {
        const links = [];
        const excludePatterns = ['search-the-collection', 'object_type', 'opening-hours', 'calendar', 'address', 'accessibility', 'maps', 'audio-tour', 'families', 'tour-operators', 'museum-restaurants', 'national-park', 'tickets', 'visit', 'discover', 'education', 'about', 'support', 'contact', 'press', 'language', 'buy-your-ticket'];
        // 작품 카드 내부의 링크만 추출
        const cards = document.querySelectorAll('.searchresult__item a, .ci-content a, [class*="result-item"] a, article a');
        cards.forEach(card => {
          const href = card.getAttribute('href');
          if (href && href.startsWith('/en/') && href.length > 5 && 
              !excludePatterns.some(pattern => href.includes(pattern)) &&
              !href.includes('#') && href !== '/en/') {
            const fullUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;
            links.push(fullUrl);
          }
        });
        return [...new Set(links)];
      }, BASE_URL);
      
      log(`페이지 ${currentPage}: ${links.length}개 링크 발견`, logFile);
      
      // 새로운 링크 추가
      const previousCount = artworkLinks.length;
      let newLinksAdded = 0;
      for (const link of links) {
        if (!processedUrls.has(link) && artworkLinks.length < TEST_LIMIT) {
          artworkLinks.push(link);
          processedUrls.add(link);
          newLinksAdded++;
        }
      }
      
      // 새 링크가 추가되었는지 확인
      if (newLinksAdded === 0 && previousCount > 0) {
        noNewLinksCount++;
        if (noNewLinksCount >= maxNoNewLinksCount) {
          log(`페이지 ${currentPage}: ${maxNoNewLinksCount}번 연속 새 링크 없음, 수집 종료 (총 ${artworkLinks.length}개)`, logFile);
          hasMorePages = false;
          break;
        }
      } else {
        noNewLinksCount = 0; // 새 링크가 추가되면 카운터 리셋
      }
      
      // 현재 페이지에서 링크가 0개면 한 번 더 시도 (페이지 로딩 문제일 수 있음)
      if (links.length === 0 && currentPage > 1) {
        log(`페이지 ${currentPage}: 링크 0개, 재시도 중...`, logFile);
        await sleep(5000); // 더 긴 대기
        const retryLinks = await page.evaluate((baseUrl) => {
          const links = [];
          const excludePatterns = ['search-the-collection', 'object_type', 'opening-hours', 'calendar', 'address', 'accessibility', 'maps', 'audio-tour', 'families', 'tour-operators', 'museum-restaurants', 'national-park', 'tickets', 'visit', 'discover', 'education', 'about', 'support', 'contact', 'press', 'language', 'buy-your-ticket'];
          const cards = document.querySelectorAll('.searchresult__item a, .ci-content a, [class*="result-item"] a, article a');
          cards.forEach(card => {
            const href = card.getAttribute('href');
            if (href && href.startsWith('/en/') && href.length > 5 && 
                !excludePatterns.some(pattern => href.includes(pattern)) &&
                !href.includes('#') && href !== '/en/') {
              const fullUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;
              links.push(fullUrl);
            }
          });
          return [...new Set(links)];
        }, BASE_URL);
        log(`재시도 후: ${retryLinks.length}개 링크 발견`, logFile);
        if (retryLinks.length === 0) {
          // 재시도해도 0개면 종료
          log(`페이지 ${currentPage}: 재시도 후에도 링크 없음, 수집 종료`, logFile);
          hasMorePages = false;
          break;
        }
      }
      
      // 100개 링크마다 중간 저장
      if (artworkLinks.length > 0 && artworkLinks.length % 100 === 0) {
        log(`💾 중간 저장: ${artworkLinks.length}개 링크`, logFile);
      }
      
      // 다음 페이지 확인
      const hasMore = await page.evaluate(() => {
        const nextBtn = document.querySelector('a[aria-label="Next"], .pagination-next, a.next, button.next, .pagination a[class*="next"]');
        return nextBtn && nextBtn.offsetParent !== null && nextBtn.getAttribute('aria-disabled') !== 'true';
      });
      
      if (hasMore && artworkLinks.length < TEST_LIMIT) {
        await page.evaluate(() => {
          const nextBtn = document.querySelector('a[aria-label="Next"], .pagination-next, a.next, button.next, .pagination a[class*="next"]');
          if (nextBtn) nextBtn.click();
        });
        await sleep(DELAY_BETWEEN_PAGES);
        currentPage++;
      } else {
        // 다음 페이지 버튼이 없거나 비활성화된 경우에만 종료
        if (!hasMore) {
          log(`페이지 ${currentPage}: 다음 페이지 버튼 없음, 수집 종료`, logFile);
        }
        hasMorePages = false;
      }
      
      if (artworkLinks.length >= TEST_LIMIT) {
        hasMorePages = false;
      }
      
    } catch (error) {
      log(`❌ 페이지 ${currentPage} 오류: ${error.message}`, logFile);
      // 오류 발생 시 재시도 (최대 3번)
      const retryCount = (error.retryCount || 0) + 1;
      if (retryCount < 3) {
        log(`⚠️ 재시도 ${retryCount}/3...`, logFile);
        await sleep(3000);
        error.retryCount = retryCount;
        // 페이지 다시 로드 후 계속 진행
        try {
          await page.goto(collectionUrl, { waitUntil: 'networkidle', timeout: 60000 });
          await sleep(3000);
        } catch (e) {
          log(`❌ 페이지 재로드 실패: ${e.message}`, logFile);
          hasMorePages = false;
        }
      } else {
        log(`❌ 재시도 실패, 다음 페이지로 계속 진행`, logFile);
        // 오류가 발생해도 계속 진행
        currentPage++;
        await sleep(DELAY_BETWEEN_PAGES);
      }
    }
  }
  
  log(`✅ 총 ${artworkLinks.length}개 링크 수집 완료`, logFile);
  return artworkLinks.slice(0, TEST_LIMIT);
}

// 작품 상세 페이지에서 메타데이터 추출
async function scrapeArtwork(page, url, logFile) {
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
        genre: '',
        period: '',
        url: currentUrl
      };
      
      // ID 추출
      const idMatch = currentUrl.match(/\/([^/]+)$/);
      if (idMatch) {
        artwork.id = idMatch[1];
      }
      
      // 제목
      const titleEl = document.querySelector('h1');
      if (titleEl) artwork.title = titleEl.textContent.trim();
      
      // 텍스트 기반 추출
      const text = document.body.innerText;
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      
      // 아티스트 추출 - "HENRI FANTIN-LATOUR (1836-1904)" 패턴
      const artistLine = lines.find(l => l.match(/^[A-Z][A-Z\s\-\.]+\s*\(\d{4}[\s\-]+\d{4}\)$/));
      if (artistLine) {
        // "(1836-1904)" 부분 제거하고 아티스트 이름만 추출
        artwork.artist = artistLine.replace(/\s*\(\d{4}[\s\-]+\d{4}\)$/, '').trim();
      } else {
        // 폴백: "ANONIEM" 확인
        const anoniemIndex = lines.findIndex(l => l === 'ANONIEM' || l.includes('ANONIEM'));
        if (anoniemIndex >= 0) {
          artwork.artist = 'Anonymous';
        }
      }
      
      // 매체 ("Oil on canvas" 등)
      const mediumLine = lines.find(l => l.toLowerCase().includes('oil on canvas') || l.toLowerCase().includes('canvas') || l.toLowerCase().includes('on paper') || l.toLowerCase().includes('photograph'));
      if (mediumLine) {
        artwork.medium = mediumLine;
      }
      
      // 크기 ("38,2 × 57,6 cm" 패턴)
      const dimLine = lines.find(l => l.includes('×') && l.includes('cm'));
      if (dimLine) {
        artwork.dimensions = dimLine;
      }
      
      // 작품 타입 ("Paintings" 등)
      const typeLine = lines.find(l => l === 'Paintings' || l === 'Photography' || l === 'Film and video' || l.toLowerCase().includes('painting'));
      if (typeLine) {
        artwork.artworkType = typeLine;
        artwork.category = typeLine;
      }
      
      // 시대 ("19th century" 등)
      const periodLine = lines.find(l => l.includes('century') || l.match(/^\d{1,2}(st|nd|rd|th)\s+century/i));
      if (periodLine) {
        artwork.period = periodLine;
      }
      
      // 년도 (제목에서 "before 1940" 또는 텍스트에서)
      const beforeMatch = artwork.title.match(/before\s+(\d{4})/i);
      if (beforeMatch) {
        artwork.year = parseInt(beforeMatch[1], 10);
        artwork.date = `before ${beforeMatch[1]}`;
      } else {
        const yearMatch = text.match(/\b(1[5-9]\d{2}|20\d{2})\b/);
        if (yearMatch) {
          artwork.year = parseInt(yearMatch[0], 10);
          artwork.date = yearMatch[0];
        }
      }
      
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
    log(`❌ 작품 스크래핑 오류 (${url}): ${error.message}`, logFile);
    return null;
  }
}

async function scrapeCollection(collectionKey) {
  const collection = COLLECTIONS[collectionKey];
  const outputFile = path.join(OUTPUT_DIR, collection.outputFile);
  const progressFile = path.join(DOWNLOADS_DIR, collection.progressFile);
  const logFile = path.join(DOWNLOADS_DIR, collection.logFile);
  
  log('═══════════════════════════════════════════════════════════════', logFile);
  log(`  🏛️  Kröller-Müller Museum - ${collection.name} Scraper`, logFile);
  log('═══════════════════════════════════════════════════════════════', logFile);
  log(`  테스트 모드: ${TEST_LIMIT}개 작품`, logFile);
  log(`  시작 시간: ${new Date().toLocaleString()}`, logFile);
  log('───────────────────────────────────────────────────────────────', logFile);
  
  const progress = loadProgress(progressFile, outputFile);
  const processedUrls = new Set(progress.processedUrls || []);
  let allArtworks = progress.artworks || [];
  let artworkLinks = progress.artworkLinks || [];
  
  log(`📥 진행 상황 로드: ${allArtworks.length}개 작품, ${processedUrls.size}개 URL 처리됨, ${artworkLinks.length}개 링크`, logFile);
  
  let browser = await chromium.launch({ headless: true });
  let page = await browser.newPage();
  
  try {
    // 작품 링크 수집 (이미 수집된 링크가 있으면 재사용)
    if (artworkLinks.length === 0) {
      log('📋 작품 링크 수집 시작...', logFile);
      artworkLinks = await collectArtworkLinks(page, collection.url, logFile);
      // 링크 수집 완료 후 progress 저장
      const linkProgress = {
        artworkLinks: artworkLinks,
        artworks: allArtworks,
        processedUrls: Array.from(processedUrls)
      };
      saveProgress(linkProgress, progressFile);
      log(`💾 ${artworkLinks.length}개 링크 저장 완료`, logFile);
    } else {
      log(`📥 저장된 링크 사용: ${artworkLinks.length}개`, logFile);
    }
    
    log(`\n📦 ${artworkLinks.length}개 작품 상세 정보 수집 시작... (${allArtworks.length}개 이미 완료)\n`, logFile);
    
    const errors = [];
    
    for (let i = 0; i < artworkLinks.length; i++) {
      const link = artworkLinks[i];
      
      if (processedUrls.has(link)) {
        continue;
      }
      
      log(`[${allArtworks.length + 1}/${artworkLinks.length}] 스크래핑: ${link}`, logFile);
      
      try {
        const artwork = await scrapeArtwork(page, link, logFile);
        
        if (artwork && artwork.title) {
          allArtworks.push(artwork);
          processedUrls.add(link);
          log(`  ✅ ${artwork.title} - ${artwork.artist || 'Unknown'}`, logFile);
        } else {
          errors.push(link);
          log(`  ❌ 실패`, logFile);
        }
      } catch (error) {
        log(`  ❌ 스크래핑 오류: ${error.message}`, logFile);
        errors.push(link);
        
        // 브라우저가 닫힌 경우 재시작
        if (error.message.includes('browser has been closed') || error.message.includes('Target page') || error.message.includes('context')) {
          log(`  🔄 브라우저 크래시 감지, 재시작 중...`, logFile);
          try {
            await browser.close();
          } catch (e) {}
          await sleep(3000);
          
          const newBrowser = await chromium.launch({ headless: true });
          const newPage = await newBrowser.newPage();
          browser = newBrowser;
          page = newPage;
          log(`  ✅ 브라우저 재시작 완료`, logFile);
        }
      }
      
      // 매 작품마다 progress 저장 및 output 파일 업데이트 (오류 발생해도 저장됨)
      const currentProgress = {
        artworkLinks: artworkLinks,
        artworks: allArtworks,
        processedUrls: Array.from(processedUrls),
        errors: errors.length
      };
      saveProgress(currentProgress, progressFile);
      
      // 10개마다 output 파일도 업데이트 (실시간 반영)
      if (allArtworks.length % 10 === 0) {
        fs.writeFileSync(outputFile, JSON.stringify({ items: allArtworks }, null, 2));
        log(`💾 Output 파일 업데이트: ${allArtworks.length}개 작품`, logFile);
      }
      
      await sleep(DELAY_BETWEEN_ARTWORKS);
    }
    
    // 최종 저장
    fs.writeFileSync(outputFile, JSON.stringify({ items: allArtworks }, null, 2));
    
    const finalProgress = {
      artworkLinks: artworkLinks,
      artworks: allArtworks,
      processedUrls: Array.from(processedUrls),
      totalScraped: allArtworks.length,
      errors: errors.length
    };
    saveProgress(finalProgress, progressFile);
    
    log('\n═══════════════════════════════════════════════════════════════', logFile);
    log('  ✅ 스크래핑 완료', logFile);
    log('═══════════════════════════════════════════════════════════════', logFile);
    log(`  총 수집: ${allArtworks.length}개 작품`, logFile);
    log(`  오류: ${errors.length}개`, logFile);
    log(`  출력 파일: ${outputFile}`, logFile);
    log(`  완료 시간: ${new Date().toLocaleString()}`, logFile);
    
    await browser.close();
    return { success: true, count: allArtworks.length, errors: errors.length };
    
  } catch (error) {
    log(`\n❌ 치명적 오류: ${error.message}`, logFile);
    log(error.stack, logFile);
    
    // 오류 발생 시에도 progress 저장
    try {
      const errorProgress = {
        artworkLinks: artworkLinks || [],
        artworks: allArtworks || [],
        processedUrls: Array.from(processedUrls || []),
        error: error.message
      };
      saveProgress(errorProgress, progressFile);
      log(`💾 오류 발생 시 progress 저장 완료`, logFile);
    } catch (saveError) {
      log(`❌ Progress 저장 실패: ${saveError.message}`, logFile);
    }
    
    await browser.close();
    return { success: false, error: error.message };
  }
}

async function main() {
  const collectionKey = process.argv[2];
  
  if (!collectionKey || !COLLECTIONS[collectionKey]) {
    console.log('사용법: node scrape-kroller-muller.cjs <collectionKey>');
    console.log('Collection keys: paintings, film, photography');
    process.exit(1);
  }
  
  const result = await scrapeCollection(collectionKey);
  process.exit(result.success ? 0 : 1);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { scrapeCollection, COLLECTIONS };
