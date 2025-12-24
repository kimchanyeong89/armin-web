/**
 * Louvre Museum - Painting Collection Scraper
 * 
 * 루브르 페인팅 컬렉션 스크래핑
 * CSV 내보내기 API 활용 + 상세 페이지에서 이미지 수집
 * 총 10,861개 예상
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE_URL = 'https://collections.louvre.fr';
const SEARCH_URL = 'https://collections.louvre.fr/en/recherche?limit=100&typology%5B0%5D=22';
const PROGRESS_FILE = path.join(__dirname, '../downloads/louvre-painting-progress.json');
const FINAL_OUTPUT = path.join(__dirname, '../public/data/louvre-painting-collection.json');

const PARALLEL_COUNT = 5;
const SAVE_INTERVAL = 50;

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
    console.log(`📂 이전 진행 상황 로드: ${data.artworks?.length || 0}개 작품`);
    return data;
  }
  return { artworks: [], processedUrls: [] };
}

function saveProgress(artworks, processedUrls) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ 
    artworks, 
    processedUrls: Array.from(processedUrls),
    savedAt: new Date().toISOString() 
  }, null, 2));
}

function saveFinal(artworks) {
  const finalOutput = {
    museum: 'Musée du Louvre',
    museumId: 'louvre',
    collectionName: 'Painting Collection',
    scrapedAt: new Date().toISOString(),
    totalObjects: artworks.length,
    coverImage: artworks[0]?.image || '',
    objects: artworks
  };
  fs.writeFileSync(FINAL_OUTPUT, JSON.stringify(finalOutput, null, 2));
}

async function scrapeDetail(context, detailUrl, retryCount = 0) {
  const page = await context.newPage();
  try {
    await page.goto(detailUrl, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(3000);
    
    const data = await page.evaluate(() => {
      // 제목 - h1 중 실제 작품 제목 (Vénitienne 같은)
      const h1s = Array.from(document.querySelectorAll('h1'));
      let title = null;
      for (const h1 of h1s) {
        const text = h1.textContent?.trim();
        if (text && !text.includes('Modal') && !text.includes('Download') && text.length > 1) {
          title = text;
          break;
        }
      }
      
      // og:title 폴백
      if (!title) {
        const ogTitle = document.querySelector('meta[property="og:title"]');
        if (ogTitle) title = ogTitle.getAttribute('content');
      }
      
      // 작가 - 페이지 텍스트에서 추출
      let artist = null;
      const bodyText = document.body.innerText;
      
      // Artist/maker 섹션 찾기
      const artistMatch = bodyText.match(/Artist\/maker[^]*?([A-Z][a-zàâäéèêëïîôùûüç]+,\s*[A-Z][a-zàâäéèêëïîôùûüç]+)/);
      if (artistMatch) {
        artist = artistMatch[1];
      }
      // 또는 "School of" 패턴
      if (!artist) {
        const schoolMatch = bodyText.match(/([A-Z][a-zàâäéèêëïîôùûüç]+(?:,\s*[A-Z][a-zàâäéèêëïîôùûüç]+)?)\s*\([^)]+\d{4}[^)]*\)/);
        if (schoolMatch) {
          artist = schoolMatch[1];
        }
      }
      
      // 이미지 - 고해상도 버전
      let image = null;
      const ogImage = document.querySelector('meta[property="og:image"]');
      if (ogImage) {
        image = ogImage.getAttribute('content');
        // medium -> large로 변경
        if (image) {
          image = image.replace('/small/', '/large/').replace('/medium/', '/large/');
        }
      }
      
      // 연도
      let year = null;
      const yearMatch = bodyText.match(/(\d{4})\s*[\/–-]\s*\d{4}|vers\s+(\d{4})|^(\d{4})\s/m);
      if (yearMatch) {
        year = yearMatch[1] || yearMatch[2] || yearMatch[3];
      }
      
      // 소장번호
      let inventoryNo = null;
      const invMatch = bodyText.match(/(RF\s*\d+\s*\d*|INV[.\s]*\d+|MI\s*\d+)/i);
      if (invMatch) {
        inventoryNo = invMatch[1];
      }
      
      // 부서
      let department = null;
      if (bodyText.includes('Département des Peintures')) {
        department = 'Département des Peintures';
      }
      
      return { title, artist, image, year, inventoryNo, department };
    });
    
    await page.close();
    
    // 데이터 없으면 재시도
    if (!data.title && !data.image && retryCount < 2) {
      await new Promise(r => setTimeout(r, 500));
      return scrapeDetail(context, detailUrl, retryCount + 1);
    }
    
    return { ...data, detailUrl };
  } catch (e) {
    await page.close();
    if (retryCount < 2) {
      await new Promise(r => setTimeout(r, 1000));
      return scrapeDetail(context, detailUrl, retryCount + 1);
    }
    return { error: e.message, detailUrl };
  }
}

async function scrape() {
  console.log('🏛️ Louvre Museum - Painting Collection Scraper');
  console.log('='.repeat(50));
  console.log(`병렬: ${PARALLEL_COUNT}개씩`);
  console.log('='.repeat(50) + '\n');
  
  const startTime = Date.now();
  
  // 이전 진행 상황 로드
  const progress = loadProgress();
  let artworks = progress.artworks || [];
  let processedUrls = new Set(progress.processedUrls || []);
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const mainPage = await context.newPage();
  
  try {
    // Step 1: 전체 작품 목록 수집
    console.log('📋 Step 1: 작품 목록 수집...');
    
    let allItems = [];
    let page = 1;
    let totalExpected = 0;
    
    while (true) {
      const offset = (page - 1) * 100;
      const pageUrl = `${SEARCH_URL}&offset=${offset}`;
      
      await mainPage.goto(pageUrl, { waitUntil: 'networkidle', timeout: 60000 });
      await mainPage.waitForTimeout(2000);
      
      if (page === 1) {
        // 총 개수 확인
        const totalText = await mainPage.textContent('body');
        const totalMatch = totalText.match(/(\d+,?\d*)\s*results/);
        if (totalMatch) {
          totalExpected = parseInt(totalMatch[1].replace(',', ''));
          console.log(`  총 ${totalExpected}개 작품 예상`);
        }
      }
      
      const items = await mainPage.$$eval('a[href*="/ark:/"]', (elements, processed) => {
        const seen = new Set(processed);
        return elements
          .filter(el => el.href.includes('/ark:/53355/'))
          .filter(el => {
            if (seen.has(el.href)) return false;
            seen.add(el.href);
            return true;
          })
          .map(el => el.href);
      }, Array.from(processedUrls));
      
      if (items.length === 0) {
        console.log(`\n  페이지 ${page}: 새 항목 없음, 수집 완료`);
        break;
      }
      
      allItems = allItems.concat(items);
      process.stdout.write(`\r  페이지 ${page}: ${allItems.length}개 수집됨`);
      
      page++;
      
      // 안전장치
      if (page > 150) {
        console.log('\n  최대 페이지 도달');
        break;
      }
    }
    
    console.log(`\n\n✅ 총 ${allItems.length}개 작품 URL 수집\n`);
    
    // Step 2: 상세 페이지 스크래핑
    console.log(`📝 Step 2: 상세 페이지 스크래핑 (${PARALLEL_COUNT}개씩)...`);
    
    // 이미 처리된 URL 제외
    const newItems = allItems.filter(url => !processedUrls.has(url));
    console.log(`  새로 처리할 항목: ${newItems.length}개`);
    
    for (let i = 0; i < newItems.length; i += PARALLEL_COUNT) {
      const batch = newItems.slice(i, i + PARALLEL_COUNT);
      const batchNum = Math.floor(i / PARALLEL_COUNT) + 1;
      const totalBatches = Math.ceil(newItems.length / PARALLEL_COUNT);
      
      process.stdout.write(`\r  배치 ${batchNum}/${totalBatches} (${artworks.length}개 수집됨)`);
      
      const results = await Promise.all(
        batch.map(url => scrapeDetail(context, url))
      );
      
      for (const data of results) {
        processedUrls.add(data.detailUrl);
        
        if (!data.error && (data.title || data.image)) {
          artworks.push({
            id: `louvre-painting-${artworks.length + 1}`,
            title: data.title || 'Sans titre',
            artist: data.artist || 'Artiste inconnu',
            year: data.year || null,
            image: data.image,
            dimensions: data.dimensions || null,
            medium: data.medium || 'Peinture',
            inventoryNo: data.inventoryNo || null,
            source: 'Musée du Louvre',
            collectionArea: 'Painting',
            detailUrl: data.detailUrl
          });
        }
      }
      
      // 주기적 저장
      if (artworks.length % SAVE_INTERVAL < PARALLEL_COUNT) {
        saveProgress(artworks, processedUrls);
        saveFinal(artworks);
      }
      
      await new Promise(r => setTimeout(r, 300));
    }
    
    // 최종 저장
    saveProgress(artworks, processedUrls);
    saveFinal(artworks);
    
    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    
    console.log('\n\n' + '='.repeat(50));
    console.log('✅ 완료!');
    console.log(`  - 총 수집: ${artworks.length}개`);
    console.log(`  - 소요시간: ${elapsed}분`);
    console.log(`📁 저장: ${FINAL_OUTPUT}`);
    
  } catch (e) {
    console.error('\n❌ 오류:', e.message);
    saveProgress(artworks, processedUrls);
    saveFinal(artworks);
    console.log(`⚠️ 진행 상황 저장됨: ${artworks.length}개`);
  }
  
  await browser.close();
}

scrape();
