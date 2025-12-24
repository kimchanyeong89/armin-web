/**
 * 🏛️ Multi-Museum Parallel Scraper V2 - 개선된 버전
 * 사이트별 셀렉터 최적화 및 페이지네이션 수정
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../public/data');
const LOG_DIR = path.join(__dirname, '../downloads');

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function log(museum, message) {
  const timestamp = new Date().toISOString().slice(11, 19);
  console.log(`[${timestamp}] [${museum}] ${message}`);
}

// ============================================
// 1. Palais des Beaux-Arts de Lille - 개선
// ============================================
async function scrapeLillePBA() {
  const MUSEUM = 'Lille PBA';
  const CONFIG = {
    id: 'palais-beaux-arts-lille',
    name: 'Palais des Beaux-Arts de Lille',
    url: 'https://pba.lille.fr/en/Collections/Highlights',
    city: 'Lille',
    country: 'France'
  };

  log(MUSEUM, '🏛️ 스크래핑 시작...');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });

  try {
    const page = await context.newPage();
    await page.goto(CONFIG.url, { waitUntil: 'networkidle', timeout: 60000 });
    await delay(3000);
    
    // 스크롤하여 모든 작품 로드
    log(MUSEUM, '📜 페이지 스크롤 중...');
    for (let i = 0; i < 15; i++) {
      await page.evaluate(() => window.scrollBy(0, 1500));
      await delay(600);
    }
    
    // 링크 수집 (더 정확한 셀렉터)
    const links = await page.evaluate(() => {
      const urls = [];
      document.querySelectorAll('a[href*="/Collections/Highlights/"]').forEach(a => {
        const href = a.href;
        // 작품 상세 페이지만 (카테고리 페이지 제외)
        const parts = href.split('/');
        const highlightsIdx = parts.indexOf('Highlights');
        if (highlightsIdx > 0 && parts.length > highlightsIdx + 2) {
          urls.push(href);
        }
      });
      return [...new Set(urls)];
    });
    
    log(MUSEUM, `🔗 ${links.length}개 링크 발견`);
    await page.close();
    
    // 작품 스크래핑 (상세 페이지)
    const artworks = [];
    const CONCURRENCY = 3;
    
    for (let i = 0; i < links.length; i += CONCURRENCY) {
      const batch = links.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(batch.map(async (url, j) => {
        const artPage = await context.newPage();
        try {
          await artPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await delay(2000);
          
          const data = await artPage.evaluate(() => {
            // 제목 (h1에서 첫 번째 텍스트 노드만)
            const h1 = document.querySelector('h1');
            let title = '';
            if (h1) {
              // 첫 번째 텍스트만 추출
              const firstText = h1.childNodes[0]?.textContent?.trim() || h1.textContent?.trim();
              title = firstText.split('\n')[0].trim();
            }
            
            // 아티스트 (h1 내의 span이나 별도 요소)
            let artist = 'Unknown';
            const artistSpan = document.querySelector('h1 span, .artist, .author');
            if (artistSpan) {
              artist = artistSpan.textContent.trim();
            }
            
            // 연도
            let year = null;
            const yearMatch = document.body.textContent?.match(/\b(1[4-9]\d{2}|20[0-2]\d)\b/);
            if (yearMatch) year = yearMatch[1];
            
            // 미디엄 (기법)
            let medium = '';
            const mediumPatterns = [
              /(?:technique|medium|materials?|matériaux?|huile|oil|bronze|marble)\s*[:\s]*([^.;\n]+)/i
            ];
            const bodyText = document.body.textContent || '';
            for (const pattern of mediumPatterns) {
              const match = bodyText.match(pattern);
              if (match) {
                medium = match[1]?.trim() || match[0].trim();
                break;
              }
            }
            
            // 이미지 (고화질 우선)
            let imageUrl = '';
            const imgSelectors = [
              'img[src*="pba.lille.fr"]',
              '.visual img',
              '.artwork img',
              'article img',
              '.content img',
              'main img'
            ];
            for (const sel of imgSelectors) {
              const img = document.querySelector(sel);
              if (img?.src && !img.src.includes('logo') && !img.src.includes('icon')) {
                imageUrl = img.src;
                break;
              }
            }
            
            // 설명
            let description = '';
            const descEl = document.querySelector('.description, .body, article p');
            if (descEl) {
              description = descEl.textContent?.trim().slice(0, 500) || '';
            }
            
            return { title, artist, year, imageUrl, medium, description };
          });
          
          await artPage.close();
          
          if (!data.title || data.title.length < 2) return null;
          
          // URL에서 artworkType 추출
          const urlParts = url.split('/');
          const highlightsIdx = urlParts.indexOf('Highlights');
          let artworkType = '';
          if (highlightsIdx > 0 && highlightsIdx + 1 < urlParts.length) {
            artworkType = decodeURIComponent(urlParts[highlightsIdx + 1]).replace(/-/g, ' ');
          }
          
          return {
            id: `lille-pba-${i + j}`,
            title: data.title,
            artist: data.artist || 'Unknown',
            year: data.year,
            imageUrl: data.imageUrl,
            medium: data.medium || '',
            artworkType: artworkType,
            description: data.description,
            sourceUrl: url,
            museum: CONFIG.name,
            city: CONFIG.city,
            country: CONFIG.country
          };
        } catch (e) {
          await artPage.close();
          return null;
        }
      }));
      
      batchResults.filter(r => r).forEach(r => artworks.push(r));
      log(MUSEUM, `📝 진행: ${Math.min(i + CONCURRENCY, links.length)}/${links.length}`);
    }
    
    // 저장
    const outputData = {
      museum: CONFIG.name,
      city: CONFIG.city,
      country: CONFIG.country,
      exhibitionType: 'permanent',
      scrapedAt: new Date().toISOString(),
      totalArtworks: artworks.length,
      artworks
    };
    
    const outputPath = path.join(OUTPUT_DIR, `${CONFIG.id}-collection.json`);
    fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
    
    log(MUSEUM, `✅ 완료: ${artworks.length}개 작품`);
    
    await browser.close();
    
    return {
      museum: CONFIG.name,
      id: CONFIG.id,
      success: true,
      count: artworks.length,
      outputPath
    };
  } catch (e) {
    await browser.close();
    log(MUSEUM, `❌ 오류: ${e.message}`);
    return { museum: CONFIG.name, success: false, error: e.message };
  }
}

// ============================================
// 2. Musée des Beaux-Arts de Rouen - 개선
// ============================================
async function scrapeRouenMBA() {
  const MUSEUM = 'Rouen MBA';
  const CONFIG = {
    id: 'musee-beaux-arts-rouen',
    name: 'Musée des Beaux-Arts de Rouen',
    city: 'Rouen',
    country: 'France'
  };

  // 컬렉션 페이지 목록
  const COLLECTION_PAGES = [
    { url: 'https://mbarouen.fr/en/collections/impressionism', category: 'Impressionism', type: 'Painting' },
    { url: 'https://mbarouen.fr/en/collections/the-renaissance', category: 'Renaissance', type: 'Painting' },
    { url: 'https://mbarouen.fr/en/collections/baroque-europe', category: 'Baroque', type: 'Painting' },
    { url: 'https://mbarouen.fr/en/collections/the-french-grand-siecle', category: 'Grand Siècle', type: 'Painting' },
    { url: 'https://mbarouen.fr/en/collections/the-drawing-collection', category: 'Drawing Collection', type: 'Drawing' },
    { url: 'https://mbarouen.fr/en/collections/landscapes', category: 'Landscapes', type: 'Painting' },
    { url: 'https://mbarouen.fr/en/collections/sculpture', category: 'Sculpture', type: 'Sculpture' },
    { url: 'https://mbarouen.fr/en/collections/romanticism', category: 'Romanticism', type: 'Painting' },
    { url: 'https://mbarouen.fr/en/collections/the-salon', category: 'The Salon', type: 'Painting' },
    { url: 'https://mbarouen.fr/en/collections/portraits', category: 'Portraits', type: 'Painting' },
    { url: 'https://mbarouen.fr/en/collections/still-lifes', category: 'Still Life', type: 'Painting' },
    { url: 'https://mbarouen.fr/en/collections/rouen', category: 'Rouen', type: 'Painting' },
  ];

  log(MUSEUM, '🏛️ 스크래핑 시작...');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });

  const allArtworks = [];

  try {
    for (const collection of COLLECTION_PAGES) {
      log(MUSEUM, `📂 "${collection.category}" 수집 중...`);
      
      const page = await context.newPage();
      try {
        await page.goto(collection.url, { waitUntil: 'networkidle', timeout: 45000 });
        await delay(3000);
        
        // 스크롤
        for (let i = 0; i < 10; i++) {
          await page.evaluate(() => window.scrollBy(0, 1000));
          await delay(400);
        }
        
        // 작품 링크 수집 (/en/oeuvres/ 패턴)
        const artworkLinks = await page.evaluate(() => {
          const links = [];
          document.querySelectorAll('a[href*="/en/oeuvres/"], a[href*="/oeuvre/"]').forEach(a => {
            if (a.href && !links.includes(a.href)) {
              links.push(a.href);
            }
          });
          return links;
        });
        
        log(MUSEUM, `   발견: ${artworkLinks.length}개 작품 링크`);
        
        // 각 작품 상세 페이지 방문
        const CONCURRENCY = 3;
        for (let i = 0; i < artworkLinks.length; i += CONCURRENCY) {
          const batch = artworkLinks.slice(i, i + CONCURRENCY);
          const batchResults = await Promise.all(batch.map(async (artUrl) => {
            const artPage = await context.newPage();
            try {
              await artPage.goto(artUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
              await delay(1500);
              
              const data = await artPage.evaluate(() => {
                // 제목
                const h1 = document.querySelector('h1');
                const title = h1?.textContent?.trim() || '';
                
                // 아티스트
                let artist = 'Unknown';
                const artistEl = document.querySelector('.artist, .author, [class*="artist"], h2');
                if (artistEl) {
                  artist = artistEl.textContent?.trim();
                }
                
                // 연도
                let year = null;
                const bodyText = document.body.textContent || '';
                const yearMatch = bodyText.match(/\b(1[4-9]\d{2}|20[0-2]\d)\b/);
                if (yearMatch) year = yearMatch[1];
                
                // 미디엄
                let medium = '';
                const mediumMatch = bodyText.match(/(?:oil|canvas|paper|watercolor|bronze|marble|pastel|tempera|fresco)[^.;\n]*/i);
                if (mediumMatch) medium = mediumMatch[0].trim();
                
                // 이미지
                let imageUrl = '';
                const img = document.querySelector('.field-name-field-image img, article img, .content img');
                if (img?.src) imageUrl = img.src;
                
                // 설명
                let description = '';
                const descEl = document.querySelector('.body, .description, article p');
                if (descEl) description = descEl.textContent?.trim().slice(0, 500);
                
                return { title, artist, year, medium, imageUrl, description };
              });
              
              await artPage.close();
              
              if (!data.title) return null;
              
              return {
                ...data,
                sourceUrl: artUrl,
                category: collection.category,
                artworkType: collection.type
              };
            } catch (e) {
              await artPage.close();
              return null;
            }
          }));
          
          batchResults.filter(r => r).forEach(r => {
            allArtworks.push({
              id: `rouen-mba-${allArtworks.length}`,
              ...r,
              museum: CONFIG.name,
              city: CONFIG.city,
              country: CONFIG.country
            });
          });
        }
        
        await page.close();
      } catch (e) {
        log(MUSEUM, `   ⚠️ "${collection.category}" 오류: ${e.message}`);
        await page.close();
      }
    }
    
    // 저장
    const outputData = {
      museum: CONFIG.name,
      city: CONFIG.city,
      country: CONFIG.country,
      exhibitionType: 'permanent',
      scrapedAt: new Date().toISOString(),
      totalArtworks: allArtworks.length,
      artworks: allArtworks
    };
    
    const outputPath = path.join(OUTPUT_DIR, `${CONFIG.id}-collection.json`);
    fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
    
    log(MUSEUM, `✅ 완료: ${allArtworks.length}개 작품`);
    
    await browser.close();
    
    return {
      museum: CONFIG.name,
      id: CONFIG.id,
      success: true,
      count: allArtworks.length,
      outputPath
    };
  } catch (e) {
    await browser.close();
    log(MUSEUM, `❌ 오류: ${e.message}`);
    return { museum: CONFIG.name, success: false, error: e.message };
  }
}

// ============================================
// 3. MAMCS Strasbourg (Navigart) - 개선
// Navigart API 기반으로 전체 페이지 수집
// ============================================
async function scrapeMAMCS(categoryKey, maxPages = 50) {
  const CATEGORIES = {
    drawings: {
      id: 'mamcs-strasbourg-drawings',
      name: 'MAMCS Strasbourg - Drawings',
      filter: 'Dessin',
      artworkType: 'Drawing',
      medium: 'Drawing'
    },
    paintings: {
      id: 'mamcs-strasbourg-paintings',
      name: 'MAMCS Strasbourg - Paintings',
      filter: 'Peinture',
      artworkType: 'Painting',
      medium: 'Painting'
    },
    photography: {
      id: 'mamcs-strasbourg-photography',
      name: 'MAMCS Strasbourg - Photography',
      filter: 'Photographie',
      artworkType: 'Photography',
      medium: 'Photography'
    },
    graphicdesign: {
      id: 'mamcs-strasbourg-graphic-design',
      name: 'MAMCS Strasbourg - Graphic Design',
      filter: 'Design%20graphique',
      artworkType: 'Graphic Design',
      medium: 'Graphic Design'
    }
  };

  const MUSEUM_INFO = {
    name: 'Musée d\'Art Moderne et Contemporain de Strasbourg',
    city: 'Strasbourg',
    country: 'France'
  };

  const category = CATEGORIES[categoryKey];
  const MUSEUM = `MAMCS ${category.artworkType}`;
  
  log(MUSEUM, '🏛️ 스크래핑 시작...');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });

  const artworks = [];
  let pageNum = 1;
  let consecutiveEmpty = 0;

  try {
    while (pageNum <= maxPages && consecutiveEmpty < 3) {
      const pageUrl = `https://www.navigart.fr/mamcs/artworks/tree_domain_all/${category.filter}/checkbox:withimage/Avec%20image?page=${pageNum}`;
      
      const page = await context.newPage();
      try {
        await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 60000 });
        await delay(3000);
        
        // 충분히 스크롤하여 모든 이미지 로드
        for (let i = 0; i < 8; i++) {
          await page.evaluate(() => window.scrollBy(0, 800));
          await delay(300);
        }
        
        // 모든 작품 링크와 기본 정보 추출
        const pageData = await page.evaluate(() => {
          const items = [];
          
          // Navigart 구조: a[href*="/artwork/"] 링크들
          const artworkLinks = document.querySelectorAll('a[href*="/artwork/"]');
          
          artworkLinks.forEach(link => {
            const href = link.href;
            if (!href || items.some(i => i.sourceUrl === href)) return;
            
            // 링크의 부모에서 이미지 찾기
            let img = link.querySelector('img');
            if (!img) {
              const parent = link.closest('div');
              if (parent) img = parent.querySelector('img');
            }
            
            let imageUrl = img?.src || '';
            // 고화질로 변환
            if (imageUrl.includes('images.navigart.fr')) {
              imageUrl = imageUrl.replace(/\/\d+\//g, '/1200/');
            }
            
            // 텍스트에서 정보 추출
            const text = link.textContent?.trim() || '';
            const lines = text.split('\n').map(l => l.trim()).filter(l => l);
            
            // 작가명 추출 (대문자로 된 이름)
            let artist = '';
            let title = '';
            let year = '';
            
            lines.forEach(line => {
              // 연도 패턴
              const yearMatch = line.match(/\b(1[4-9]\d{2}|20[0-2]\d)\b/);
              if (yearMatch) year = yearMatch[1];
              
              // 작가명 (대문자)
              if (/^[A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ\s\-]+$/.test(line) && line.length > 2) {
                artist = line;
              }
            });
            
            // 제목은 작가명과 연도 사이
            const artistIdx = lines.findIndex(l => l === artist);
            if (artistIdx >= 0 && artistIdx + 1 < lines.length) {
              title = lines[artistIdx + 1];
            }
            
            if (imageUrl && !imageUrl.startsWith('data:')) {
              items.push({
                sourceUrl: href,
                imageUrl,
                artist,
                title,
                year
              });
            }
          });
          
          return items;
        });
        
        await page.close();
        
        if (pageData.length === 0) {
          consecutiveEmpty++;
          log(MUSEUM, `   Page ${pageNum}: 0개 (빈 페이지 ${consecutiveEmpty}/3)`);
        } else {
          consecutiveEmpty = 0;
          log(MUSEUM, `📄 Page ${pageNum}: ${pageData.length}개`);
          
          pageData.forEach(item => {
            artworks.push({
              id: `mamcs-${categoryKey}-${artworks.length}`,
              title: item.title || 'Untitled',
              artist: item.artist || 'Unknown',
              year: item.year || null,
              imageUrl: item.imageUrl,
              medium: category.medium,
              artworkType: category.artworkType,
              sourceUrl: item.sourceUrl,
              museum: MUSEUM_INFO.name,
              city: MUSEUM_INFO.city,
              country: MUSEUM_INFO.country
            });
          });
        }
        
        pageNum++;
      } catch (e) {
        await page.close();
        log(MUSEUM, `⚠️ Page ${pageNum} 오류: ${e.message}`);
        pageNum++;
        consecutiveEmpty++;
      }
      
      await delay(800);
    }
    
    // 저장
    const outputData = {
      museum: MUSEUM_INFO.name,
      collection: category.name,
      artworkType: category.artworkType,
      city: MUSEUM_INFO.city,
      country: MUSEUM_INFO.country,
      exhibitionType: 'permanent',
      scrapedAt: new Date().toISOString(),
      totalArtworks: artworks.length,
      artworks
    };
    
    const outputPath = path.join(OUTPUT_DIR, `${category.id}-collection.json`);
    fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
    
    log(MUSEUM, `✅ 완료: ${artworks.length}개 작품 (${pageNum - 1}페이지)`);
    
    await browser.close();
    
    return {
      museum: MUSEUM_INFO.name,
      collection: category.name,
      id: category.id,
      success: true,
      count: artworks.length,
      pages: pageNum - 1,
      outputPath
    };
  } catch (e) {
    await browser.close();
    log(MUSEUM, `❌ 오류: ${e.message}`);
    return { museum: MUSEUM_INFO.name, collection: category.name, success: false, error: e.message };
  }
}

// ============================================
// 메인 실행
// ============================================
async function main() {
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  🏛️  Multi-Museum Parallel Scraper V2');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  시작 시간: ${new Date().toLocaleString()}`);
  console.log('───────────────────────────────────────────────────────────────\n');
  
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  
  // 작업 정의 (MAMCS는 50페이지씩)
  const tasks = [
    { name: 'Lille PBA', fn: () => scrapeLillePBA() },
    { name: 'Rouen MBA', fn: () => scrapeRouenMBA() },
    { name: 'MAMCS Drawings', fn: () => scrapeMAMCS('drawings', 50) },
    { name: 'MAMCS Paintings', fn: () => scrapeMAMCS('paintings', 110) },  // 1619/15 ≈ 108
    { name: 'MAMCS Photography', fn: () => scrapeMAMCS('photography', 50) },
    { name: 'MAMCS Graphic Design', fn: () => scrapeMAMCS('graphicdesign', 30) },
  ];
  
  console.log(`📋 총 ${tasks.length}개 작업 동시 실행\n`);
  
  const startTime = Date.now();
  const taskResults = await Promise.allSettled(tasks.map(t => t.fn()));
  const duration = Math.round((Date.now() - startTime) / 1000);
  
  // 결과 정리
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  📊  스크래핑 결과 요약');
  console.log('═══════════════════════════════════════════════════════════════');
  
  let totalArtworks = 0;
  let successCount = 0;
  const results = { museums: [], errors: [] };
  
  taskResults.forEach((result, idx) => {
    const taskName = tasks[idx].name;
    
    if (result.status === 'fulfilled' && result.value.success) {
      console.log(`  ✅ ${taskName}: ${result.value.count}개 작품`);
      totalArtworks += result.value.count;
      successCount++;
      results.museums.push(result.value);
    } else {
      const error = result.status === 'rejected' ? result.reason : result.value?.error;
      console.log(`  ❌ ${taskName}: 실패 - ${error}`);
      results.errors.push({ task: taskName, error });
    }
  });
  
  console.log('───────────────────────────────────────────────────────────────');
  console.log(`  총 작품 수: ${totalArtworks}`);
  console.log(`  성공/전체: ${successCount}/${tasks.length}`);
  console.log(`  소요 시간: ${Math.floor(duration / 60)}분 ${duration % 60}초`);
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  // 로그 저장
  const logPath = path.join(LOG_DIR, 'multi-museum-scrape-v2-log.json');
  fs.writeFileSync(logPath, JSON.stringify({
    startTime: new Date(startTime).toISOString(),
    endTime: new Date().toISOString(),
    duration,
    totalArtworks,
    successCount,
    ...results
  }, null, 2));
  console.log(`📝 로그 저장: ${logPath}\n`);
  
  return results;
}

// 개별 실행 옵션
const arg = process.argv[2];
const maxPages = parseInt(process.argv[3]) || 50;

if (arg) {
  if (arg === 'lille') {
    scrapeLillePBA().then(r => console.log('\n완료:', r)).catch(console.error);
  } else if (arg === 'rouen') {
    scrapeRouenMBA().then(r => console.log('\n완료:', r)).catch(console.error);
  } else if (['drawings', 'paintings', 'photography', 'graphicdesign'].includes(arg)) {
    scrapeMAMCS(arg, maxPages).then(r => console.log('\n완료:', r)).catch(console.error);
  } else if (arg === 'mamcs') {
    Promise.all([
      scrapeMAMCS('drawings', 50),
      scrapeMAMCS('paintings', 110),
      scrapeMAMCS('photography', 50),
      scrapeMAMCS('graphicdesign', 30)
    ]).then(r => console.log('\n완료:', r)).catch(console.error);
  } else {
    main().catch(console.error);
  }
} else {
  main().catch(console.error);
}

module.exports = { scrapeLillePBA, scrapeRouenMBA, scrapeMAMCS };
