/**
 * Musée Marmottan Monet 컬렉션 스크래퍼
 * 모든 컬렉션 페이지를 하나로 합치고, 중복 제거
 * 목록 페이지에서 직접 데이터 추출 (상세 페이지 방문 불필요)
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../public/data/marmottan-collection.json');
const LOG_FILE = path.join(__dirname, '../downloads/marmottan-scrape-log.txt');

// 스크래핑할 컬렉션 페이지들
const COLLECTION_PAGES = [
  { url: 'https://www.marmottan.fr/en/collections/highlights/', name: 'Highlights' },
  { url: 'https://www.marmottan.fr/en/collections/middle-ages-and-ancien-regime/', name: 'Middle Ages and Ancien Régime' },
  { url: 'https://www.marmottan.fr/en/collections/from-the-revolutionary-decade-to-the-second-empire/', name: 'Revolutionary Decade to Second Empire' },
  { url: 'https://www.marmottan.fr/en/collections/impressionism-and-modern-times/', name: 'Impressionism and Modern Times' },
  { url: 'https://www.marmottan.fr/en/collections/berthe-morisot/', name: 'Berthe Morisot' },
  { url: 'https://www.marmottan.fr/en/collections/claude-monet/', name: 'Claude Monet' }
];

function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  fs.appendFileSync(LOG_FILE, logMessage + '\n');
}

// 작가명 포맷팅: "MONET Claude" → "Claude Monet"
function formatArtistName(rawName) {
  if (!rawName) return 'Unknown';
  
  // "(attribué à)" 등 제거
  let name = rawName.replace(/\s*\([^)]*\)\s*$/, '').trim();
  
  // 대문자로만 이루어진 성과 나머지 분리
  const parts = name.split(/\s+/).filter(p => p.length > 0);
  if (parts.length < 2) return name;
  
  // 첫 번째 파트가 전부 대문자면 성으로 판단
  const lastName = parts[0];
  const firstName = parts.slice(1).join(' ');
  
  // 적절한 대소문자로 변환
  const formatPart = (n) => {
    if (n.length === 0) return n;
    return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
  };
  
  const formattedFirst = firstName.split(' ').map(formatPart).join(' ');
  const formattedLast = formatPart(lastName);
  
  return `${formattedFirst} ${formattedLast}`;
}

async function scrapeCollectionPage(page, collectionInfo) {
  const { url, name } = collectionInfo;
  log(`📂 컬렉션 시작: ${name}`);
  
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);
  
  // 스크롤하여 모든 이미지 로드 (더 긴 스크롤)
  let previousHeight = 0;
  let scrollAttempts = 0;
  while (scrollAttempts < 20) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    const currentHeight = await page.evaluate(() => document.body.scrollHeight);
    if (currentHeight === previousHeight) break;
    previousHeight = currentHeight;
    scrollAttempts++;
  }
  
  // 맨 위로 다시 스크롤하면서 이미지 로드 트리거
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  
  for (let i = 0; i < 15; i++) {
    await page.evaluate((i) => window.scrollTo(0, i * 500), i);
    await page.waitForTimeout(200);
  }
  
  // 작품 데이터 직접 수집 (목록 페이지에서)
  const artworks = await page.evaluate(() => {
    const items = [];
    const anchors = document.querySelectorAll('a[href*="/notice/"]');
    
    anchors.forEach(a => {
      const href = a.getAttribute('href');
      if (!href || !href.includes('/notice/')) return;
      
      // ID 추출
      const match = href.match(/\/notice\/([^\/]+)$/);
      if (!match) return;
      
      const id = match[1];
      const text = a.innerText.trim();
      const img = a.querySelector('img');
      
      // 이미지 URL 찾기 - data-src도 확인 (lazy loading)
      let imgSrc = img?.src || '';
      const dataSrc = img?.getAttribute('data-src') || '';
      
      // placeholder 이미지 대신 data-src 사용
      if (!imgSrc || imgSrc.includes('placeholder') || imgSrc.includes('data:image')) {
        imgSrc = dataSrc;
      }
      
      // 아직도 없으면 ID 기반으로 URL 생성
      if (!imgSrc || imgSrc.includes('placeholder') || imgSrc.includes('data:image')) {
        imgSrc = `https://www.marmottan.fr/wp-content/themes/marmottan2019/collection/thumb/${id}.jpg`;
      }
      
      // 텍스트 파싱: "MONET Claude\n1840-1926\nIMPRESSION, SOLEIL LEVANT\n1872"
      const lines = text.split('\n').filter(l => l.trim());
      
      let artist = '';
      let year = '';
      let title = '';
      
      if (lines.length >= 3) {
        artist = lines[0].trim();
        // 두 번째 줄이 연도 범위(1840-1926)면 작가 생몰년
        if (/^\d{4}\s*[-–]\s*\d{4}$/.test(lines[1].trim())) {
          title = lines[2].trim();
          year = lines[3]?.trim() || '';
        } else {
          title = lines[1].trim();
          year = lines[2]?.trim() || '';
        }
      } else if (lines.length === 2) {
        artist = lines[0].trim();
        title = lines[1].trim();
      } else if (lines.length === 1) {
        title = lines[0].trim();
      }
      
      items.push({
        id,
        artist,
        title,
        year,
        image: imgSrc,
        detailUrl: href.startsWith('http') ? href : `https://www.marmottan.fr${href}`
      });
    });
    
    return items;
  });
  
  log(`   → ${name}: ${artworks.length}개 작품 발견`);
  return artworks;
}

async function main() {
  // 로그 파일 초기화
  fs.writeFileSync(LOG_FILE, '');
  log('🖼️  Musée Marmottan Monet 스크래핑 시작');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  
  // 모든 컬렉션 페이지에서 작품 수집
  const allArtworks = [];
  const seenIds = new Set();
  const seenImages = new Set();
  
  for (const collection of COLLECTION_PAGES) {
    try {
      const artworks = await scrapeCollectionPage(page, collection);
      
      for (const artwork of artworks) {
        // ID와 이미지 URL로 중복 확인
        if (!seenIds.has(artwork.id) && !seenImages.has(artwork.image)) {
          if (artwork.image && !artwork.image.includes('placeholder') && !artwork.image.includes('data:image')) {
            seenIds.add(artwork.id);
            seenImages.add(artwork.image);
            
            // 작가명 포맷팅
            artwork.artist = formatArtistName(artwork.artist);
            
            allArtworks.push(artwork);
          }
        }
      }
      
      log(`   📊 현재 총: ${allArtworks.length}개 (중복 제거됨)`);
    } catch (err) {
      log(`❌ ${collection.name} 오류: ${err.message}`);
    }
  }
  
  await browser.close();
  
  // 결과 저장
  const result = {
    museum: 'Musée Marmottan Monet',
    museumId: 'musee-marmottan-monet',
    collectionName: 'Collection',
    scrapedAt: new Date().toISOString(),
    totalObjects: allArtworks.length,
    coverImage: allArtworks[0]?.image || '',
    objects: allArtworks
  };
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
  
  log(`\n✅ 완료! 총 수집: ${allArtworks.length}개`);
  log(`📁 저장: ${OUTPUT_FILE}`);
}

main().catch(err => {
  log(`❌ 치명적 오류: ${err.message}`);
  process.exit(1);
});
