/**
 * FLV 스크래핑 재개 스크립트
 * 이미 수집된 작품 URL을 건너뛰고 나머지를 계속 수집
 */
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

const OUTPUT_FILE = '/Users/kietzsche/armin-web-main/public/data/flv-collection.json';
const SAVE_INTERVAL = 10;

function log(msg) {
  const time = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  console.log(`[${time}] ${msg}`);
}

async function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function resumeFLV() {
  console.log('═'.repeat(60));
  console.log('  🏛️ FLV 컬렉션 스크래핑 재개');
  console.log('═'.repeat(60));
  
  // 기존 데이터 로드
  let existingArtworks = [];
  let processedUrls = new Set();
  
  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      existingArtworks = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
      existingArtworks.forEach(a => {
        if (a.detailUrl) processedUrls.add(a.detailUrl);
      });
      log(`📦 기존 데이터 로드: ${existingArtworks.length}개 작품`);
    } catch (e) {
      log('⚠️ 기존 데이터 로드 실패, 처음부터 시작');
    }
  }
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  
  try {
    // 모든 페이지에서 작품 URL 수집
    log('📄 작품 링크 수집 중...');
    const allArtworkUrls = new Set();
    
    for (let pageNum = 1; pageNum <= 32; pageNum++) {
      const url = pageNum === 1 
        ? 'https://www.fondationlouisvuitton.fr/en/collection/artworks'
        : `https://www.fondationlouisvuitton.fr/en/collection/artworks?page=${pageNum}`;
      
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
      await delay(2000);
      
      const artworkUrls = await page.evaluate(() => {
        const links = document.querySelectorAll('a[href*="/collection/artworks/"]');
        const urls = [];
        links.forEach(link => {
          const href = link.href;
          if (href && !href.includes('?') && href.match(/\/artworks\/[a-z0-9-]+$/)) {
            urls.push(href);
          }
        });
        return [...new Set(urls)];
      });
      
      artworkUrls.forEach(url => allArtworkUrls.add(url));
      log(`  페이지 ${pageNum}/32: ${artworkUrls.length}개 (총 ${allArtworkUrls.size}개)`);
    }
    
    log(`📋 총 ${allArtworkUrls.size}개 작품 링크`);
    
    // 아직 처리되지 않은 URL만 필터링
    const urlsToProcess = Array.from(allArtworkUrls).filter(url => !processedUrls.has(url));
    log(`🔍 새로 수집할 작품: ${urlsToProcess.length}개`);
    
    if (urlsToProcess.length === 0) {
      log('✅ 모든 작품 수집 완료!');
      await browser.close();
      return;
    }
    
    // 상세 페이지 방문
    let newArtworks = [...existingArtworks];
    
    for (let i = 0; i < urlsToProcess.length; i++) {
      const detailUrl = urlsToProcess[i];
      
      try {
        log(`📄 (${i + 1}/${urlsToProcess.length}) ${detailUrl.split('/').pop()}`);
        
        await page.goto(detailUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await delay(1500);
        
        const artwork = await page.evaluate(() => {
          const title = document.querySelector('h1.hero-artwork__title')?.textContent?.trim() || '';
          
          const mainInfo = Array.from(document.querySelectorAll('.hero-artwork__description-main li'))
            .map(li => li.textContent.trim());
          const auxInfo = Array.from(document.querySelectorAll('.hero-artwork__description-aux li'))
            .map(li => li.textContent.trim());
          
          let artist = '', year = '', medium = '', dimensions = '';
          
          mainInfo.forEach(info => {
            if (/^\d{4}$/.test(info)) year = info;
            else artist = info;
          });
          
          auxInfo.forEach(info => {
            if (/\d+\s*[x×]\s*\d+/.test(info) || /cm|mm|m\b/.test(info)) dimensions = info;
            else medium = info;
          });
          
          const img = document.querySelector('.hero-artwork__image-container img');
          let imageUrl = img?.src || '';
          if (imageUrl) {
            imageUrl = imageUrl.split('?')[0] + '?auto=compress,format&fit=min&fm=jpg&q=90&w=1200';
          }
          
          return { title, artist, year, medium, dimensions, imageUrl };
        });
        
        if (artwork.title || artwork.imageUrl) {
          newArtworks.push({
            id: `flv-${newArtworks.length}`,
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
          
          log(`   ✓ ${artwork.title?.substring(0, 40) || 'Untitled'}`);
          
          // 주기적 저장
          if (newArtworks.length % SAVE_INTERVAL === 0) {
            fs.writeFileSync(OUTPUT_FILE, JSON.stringify(newArtworks, null, 2));
            log(`   💾 저장됨: ${newArtworks.length}개`);
          }
        }
      } catch (e) {
        log(`   ❌ 오류: ${e.message.substring(0, 50)}`);
      }
    }
    
    // 최종 저장
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(newArtworks, null, 2));
    log('═'.repeat(60));
    log(`✅ 완료! 총 ${newArtworks.length}개 작품`);
    log('═'.repeat(60));
    
  } finally {
    await browser.close();
  }
}

resumeFLV().catch(console.error);
