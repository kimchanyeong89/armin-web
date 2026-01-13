/**
 * Van Gogh Museum Collection Scraper V3
 * 5000개 이상 전체 수집, 중단 없이 끝까지 수집
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.vangoghmuseum.nl';
const COLLECTION_URL = `${BASE_URL}/en/collection?q=`;

const OUTPUT_FILE = path.join(__dirname, '../public/data/vangogh-museum-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/vangogh-museum-progress.json');
const LOG_FILE = path.join(__dirname, '../downloads/vangogh-museum-log.txt');

const TEST_LIMIT = 10000; // 전체 스크래핑
const DELAY_BETWEEN_PAGES = 3000; // 3초 대기 (더 안정적)
const DELAY_BETWEEN_ARTWORKS = 500;
const MAX_RETRIES = 3; // 재시도 횟수

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
  let artworkLinks = [];
  
  // 기존 출력 파일에서 데이터 로드
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
  
  // progress 파일 로드
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      const progressData = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
      if (progressData.processedUrls && Array.isArray(progressData.processedUrls)) {
        progressData.processedUrls.forEach(url => processedUrls.add(url));
      }
      // 링크가 5000개 이상이면 재사용, 아니면 새로 수집
      if (progressData.artworkLinks && Array.isArray(progressData.artworkLinks) && progressData.artworkLinks.length >= 5000) {
        artworkLinks = progressData.artworkLinks;
        log(`📥 저장된 링크 사용: ${artworkLinks.length}개`);
      }
    } catch (e) {
      log('⚠️ 진행 상황 파일 읽기 실패');
    }
  }
  
  return { artworks: existingArtworks, processedUrls: processedUrls, artworkLinks: artworkLinks };
}

function saveProgress(progress) {
  const toSave = {
    ...progress,
    processedUrls: Array.from(progress.processedUrls || [])
  };
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(toSave, null, 2));
}

// 작품 목록 페이지에서 링크 수집 (무한 스크롤 지원 - 개선된 버전)
async function collectArtworkLinks(page) {
  log('📋 작품 링크 수집 시작 (무한 스크롤)...');
  const collectedUrls = new Set();
  
  try {
    await page.goto(COLLECTION_URL, { waitUntil: 'networkidle', timeout: 120000 });
    await sleep(5000); // 초기 로딩 대기
    
    let previousCount = 0;
    let noNewLinksCount = 0;
    let totalScrolls = 0;
    const maxNoNewLinksCount = 30; // 30번 연속 새 링크 없으면 종료
    const maxScrolls = 500; // 최대 500번 스크롤
    
    while (totalScrolls < maxScrolls) {
      totalScrolls++;
      
      // 현재 링크 수집
      const links = await page.evaluate(() => {
        const links = [];
        const cards = document.querySelectorAll('a[href*="/en/collection/"]');
        cards.forEach(card => {
          const href = card.getAttribute('href');
          if (href && href.includes('/en/collection/') && !href.includes('/search') && !href.includes('?q=')) {
            const fullUrl = href.startsWith('http') ? href : `https://www.vangoghmuseum.nl${href}`;
            links.push(fullUrl);
          }
        });
        return [...new Set(links)];
      });
      
      // 새로운 링크 추가
      links.forEach(link => collectedUrls.add(link));
      
      // 10번마다 로그 출력
      if (totalScrolls % 10 === 0) {
        log(`스크롤 ${totalScrolls}: ${collectedUrls.size}개 링크 수집됨`);
      }
      
      // 충분한 링크 수집 시 종료
      if (collectedUrls.size >= TEST_LIMIT) {
        log('✅ 목표 링크 수 도달');
        break;
      }
      
      // 새 링크가 없는지 확인
      if (collectedUrls.size === previousCount) {
        noNewLinksCount++;
        if (noNewLinksCount >= maxNoNewLinksCount) {
          log(`✅ ${noNewLinksCount}번 연속 새 링크 없음, 수집 완료`);
          break;
        }
      } else {
        noNewLinksCount = 0; // 새 링크가 있으면 카운터 리셋
      }
      
      previousCount = collectedUrls.size;
      
      // 페이지 끝으로 스크롤
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      
      // 스크롤 후 대기 (랜덤하게 2.5~3.5초)
      const waitTime = 2500 + Math.random() * 1000;
      await sleep(waitTime);
      
      // 100번마다 중간 저장
      if (totalScrolls % 100 === 0) {
        const tempLinks = Array.from(collectedUrls);
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ artworkLinks: tempLinks }, null, 2));
        log(`💾 중간 저장: ${tempLinks.length}개 링크`);
      }
    }
    
  } catch (error) {
    log(`❌ 링크 수집 오류: ${error.message}`);
  }
  
  const artworkLinks = Array.from(collectedUrls);
  log(`✅ 총 ${artworkLinks.length}개 링크 수집 완료`);
  return artworkLinks;
}

// 작품 상세 페이지에서 메타데이터 추출
async function scrapeArtwork(page, url, retryCount = 0) {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
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
      
      // ID 추출
      const idMatch = currentUrl.match(/\/collection\/([^/?]+)/);
      if (idMatch) {
        artwork.id = idMatch[1];
      }
      
      // 제목 (h1)
      const h1 = document.querySelector('h1');
      if (h1) {
        artwork.title = h1.textContent.trim();
      }
      
      // 텍스트 기반 추출
      const text = document.body.innerText;
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      
      // 아티스트 라인 찾기
      const artistLine = lines.find(l => 
        (l.includes('Vincent') && l.includes('van Gogh')) ||
        (l.includes('(') && l.includes(')') && /^\d{4}/.test(l.split('(')[1]?.trim() || ''))
      );
      if (artistLine) {
        const artistMatch = artistLine.match(/^([^(]+?)(?:\s*\(|,|$)/);
        if (artistMatch) {
          artwork.artist = artistMatch[1].trim();
        }
      }
      
      // 날짜/년도 추출
      if (artistLine) {
        const yearMatch = artistLine.match(/\b(18\d{2}|19\d{2}|20\d{2})\b/);
        if (yearMatch) {
          artwork.year = parseInt(yearMatch[1], 10);
          artwork.date = yearMatch[1];
        }
      }
      
      // 매체/크기 라인 찾기
      const mediumLine = lines.find(l => 
        l.toLowerCase().includes('oil') || 
        l.toLowerCase().includes('canvas') || 
        (l.includes('cm') && l.includes('x'))
      );
      if (mediumLine) {
        const parts = mediumLine.split(',');
        if (parts.length > 0) {
          artwork.medium = parts[0].trim();
        }
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
      
      // 설명
      const descEl = document.querySelector('p, .description, [class*="description"]');
      if (descEl) {
        artwork.description = descEl.textContent.trim().substring(0, 500);
      }
      
      // 카테고리/오브젝트 타입 추출
      const objectDataIndex = lines.findIndex(l => l.includes('Object data'));
      if (objectDataIndex >= 0) {
        const categoryLines = lines.slice(objectDataIndex + 1, objectDataIndex + 10);
        for (const line of categoryLines) {
          const lowerLine = line.toLowerCase();
          if (lowerLine === 'painting' || lowerLine === 'drawing' || lowerLine === 'sculpture' || 
              lowerLine.includes('picture') || lowerLine.includes('genre') || lowerLine.includes('still life') ||
              lowerLine.includes('portrait') || lowerLine.includes('landscape') || lowerLine.includes('interior')) {
            if (!artwork.category) {
              artwork.category = line;
            }
            if (!artwork.artworkType && (lowerLine === 'painting' || lowerLine === 'drawing' || lowerLine === 'sculpture')) {
              artwork.artworkType = line;
            }
          }
        }
        if (!artwork.artworkType && categoryLines.length > 0) {
          const firstType = categoryLines.find(l => l.length > 2 && l.length < 50 && !/^\d{4}/.test(l));
          if (firstType) artwork.artworkType = firstType;
        }
      }
      
      // 이미지 URL
      const imgEl = document.querySelector('img[src*="iiif"], img[src*="micr.io"], picture img, .artwork-image img');
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
  log('  🏛️  Van Gogh Museum Collection Scraper V3');
  log('═══════════════════════════════════════════════════════════════');
  log(`  목표: 5000개 이상 전체 수집`);
  log(`  시작 시간: ${new Date().toLocaleString()}`);
  log('───────────────────────────────────────────────────────────────');
  
  const progress = loadProgress();
  const processedUrls = new Set(progress.processedUrls || []);
  let allArtworks = progress.artworks || [];
  
  let browser = await chromium.launch({ headless: true });
  let page = await browser.newPage();
  
  try {
    // 링크 수집 (5000개 이상이면 재사용)
    let artworkLinks = progress.artworkLinks || [];
    
    if (artworkLinks.length < 5000) {
      log('📋 링크가 5000개 미만, 새로 수집합니다...');
      artworkLinks = await collectArtworkLinks(page);
      
      // 링크 수집 완료 후 progress 저장
      const linkProgress = {
        artworkLinks: artworkLinks,
        artworks: allArtworks,
        processedUrls: Array.from(processedUrls)
      };
      saveProgress(linkProgress);
      log(`💾 ${artworkLinks.length}개 링크 저장 완료`);
    }
    
    log(`\n📦 ${artworkLinks.length}개 작품 상세 정보 수집 시작... (${allArtworks.length}개 이미 완료)\n`);
    
    const errors = [];
    let consecutiveErrors = 0;
    
    for (let i = 0; i < artworkLinks.length; i++) {
      const link = artworkLinks[i];
      
      if (processedUrls.has(link)) {
        continue;
      }
      
      log(`[${allArtworks.length + 1}/${artworkLinks.length}] 스크래핑: ${link}`);
      
      try {
        const artwork = await scrapeArtwork(page, link);
        
        if (artwork && artwork.title) {
          allArtworks.push(artwork);
          processedUrls.add(link);
          log(`  ✅ ${artwork.title} - ${artwork.artist || 'Unknown'} (${artwork.year || 'N/A'})`);
          consecutiveErrors = 0;
        } else {
          errors.push(link);
          log(`  ❌ 실패`);
          consecutiveErrors++;
        }
      } catch (error) {
        log(`  ❌ 스크래핑 오류: ${error.message}`);
        errors.push(link);
        consecutiveErrors++;
        
        // 브라우저 크래시 시 재시작
        if (error.message.includes('browser has been closed') || error.message.includes('Target page') || error.message.includes('context')) {
          log(`  🔄 브라우저 크래시 감지, 재시작 중...`);
          try { await browser.close(); } catch (e) {}
          await sleep(5000);
          browser = await chromium.launch({ headless: true });
          page = await browser.newPage();
          log(`  ✅ 브라우저 재시작 완료`);
          consecutiveErrors = 0;
        }
      }
      
      // 연속 오류가 10번 이상이면 브라우저 재시작
      if (consecutiveErrors >= 10) {
        log(`  🔄 연속 오류 ${consecutiveErrors}번, 브라우저 재시작 중...`);
        try { await browser.close(); } catch (e) {}
        await sleep(5000);
        browser = await chromium.launch({ headless: true });
        page = await browser.newPage();
        log(`  ✅ 브라우저 재시작 완료`);
        consecutiveErrors = 0;
      }
      
      // 매 작품마다 progress 저장
      const currentProgress = {
        artworkLinks: artworkLinks,
        artworks: allArtworks,
        processedUrls: Array.from(processedUrls),
        errors: errors.length
      };
      saveProgress(currentProgress);
      
      // 100개마다 출력 파일 저장
      if (allArtworks.length % 100 === 0) {
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify({ items: allArtworks }, null, 2));
        log(`💾 ${allArtworks.length}개 작품 저장 완료`);
      }
      
      await sleep(DELAY_BETWEEN_ARTWORKS);
    }
    
    // 최종 저장
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify({ items: allArtworks }, null, 2));
    
    const finalProgress = {
      artworkLinks: artworkLinks,
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
    
    await browser.close();
    
  } catch (error) {
    log(`\n❌ 치명적 오류: ${error.message}`);
    log(error.stack);
    
    // 오류 발생 시에도 progress 저장
    try {
      const errorProgress = {
        artworkLinks: progress.artworkLinks || [],
        artworks: allArtworks,
        processedUrls: Array.from(processedUrls),
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
