/**
 * Fondation Louis Vuitton Collection Scraper
 * puppeteer-extra + stealth plugin
 */
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

const OUTPUT_DIR = '/Users/kietzsche/armin-web-main/public/data';
const OUTPUT_FILE = `${OUTPUT_DIR}/flv-collection.json`;

function log(msg) {
  const time = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  console.log(`[${time}] ${msg}`);
}

async function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function scrapeFLV(testMode = false) {
  console.log('═'.repeat(60));
  console.log('  🏛️ Fondation Louis Vuitton 컬렉션 스크래핑');
  console.log(`  ${testMode ? '🧪 테스트 모드' : '🚀 전체 모드'}`);
  console.log('═'.repeat(60));
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--window-size=1920,1080'
    ]
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
  });
  
  const allArtworks = [];
  
  try {
    log('📄 메인 페이지 로딩...');
    await page.goto('https://www.fondationlouisvuitton.fr/en/collection/artworks', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    await delay(3000);
    
    const title = await page.title();
    if (title.includes('Access Denied')) {
      log('❌ 접근 차단됨');
      await browser.close();
      return;
    }
    
    log('✅ 페이지 접근 성공');
    
    // 총 페이지 수 확인
    const totalPages = await page.evaluate(() => {
      const pageLinks = document.querySelectorAll('.pagination__link');
      let maxPage = 1;
      pageLinks.forEach(link => {
        const href = link.href || '';
        const match = href.match(/page=(\d+)/);
        if (match) {
          const pageNum = parseInt(match[1]);
          if (pageNum > maxPage) maxPage = pageNum;
        }
      });
      return maxPage;
    });
    
    log(`📄 총 ${totalPages} 페이지 발견`);
    
    const pagesToScrape = testMode ? Math.min(2, totalPages) : totalPages;
    const allArtworkUrls = new Set();
    
    // 각 페이지에서 작품 링크 수집
    for (let pageNum = 1; pageNum <= pagesToScrape; pageNum++) {
      if (pageNum > 1) {
        log(`📄 페이지 ${pageNum}/${pagesToScrape} 로딩...`);
        await page.goto(`https://www.fondationlouisvuitton.fr/en/collection/artworks?page=${pageNum}`, {
          waitUntil: 'networkidle2',
          timeout: 60000
        });
        await delay(2000);
      }
      
      // 작품 링크 수집
      const artworkUrls = await page.evaluate(() => {
        const links = document.querySelectorAll('a[href*="/collection/artworks/"]');
        const urls = [];
        links.forEach(link => {
          const href = link.href;
          // 필터 링크 제외 (? 포함된 것)
          if (href && !href.includes('?') && href.match(/\/artworks\/[a-z0-9-]+$/)) {
            urls.push(href);
          }
        });
        return [...new Set(urls)];
      });
      
      artworkUrls.forEach(url => allArtworkUrls.add(url));
      log(`   ✓ ${artworkUrls.length}개 작품 링크 (총 ${allArtworkUrls.size}개)`);
    }
    
    log(`📋 총 ${allArtworkUrls.size}개 작품 링크 수집 완료`);
    
    // 각 상세 페이지 방문하여 정보 추출
    const artworkUrlList = Array.from(allArtworkUrls);
    const artworksToProcess = testMode ? artworkUrlList.slice(0, 5) : artworkUrlList;
    
    log(`🔍 ${artworksToProcess.length}개 작품 상세 정보 추출 중...`);
    
    for (let i = 0; i < artworksToProcess.length; i++) {
      const detailUrl = artworksToProcess[i];
      
      try {
        log(`📄 (${i + 1}/${artworksToProcess.length}) ${detailUrl.split('/').pop()}`);
        
        await page.goto(detailUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await delay(1500);
        
        const artwork = await page.evaluate(() => {
          // 제목
          const title = document.querySelector('h1.hero-artwork__title')?.textContent?.trim() || '';
          
          // 메인 정보 (연도, 작가)
          const mainInfo = Array.from(document.querySelectorAll('.hero-artwork__description-main li'))
            .map(li => li.textContent.trim());
          
          // 보조 정보 (재료, 크기)
          const auxInfo = Array.from(document.querySelectorAll('.hero-artwork__description-aux li'))
            .map(li => li.textContent.trim());
          
          // 작가와 연도 분리
          let artist = '';
          let year = '';
          mainInfo.forEach(info => {
            if (/^\d{4}$/.test(info)) {
              year = info;
            } else {
              artist = info;
            }
          });
          
          // 재료와 크기 분리
          let medium = '';
          let dimensions = '';
          auxInfo.forEach(info => {
            if (/\d+\s*[x×]\s*\d+/.test(info) || /cm|mm|m\b/.test(info)) {
              dimensions = info;
            } else {
              medium = info;
            }
          });
          
          // 이미지 URL
          const img = document.querySelector('.hero-artwork__image-container img');
          let imageUrl = img?.src || '';
          if (imageUrl) {
            imageUrl = imageUrl.split('?')[0] + '?auto=compress,format&fit=min&fm=jpg&q=90&w=1200';
          }
          
          return { title, artist, year, medium, dimensions, imageUrl };
        });
        
        if (artwork.title || artwork.imageUrl) {
          allArtworks.push({
            id: `flv-${allArtworks.length}`,
            title: artwork.title || 'Untitled',
            artist: artwork.artist || '',
            year: artwork.year || '',
            medium: artwork.medium || '',
            dimensions: artwork.dimensions || '',
            imageUrl: artwork.imageUrl || '',
            detailUrl: detailUrl,
            museum: 'Fondation Louis Vuitton',
            sourceUrl: 'https://www.fondationlouisvuitton.fr/en/collection/artworks'
          });
        }
        
      } catch (e) {
        log(`⚠️ 오류: ${e.message}`);
      }
      
      // 속도 제한
      if (i % 10 === 9) {
        log(`   💾 ${allArtworks.length}개 수집됨...`);
        await delay(1000);
      }
    }
    
  } catch (e) {
    console.error('Error:', e.message);
  }
  
  await browser.close();
  
  // 저장
  if (allArtworks.length > 0) {
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allArtworks, null, 2));
    
    console.log('═'.repeat(60));
    console.log(`  ✅ 완료: ${allArtworks.length}개`);
    console.log(`  📁 ${OUTPUT_FILE}`);
    console.log('═'.repeat(60));
    
    console.log('\n샘플 데이터:');
    console.log(JSON.stringify(allArtworks[0], null, 2));
  }
  
  return allArtworks;
}

// 실행
const testMode = process.argv.includes('--test');
scrapeFLV(testMode);
