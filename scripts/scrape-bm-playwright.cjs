/**
 * British Museum Collection Scraper using Playwright (Headful)
 * VPN을 통해 접근
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// 수집할 주요 작품들 - 검색어 기반
const HIGHLIGHTS = [
  { search: 'Rosetta Stone', room: 'Room 4' },
  { search: 'Ramesses II bust', room: 'Room 4' },
  { search: 'Sutton Hoo helmet', room: 'Room 41' },
  { search: 'Lewis Chessmen', room: 'Room 40' },
  { search: 'Portland Vase', room: 'Room 70' },
  { search: 'Lindow Man', room: 'Room 50' },
  { search: 'Parthenon sculptures', room: 'Room 18' },
  { search: 'Cyrus Cylinder', room: 'Room 52' },
  { search: 'Oxus Treasure gold', room: 'Room 52' },
  { search: 'Hoa Hakananaia Easter Island', room: 'Room 24' },
  { search: 'Standard of Ur', room: 'Room 56' },
  { search: 'Royal Game of Ur', room: 'Room 56' },
  { search: 'Assyrian lion hunt reliefs', room: 'Room 10' },
  { search: 'Elgin Marbles', room: 'Room 18' },
  { search: 'Mummy Katebet', room: 'Room 63' },
  { search: 'Book of the Dead Hunefer', room: 'Room 62' },
  { search: 'Benin bronze plaque', room: 'Room 25' },
  { search: 'Aztec serpent turquoise', room: 'Room 27' },
  { search: 'Nereid Monument', room: 'Room 17' },
  { search: 'Mausoleum Halicarnassus', room: 'Room 21' },
];

const OUTPUT_FILE = path.join(__dirname, '../public/data/british-museum-collection.json');

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function scrapeWithPlaywright() {
  console.log('🏛️ British Museum Scraper - Playwright Headful');
  console.log('VPN이 연결되어 있어야 합니다!\n');
  
  const browser = await chromium.launch({
    headless: false,  // 브라우저 창 표시
    slowMo: 100,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  
  // 브라우저가 열리면 잠시 대기
  console.log('⏳ 브라우저 시작됨, 5초 대기...');
  await delay(5000);
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'en-GB',
  });
  
  const page = await context.newPage();
  const results = [];
  
  try {
    // 먼저 메인 페이지 방문해서 Cloudflare 통과
    console.log('📍 British Museum 사이트 접속 중...');
    console.log('Cloudflare 페이지가 뜨면 30초간 기다려요...\n');
    
    await page.goto('https://www.britishmuseum.org/collection', { 
      waitUntil: 'load',
      timeout: 120000 
    });
    
    // Cloudflare 체크 - 더 오래 기다림
    await delay(5000);
    const pageContent = await page.content();
    if (pageContent.includes('Just a moment')) {
      console.log('⏳ Cloudflare 체크 감지 - 10초 대기...');
      await delay(10000);
    }
    
    // 페이지가 로드되었는지 확인
    const title = await page.title();
    console.log(`📄 페이지 제목: ${title}\n`);
    
    if (title.includes('moment') || title.includes('Cloudflare')) {
      console.log('❌ Cloudflare를 통과하지 못했습니다.');
      console.log('브라우저 창에서 직접 CAPTCHA를 풀어주세요...');
      await delay(30000);  // 30초 대기
    }
    
    // 각 작품 검색
    for (let i = 0; i < HIGHLIGHTS.length; i++) {
      const item = HIGHLIGHTS[i];
      console.log(`[${i + 1}/${HIGHLIGHTS.length}] 검색: ${item.search}`);
      
      try {
        // 검색 페이지로 이동
        const searchUrl = `https://www.britishmuseum.org/collection/search?keyword=${encodeURIComponent(item.search)}`;
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await delay(2000);
        
        // 첫 번째 결과 찾기
        const firstResult = await page.$('a[href*="/collection/object/"]');
        if (!firstResult) {
          console.log(`  ⚠️ 결과 없음`);
          continue;
        }
        
        const objectUrl = await firstResult.getAttribute('href');
        const fullUrl = objectUrl.startsWith('http') ? objectUrl : `https://www.britishmuseum.org${objectUrl}`;
        
        // 작품 페이지로 이동
        await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await delay(1500);
        
        // 데이터 추출
        const data = await page.evaluate(() => {
          const title = document.querySelector('h1')?.textContent?.trim() || '';
          const image = document.querySelector('meta[property="og:image"]')?.content || '';
          const description = document.querySelector('meta[property="og:description"]')?.content || '';
          
          // 상세 정보 추출
          const details = {};
          document.querySelectorAll('dt, .object-details__term').forEach(dt => {
            const dd = dt.nextElementSibling;
            if (dd && dt.textContent && dd.textContent) {
              details[dt.textContent.trim()] = dd.textContent.trim();
            }
          });
          
          // 추가 이미지
          const additionalImages = [];
          document.querySelectorAll('img[src*="media.britishmuseum.org"]').forEach(img => {
            if (img.src && !additionalImages.includes(img.src)) {
              additionalImages.push(img.src);
            }
          });
          
          return { title, image, description, details, additionalImages };
        });
        
        results.push({
          id: fullUrl.split('/').pop(),
          room: item.room,
          searchTerm: item.search,
          title: data.title,
          image: data.image,
          description: data.description,
          url: fullUrl,
          details: data.details,
          additionalImages: data.additionalImages,
        });
        
        console.log(`  ✅ ${data.title.substring(0, 50)}...`);
        
      } catch (err) {
        console.log(`  ❌ 오류: ${err.message}`);
      }
      
      await delay(1500);
    }
    
  } catch (error) {
    console.error('스크래핑 오류:', error.message);
  } finally {
    // 결과 저장
    const outputDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const collection = {
      museum: 'British Museum',
      museumId: 'british-museum',
      location: 'London, UK',
      scrapedAt: new Date().toISOString(),
      totalObjects: results.length,
      objects: results,
    };
    
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collection, null, 2));
    console.log(`\n✅ 완료! ${results.length}개 작품 저장됨`);
    console.log(`📁 저장 위치: ${OUTPUT_FILE}`);
    
    await browser.close();
  }
}

scrapeWithPlaywright().catch(console.error);
