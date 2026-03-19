/**
 * Mauritshuis Collection Scraper V2
 * /artworks/ 경로의 실제 작품 링크 수집
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.mauritshuis.nl';
const COLLECTION_URL = `${BASE_URL}/en/our-collection`;

const OUTPUT_FILE = path.join(__dirname, '../public/data/mauritshuis-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/mauritshuis-progress.json');
const LOG_FILE = path.join(__dirname, '../downloads/mauritshuis-log.txt');

const TEST_LIMIT = 1000; // 전체 수집 (893개 목표)
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

// 작품 목록 페이지에서 링크 수집 (/artworks/ 경로만)
async function collectArtworkLinks(page, existingUrlsSet) {
  log('📋 작품 링크 수집 시작...');
  const artworkLinks = [];
  const processedUrls = new Set(existingUrlsSet || []);
  let attempts = 0;
  const maxAttempts = 1000; // 893개 수집을 위해 더 많은 시도
  
  await page.goto(COLLECTION_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await sleep(5000);
  
  // 쿠키 동의 처리
  try {
    const cookieBtn = await page.$('button:has-text("Accept"), button:has-text("Accept All")');
    if (cookieBtn) await cookieBtn.click({ timeout: 2000 });
    await sleep(2000);
  } catch (e) {}
  
  let previousCount = existingUrlsSet ? existingUrlsSet.size : 0;
  let noChangeCount = 0;
  const maxNoChangeCount = 30; // 30번 연속 변화 없어도 계속 시도
  
  while (artworkLinks.length + previousCount < TEST_LIMIT && attempts < maxAttempts) {
    log(`시도 ${attempts + 1}... (현재 ${artworkLinks.length + previousCount}개 링크, 새로 발견: ${artworkLinks.length}개)`);
    
    try {
      // 링크 추출 (브라우저가 닫혔으면 재시작)
      let links = [];
      try {
        links = await page.evaluate((baseUrl) => {
          const links = [];
          const allLinks = document.querySelectorAll('a[href*="/our-collection/artworks/"]');
          allLinks.forEach(a => {
            const href = a.getAttribute('href');
            if (href && href.includes('/artworks/')) {
              const fullUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;
              links.push(fullUrl);
            }
          });
          return [...new Set(links)];
        }, BASE_URL);
      } catch (evalError) {
        if (evalError.message.includes('closed')) {
          log('  ⚠️ 브라우저가 닫혔습니다, 재접속...');
          try {
            await page.goto(COLLECTION_URL, { waitUntil: 'networkidle', timeout: 60000 });
            await sleep(3000);
            links = await page.evaluate((baseUrl) => {
              const links = [];
              const allLinks = document.querySelectorAll('a[href*="/our-collection/artworks/"]');
              allLinks.forEach(a => {
                const href = a.getAttribute('href');
                if (href && href.includes('/artworks/')) {
                  const fullUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;
                  links.push(fullUrl);
                }
              });
              return [...new Set(links)];
            }, BASE_URL);
          } catch (reconnectError) {
            log(`  ❌ 재접속 실패: ${reconnectError.message}`);
            continue;
          }
        } else {
          throw evalError;
        }
      }
      
      let newLinksCount = 0;
      for (const link of links) {
        if (!processedUrls.has(link) && (artworkLinks.length + previousCount) < TEST_LIMIT) {
          artworkLinks.push(link);
          processedUrls.add(link);
          newLinksCount++;
        }
      }
      
      const currentTotal = artworkLinks.length + previousCount;
      
      // 링크 개수가 증가했는지 확인
      if (newLinksCount === 0) {
        noChangeCount++;
        if (noChangeCount >= maxNoChangeCount && currentTotal >= 850) {
          log(`더 이상 새로운 링크 없음 (${noChangeCount}번 연속), 현재: ${currentTotal}개`);
          break;
        }
      } else {
        noChangeCount = 0;
        log(`  ➕ ${newLinksCount}개 새 링크 발견 (총 ${currentTotal}개)`);
      }
      
      // 우측 화살표 버튼 클릭 시도 (브라우저가 닫혔으면 스킵)
      let clickedRight = false;
      try {
        clickedRight = await page.evaluate(() => {
          // 스크롤을 하단으로 이동해서 버튼이 보이도록 함
          window.scrollTo(0, document.body.scrollHeight);
          
          // inpage-horizontal-navigation__scroll-to 클래스 사용 (back이 아닌 것 = 우측 버튼)
          const navButtons = Array.from(document.querySelectorAll('.inpage-horizontal-navigation__scroll-to'));
          const rightBtn = navButtons.find(btn => {
            return !btn.classList.contains('inpage-horizontal-navigation__scroll-to-back') &&
                   btn.offsetParent !== null &&
                   !btn.disabled;
          });
          
          if (rightBtn) {
            rightBtn.click();
            return true;
          }
          
          // 대체 방법: SVG가 있는 버튼 중 화면 하단에 있는 것
          const allButtons = Array.from(document.querySelectorAll('button, a'));
          for (const btn of allButtons) {
            const rect = btn.getBoundingClientRect();
            if (rect.bottom < window.innerHeight * 0.7) continue; // 화면 하단에 있는 버튼만
            const style = window.getComputedStyle(btn);
            if (style.display === 'none' || style.visibility === 'hidden' || rect.width === 0 || rect.height === 0) continue;
            if (btn.disabled) continue;
            
            const svg = btn.querySelector('svg');
            if (svg && rect.width > 20 && rect.width < 100 && rect.height > 20 && rect.height < 100) {
              // back이 아닌 버튼 (우측)
              if (!btn.classList.contains('back') && !btn.className.includes('back')) {
                btn.click();
                return true;
              }
            }
          }
          
          return false;
        });
      } catch (clickError) {
        if (!clickError.message.includes('closed')) {
          log(`  ⚠️ 버튼 클릭 오류: ${clickError.message}`);
        }
      }
      
      if (!clickedRight) {
        // 버튼이 없으면 스크롤 (더 적극적으로)
        try {
          await page.evaluate(() => {
            window.scrollBy(0, 800);
            window.scrollTo(0, document.body.scrollHeight);
          });
        } catch (scrollError) {
          if (!scrollError.message.includes('closed')) {
            log(`  ⚠️ 스크롤 오류: ${scrollError.message}`);
          }
        }
      }
      
      await sleep(2500); // 로딩 대기 시간 증가
      attempts++;
      
    } catch (error) {
      log(`❌ 오류: ${error.message}`);
      // 오류가 발생해도 계속 시도
      await sleep(2000);
      attempts++;
    }
  }
  
  const totalLinks = artworkLinks.length + previousCount;
  log(`✅ 총 ${totalLinks}개 링크 수집 완료 (기존 ${previousCount}개 + 새로 ${artworkLinks.length}개)`);
  return artworkLinks;
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
        url: currentUrl
      };
      
      // ID 추출
      const idMatch = currentUrl.match(/\/artworks\/([^/?]+)/);
      if (idMatch) {
        artwork.id = idMatch[1];
      }
      
      // 제목
      const h1 = document.querySelector('h1');
      if (h1) artwork.title = h1.textContent.trim();
      
      // 아티스트 (h1 앞의 p.art-detail-header__painter)
      const artistEl = document.querySelector('p.art-detail-header__painter, [class*="painter"]');
      if (artistEl) {
        artwork.artist = artistEl.textContent.trim();
      } else {
        // 폴백: h1의 previousElementSibling
        const h1Parent = h1 ? h1.parentElement : null;
        if (h1 && h1Parent) {
          const siblings = Array.from(h1Parent.children);
          const h1Index = siblings.indexOf(h1);
          if (h1Index > 0) {
            const prevEl = siblings[h1Index - 1];
            if (prevEl && prevEl.tagName === 'P') {
              artwork.artist = prevEl.textContent.trim();
            }
          }
        }
      }
      
      // 이미지 URL (우선순위: 고해상도 이미지)
      const imgSelectors = [
        'img[src*="mauritshuis"][src*=".jpg"]',
        'img[src*="mauritshuis"][src*=".png"]',
        'img[src*=".jpg"]',
        'img[src*=".png"]',
        'picture img',
        'img'
      ];
      
      // 제외할 키워드
      const excludeKeywords = ['perspectief', 'tentoonstellingen', 'logo', 'footer', 'video', 'museum', 'header', 'banner', 'icon', 'social', 'thumbnail'];
      
      for (const selector of imgSelectors) {
        const imgs = document.querySelectorAll(selector);
        for (const img of Array.from(imgs)) {
          let src = img.getAttribute('src') || img.getAttribute('data-src') || '';
          // 제외 키워드 체크
          const shouldExclude = excludeKeywords.some(kw => src.toLowerCase().includes(kw));
          if (src && !shouldExclude && src.includes('.jpg') || src.includes('.png')) {
            // 고해상도 이미지로 변환 (width 파라미터 조정)
            src = src.replace(/width=\d+/, 'width=2000').replace(/&width=\d+/, '&width=2000');
            if (!src.includes('width=')) {
              src += (src.includes('?') ? '&' : '?') + 'width=2000';
            }
            artwork.imageUrl = src.startsWith('http') ? src : baseUrl + src;
            break;
          }
        }
        if (artwork.imageUrl) break;
      }
      
      // 텍스트 기반 메타데이터 추출
      const text = document.body.innerText;
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      
      // 년도 추출
      const yearMatch = text.match(/\b(1[5-9]\d{2}|20\d{2})\b/);
      if (yearMatch) {
        artwork.year = parseInt(yearMatch[0], 10);
        artwork.date = yearMatch[0];
      }
      
      // Medium/Material 추출 (텍스트 패턴)
      const mediumPatterns = [
        /(?:oil on canvas|canvas|panel|paper|wood|copper|linen)/i,
        /(?:technique|material|medium):\s*([^\n]+)/i
      ];
      for (const pattern of mediumPatterns) {
        const match = text.match(pattern);
        if (match) {
          artwork.medium = match[1] || match[0];
          break;
        }
      }
      
      // Dimensions 추출
      const dimensionPatterns = [
        /\b(\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?\s*cm)\b/i,
        /(?:dimensions|size|measurements?):\s*([^\n]+)/i
      ];
      for (const pattern of dimensionPatterns) {
        const match = text.match(pattern);
        if (match) {
          artwork.dimensions = match[1] || match[0];
          break;
        }
      }
      
      // Category/Type (Paintings 등)
      if (text.toLowerCase().includes('painting')) {
        artwork.category = 'Paintings';
        artwork.artworkType = 'Paintings';
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
  log('  🏛️  Mauritshuis Collection Scraper V2');
  log('═══════════════════════════════════════════════════════════════');
  log(`  테스트 모드: ${TEST_LIMIT}개 작품`);
  log(`  시작 시간: ${new Date().toLocaleString()}`);
  log('───────────────────────────────────────────────────────────────');
  
  const progress = loadProgress();
  const processedUrls = new Set(progress.processedUrls || []);
  const existingUrlsSet = new Set(progress.processedUrls || []);
  
  log(`📥 기존 ${existingUrlsSet.size}개 URL 로드됨, 나머지 수집 시작...`);
  
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    const newArtworkLinks = await collectArtworkLinks(page, existingUrlsSet);
    log(`\n📦 ${newArtworkLinks.length}개 새 작품 상세 정보 수집 시작...\n`);
    
    const artworks = [];
    const errors = [];
    
    for (let i = 0; i < newArtworkLinks.length; i++) {
      const link = newArtworkLinks[i];
      
      if (processedUrls.has(link)) {
        log(`⏭️  이미 처리됨: ${link}`);
        continue;
      }
      
      log(`[${i + 1}/${newArtworkLinks.length}] 스크래핑: ${link}`);
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
