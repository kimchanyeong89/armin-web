/**
 * MAM Paris - Painting Collection PARALLEL Scraper v2 (개선된 버전)
 * 
 * 개선사항:
 * 1. 상세 페이지 로딩 완료 대기 (실제 컨텐츠 확인)
 * 2. 더 정확한 셀렉터 사용
 * 3. 네비게이션 텍스트 필터링
 * 4. 실패시 재시도
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.navigart.fr/mamparis/#/artworks/checkbox:withimage/Avec%20image/tree_domain_all/Peinture';
const OUTPUT_FILE = path.join(__dirname, '../downloads/mam-painting-parallel-v2.json');
const FINAL_OUTPUT = path.join(__dirname, '../public/data/mam-painting-collection.json');

const TEST_PAGES = 3;
const PARALLEL_COUNT = 5; // 동시에 5개씩

// 필터링할 네비게이션/UI 텍스트
const FILTER_TEXTS = [
  'Notice artiste',
  "Notice de l'artiste",
  'AWARE',
  'Navigart',
  'Retour',
  'Partager',
  'Télécharger',
  'Imprimer',
  'Fermer',
  'Menu',
  'Recherche',
  'Accueil',
  'Collection',
  'MUSÉE',
  'mamparis',
  'En savoir plus',
  'Voir plus',
  'Afficher'
];

async function scrapeDetail(context, url, listImage, retryCount = 0) {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    
    // 실제 컨텐츠 로딩 대기 - 이미지나 아티스트 정보가 나타날 때까지
    try {
      await page.waitForSelector('img[src*="navigart.fr"]', { timeout: 8000 });
    } catch {
      // 이미지가 없어도 계속
    }
    
    // 추가 렌더링 대기
    await page.waitForTimeout(2000);
    
    const data = await page.evaluate((filterTexts) => {
      // 이미지 찾기
      let image = null;
      const imgElements = Array.from(document.querySelectorAll('img'));
      for (const img of imgElements) {
        const src = img.src || '';
        if (src.includes('images.navigart.fr') && !src.includes('data:image')) {
          // /400/ -> /1000/, 중복 방지
          image = src.replace(/\/\d+\//g, '/1000/').replace('/1000/1000/', '/1000/');
          break;
        }
        const dataSrc = img.getAttribute('data-src') || '';
        if (dataSrc.includes('images.navigart.fr')) {
          image = dataSrc.replace(/\/\d+\//g, '/1000/').replace('/1000/1000/', '/1000/');
          break;
        }
      }
      
      // 메인 컨텐츠 영역에서 텍스트 추출
      const mainContent = document.querySelector('.artwork-detail, .notice, .content, main, [class*="detail"]');
      const textSource = mainContent || document.body;
      const pageText = textSource.innerText;
      
      // 필터링 - UI 텍스트 제거
      const lines = pageText.split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0)
        .filter(l => !filterTexts.some(ft => l.toLowerCase().includes(ft.toLowerCase())))
        .filter(l => l.length < 200) // 너무 긴 줄 제외
        .filter(l => !/^(http|www\.)/i.test(l)); // URL 제외
      
      let artist = null;
      let title = null;
      let year = null;
      let medium = null;
      let dimensions = null;
      
      // 첫 줄이 대시로 시작하면 작가명
      const hasDash = lines[0]?.startsWith('-') || lines[0]?.startsWith('–') || lines[0]?.startsWith('—');
      
      if (hasDash) {
        // 패턴 A: - Artist Name
        artist = lines[0].replace(/^[-–—]\s*/, '').trim();
        // 두번째 줄이 제목
        if (lines[1] && !filterTexts.some(ft => lines[1].includes(ft))) {
          title = lines[1];
        }
      } else {
        // 패턴 B: Artist Name (첫 줄)
        artist = lines[0] || null;
        
        // 두번째 줄이 생몰년인지 확인 (1880 - 1960 같은 패턴)
        const isLifespan = lines[1] && /^\d{4}/.test(lines[1]) && /[-–,]/.test(lines[1]);
        
        // 제목은 생몰년 다음 줄 또는 두번째 줄
        const titleIdx = isLifespan ? 2 : 1;
        if (lines[titleIdx] && !filterTexts.some(ft => lines[titleIdx].includes(ft))) {
          title = lines[titleIdx];
        }
      }
      
      // 연도, 기법, 크기 찾기
      for (let i = 0; i < Math.min(lines.length, 20); i++) {
        const line = lines[i];
        
        // 연도: "vers 1920" 또는 "1920"
        if (!year && /^(vers\s+)?\d{4}$/.test(line)) {
          year = line.trim();
        }
        
        // 기법: Peinture, Huile sur toile 등
        if (!medium && /^(Peinture|Huile|Acrylique|Tempera|Gouache|Aquarelle|Encre)/i.test(line)) {
          medium = line;
        }
        
        // 크기: 46 x 65 cm
        if (!dimensions && /^\d+[,.]?\d*\s*[x×]\s*\d+[,.]?\d*\s*(cm|mm)?$/i.test(line)) {
          dimensions = line;
        }
      }
      
      // 제목 검증 - 연도나 기법이 제목이 되면 안됨
      if (title) {
        if (/^(vers\s+)?\d{4}$/.test(title)) title = null;
        if (/^(Peinture|Huile|Acrylique)/i.test(title)) title = null;
        if (/^\d+[,.]?\d*\s*[x×]/.test(title)) title = null;
      }
      
      return { image, artist, title, year, medium, dimensions };
    }, FILTER_TEXTS);
    
    await page.close();
    
    // 데이터가 없으면 재시도
    if (!data.artist && !data.title && retryCount < 2) {
      return scrapeDetail(context, url, listImage, retryCount + 1);
    }
    
    return { ...data, listImage, detailUrl: url };
  } catch (e) {
    await page.close();
    
    // 오류시 재시도
    if (retryCount < 2) {
      await new Promise(r => setTimeout(r, 1000));
      return scrapeDetail(context, url, listImage, retryCount + 1);
    }
    
    return { error: e.message, detailUrl: url, listImage };
  }
}

async function scrape() {
  console.log('🎨 MAM Paris - PARALLEL Scraper v2 (개선된 버전)');
  console.log('='.repeat(50));
  console.log(`테스트: ${TEST_PAGES}페이지, 병렬: ${PARALLEL_COUNT}개씩`);
  console.log('개선사항: 컨텐츠 로딩 대기, UI텍스트 필터링, 재시도');
  console.log('='.repeat(50) + '\n');
  
  const startTime = Date.now();
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const mainPage = await context.newPage();
  
  const artworks = [];
  let allItems = [];
  let unknownCount = 0;
  
  try {
    // Step 1: Collect all items from pages
    console.log('📋 Step 1: 리스트 수집...');
    for (let pageNum = 1; pageNum <= TEST_PAGES; pageNum++) {
      const pageUrl = `${BASE_URL}?page=${pageNum}&sort=random&layout=box`;
      await mainPage.goto(pageUrl, { waitUntil: 'networkidle', timeout: 60000 });
      await mainPage.waitForTimeout(2000);
      await mainPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await mainPage.waitForTimeout(1500);
      
      const items = await mainPage.$$eval('a[href*="/artwork/"]', elements => {
        const seen = new Set();
        return elements.filter(el => {
          if (seen.has(el.href)) return false;
          seen.add(el.href);
          return true;
        }).map(el => {
          const img = el.querySelector('img');
          let listImage = null;
          if (img) {
            const src = img.src || img.getAttribute('data-src') || '';
            if (src.includes('navigart.fr') && !src.includes('data:image')) {
              listImage = src.replace(/\/\d+\//g, '/1000/').replace('/1000/1000/', '/1000/');
            }
          }
          return { detailUrl: el.href, listImage };
        });
      });
      
      allItems = allItems.concat(items);
      console.log(`  페이지 ${pageNum}: ${items.length}개`);
    }
    
    console.log(`\n✅ 총 ${allItems.length}개 항목 수집\n`);
    
    // Step 2: Parallel scraping
    console.log(`📝 Step 2: 병렬 스크래핑 (${PARALLEL_COUNT}개씩)...`);
    
    for (let i = 0; i < allItems.length; i += PARALLEL_COUNT) {
      const batch = allItems.slice(i, i + PARALLEL_COUNT);
      const batchNum = Math.floor(i / PARALLEL_COUNT) + 1;
      const totalBatches = Math.ceil(allItems.length / PARALLEL_COUNT);
      
      process.stdout.write(`\r  배치 ${batchNum}/${totalBatches}: `);
      
      const results = await Promise.all(
        batch.map(item => scrapeDetail(context, item.detailUrl, item.listImage))
      );
      
      for (const data of results) {
        if (!data.error) {
          const hasData = data.artist || data.title;
          if (!hasData) unknownCount++;
          
          artworks.push({
            id: `mam-painting-${artworks.length + 1}`,
            title: data.title || 'Sans titre',
            artist: data.artist || 'Artiste inconnu',
            year: data.year || null,
            image: data.image || data.listImage,
            dimensions: data.dimensions || null,
            medium: data.medium || 'Peinture',
            source: 'Musée d\'Art Moderne de Paris',
            collectionArea: 'Painting',
            detailUrl: data.detailUrl
          });
          process.stdout.write('✓');
        } else {
          process.stdout.write('✗');
        }
      }
      
      // Delay between batches
      await new Promise(r => setTimeout(r, 500));
    }
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    // 통계
    const withData = artworks.filter(a => a.artist !== 'Artiste inconnu' && a.title !== 'Sans titre').length;
    const successRate = ((withData / artworks.length) * 100).toFixed(1);
    
    // Save results
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify({ 
      testDate: new Date().toISOString(),
      testPages: TEST_PAGES,
      parallelCount: PARALLEL_COUNT,
      elapsed: `${elapsed}s`,
      totalCollected: artworks.length,
      withData,
      unknownCount,
      successRate: `${successRate}%`,
      artworks 
    }, null, 2));
    
    const finalOutput = {
      museum: 'Musée d\'Art Moderne de Paris',
      museumId: 'mam-paris',
      collectionName: 'Painting Collection',
      scrapedAt: new Date().toISOString(),
      totalObjects: artworks.length,
      coverImage: artworks[0]?.image || '',
      objects: artworks
    };
    fs.writeFileSync(FINAL_OUTPUT, JSON.stringify(finalOutput, null, 2));
    
    console.log(`\n\n${'='.repeat(50)}`);
    console.log(`✅ 완료!`);
    console.log(`  - 총 수집: ${artworks.length}개`);
    console.log(`  - 데이터 있음: ${withData}개 (${successRate}%)`);
    console.log(`  - 소요시간: ${elapsed}초`);
    console.log(`📁 저장: ${FINAL_OUTPUT}`);
    
    console.log('\n=== 샘플 (데이터 있는 것) ===');
    const samples = artworks.filter(a => a.artist !== 'Artiste inconnu').slice(0, 5);
    samples.forEach((art, i) => {
      console.log(`${i + 1}. "${art.title}" - ${art.artist} (${art.year || '연도 미상'})`);
    });
    
  } catch (e) {
    console.error('\n❌ 오류:', e.message);
  }
  
  await browser.close();
}

scrape();
