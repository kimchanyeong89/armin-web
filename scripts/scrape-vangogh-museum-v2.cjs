/**
 * Van Gogh Museum Collection Scraper V2
 * 텍스트 기반 메타데이터 추출로 개선
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
  let existingArtworks = [];
  let processedUrls = new Set();
  
  // 기존 출력 파일에서 데이터 로드 (896개 이후부터 수집하기 위해)
  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      const existingData = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
      if (existingData.items && Array.isArray(existingData.items)) {
        existingArtworks = existingData.items;
        // 기존 작품들의 URL을 processedUrls에 추가
        existingArtworks.forEach(art => {
          if (art.url) processedUrls.add(art.url);
        });
        log(`📥 기존 데이터 로드: ${existingArtworks.length}개 작품 (중복 제외)`);
      }
    } catch (e) {
      log('⚠️ 기존 출력 파일 읽기 실패');
    }
  }
  
  // 진행 상황 파일 로드
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      const progressData = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
      // progressData의 processedUrls도 추가
      if (progressData.processedUrls && Array.isArray(progressData.processedUrls)) {
        progressData.processedUrls.forEach(url => processedUrls.add(url));
      }
    } catch (e) {
      log('⚠️ 진행 상황 파일 읽기 실패');
    }
  }
  
  // progress 파일에서 artworkLinks도 로드
  let artworkLinks = [];
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      const progressData = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
      if (progressData.artworkLinks && Array.isArray(progressData.artworkLinks)) {
        artworkLinks = progressData.artworkLinks;
      }
    } catch (e) {
      // ignore
    }
  }
  
  return { artworks: existingArtworks, processedUrls: processedUrls, lastPage: 1, artworkLinks: artworkLinks };
}

function saveProgress(progress) {
  const toSave = {
    ...progress,
    processedUrls: Array.from(progress.processedUrls || [])
  };
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(toSave, null, 2));
}

// 작품 목록 페이지에서 링크 수집 (무한 스크롤 지원)
async function collectArtworkLinks(page) {
  log('📋 작품 링크 수집 시작 (무한 스크롤)...');
  const processedUrls = new Set();
  
  try {
    await page.goto(COLLECTION_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await sleep(3000);
    
    let previousCount = 0;
    let scrollAttempts = 0;
    const maxScrollAttempts = 300; // 최대 300번 스크롤 (약 5000+개 수집)
    
    while (scrollAttempts < maxScrollAttempts) {
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
      links.forEach(link => processedUrls.add(link));
      
      log(`스크롤 ${scrollAttempts + 1}: ${processedUrls.size}개 링크 발견`);
      
      // 충분한 링크 수집 또는 더 이상 로드되지 않으면 종료
      if (processedUrls.size >= TEST_LIMIT) {
        log('✅ 목표 링크 수 도달');
        break;
      }
      
      if (processedUrls.size === previousCount) {
        // 10번 연속 새 링크가 없으면 종료 (더 여유있게)
        scrollAttempts++;
        if (scrollAttempts >= 10) {
          log('✅ 더 이상 새 링크 없음');
          break;
        }
      } else {
        scrollAttempts = 0; // 새 링크가 있으면 카운터 리셋
      }
      
      previousCount = processedUrls.size;
      
      // 페이지 끝으로 스크롤
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await sleep(DELAY_BETWEEN_PAGES);
    }
    
  } catch (error) {
    log(`❌ 링크 수집 오류: ${error.message}`);
  }
  
  const artworkLinks = Array.from(processedUrls).slice(0, TEST_LIMIT);
  log(`✅ 총 ${artworkLinks.length}개 링크 수집 완료`);
  return artworkLinks;
}

// 작품 상세 페이지에서 메타데이터 추출 (텍스트 기반)
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
      
      // 아티스트 라인 찾기: "Vincent van Gogh (1853 - 1890)" 패턴
      const artistLine = lines.find(l => 
        (l.includes('Vincent') && l.includes('van Gogh')) ||
        (l.includes('(') && l.includes(')') && /^\d{4}/.test(l.split('(')[1]?.trim() || ''))
      );
      if (artistLine) {
        // "Vincent van Gogh (1853 - 1890), Nuenen, April-May 1885" -> "Vincent van Gogh"
        const artistMatch = artistLine.match(/^([^(]+?)(?:\s*\(|,|$)/);
        if (artistMatch) {
          artwork.artist = artistMatch[1].trim();
        }
      }
      
      // 날짜/년도 추출
      if (artistLine) {
        // "Vincent van Gogh (1853 - 1890), Nuenen, April-May 1885" 또는 "1885"
        const yearMatch = artistLine.match(/\b(18\d{2}|19\d{2}|20\d{2})\b/);
        if (yearMatch) {
          artwork.year = parseInt(yearMatch[1], 10);
          artwork.date = yearMatch[1];
        }
      }
      
      // 매체/크기 라인 찾기: "oil on canvas, 82 cm x 114 cm"
      const mediumLine = lines.find(l => 
        l.toLowerCase().includes('oil') || 
        l.toLowerCase().includes('canvas') || 
        (l.includes('cm') && l.includes('x'))
      );
      if (mediumLine) {
        // "oil on canvas, 82 cm x 114 cm" -> medium: "oil on canvas", dimensions: "82 cm x 114 cm"
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
      
      // 설명 (첫 번째 긴 문단)
      const descEl = document.querySelector('p, .description, [class*="description"]');
      if (descEl) {
        artwork.description = descEl.textContent.trim().substring(0, 500);
      }
      
      // 카테고리/오브젝트 타입 추출 ("Object data" 섹션 이후)
      const objectDataIndex = lines.findIndex(l => l.includes('Object data'));
      if (objectDataIndex >= 0) {
        const categoryLines = lines.slice(objectDataIndex + 1, objectDataIndex + 10);
        // "painting", "genre picture" 등 추출
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
        // 첫 번째 타입을 artworkType으로 사용
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
    log(`❌ 작품 스크래핑 오류 (${url}): ${error.message}`);
    return null;
  }
}

async function main() {
  log('═══════════════════════════════════════════════════════════════');
  log('  🏛️  Van Gogh Museum Collection Scraper V2');
  log('═══════════════════════════════════════════════════════════════');
  log(`  테스트 모드: ${TEST_LIMIT}개 작품`);
  log(`  시작 시간: ${new Date().toLocaleString()}`);
  log('───────────────────────────────────────────────────────────────');
  
  const progress = loadProgress();
  const processedUrls = new Set(progress.processedUrls || []);
  
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    // 이미 수집된 링크가 있으면 재사용, 없으면 새로 수집
    let artworkLinks = progress.artworkLinks || [];
    
    if (artworkLinks.length === 0) {
      log('📋 작품 링크 수집 시작 (무한 스크롤)...');
      artworkLinks = await collectArtworkLinks(page);
      // 링크 수집 완료 후 progress 저장
      const linkProgress = {
        artworkLinks: artworkLinks,
        artworks: progress.artworks || [],
        processedUrls: Array.from(processedUrls),
        lastPage: progress.lastPage || 1
      };
      saveProgress(linkProgress);
      log(`💾 ${artworkLinks.length}개 링크 저장 완료`);
    } else {
      log(`📥 저장된 링크 사용: ${artworkLinks.length}개`);
    }
    
    log(`\n📦 ${artworkLinks.length}개 작품 상세 정보 수집 시작... (${progress.artworks?.length || 0}개 이미 완료)\n`);
    
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
        log(`  ✅ ${artwork.title} - ${artwork.artist || 'Unknown'} (${artwork.year || 'N/A'})`);
      } else {
        errors.push(link);
        log(`  ❌ 실패`);
      }
      
      // 매 작품마다 progress 저장 (artworkLinks 포함)
      const currentProgress = {
        artworkLinks: artworkLinks,
        artworks: [...(progress.artworks || []), ...artworks],
        processedUrls: Array.from(processedUrls),
        lastPage: progress.lastPage || 1
      };
      saveProgress(currentProgress);
      
      await sleep(DELAY_BETWEEN_ARTWORKS);
    }
    
    const allArtworks = [...(progress.artworks || []), ...artworks];
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify({ items: allArtworks }, null, 2));
    
    // 최종 progress 저장 (artworkLinks 포함)
    const finalProgress = {
      artworkLinks: artworkLinks,
      artworks: allArtworks,
      processedUrls: Array.from(processedUrls),
      lastPage: progress.lastPage || 1,
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
