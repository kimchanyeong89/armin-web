/**
 * 🏛️ Multi-Museum Parallel Scraper
 * 여러 미술관을 동시에 스크래핑 (medium/artworkType 포함)
 * 
 * 대상:
 * 1. Palais des Beaux-Arts de Lille (Highlights)
 * 2. Musée des Beaux-Arts de Rouen (All Collections)
 * 3. MAMCS Strasbourg - Drawings
 * 4. MAMCS Strasbourg - Paintings
 * 5. MAMCS Strasbourg - Photography
 * 6. MAMCS Strasbourg - Graphic Design
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../public/data');
const LOG_DIR = path.join(__dirname, '../downloads');
const CONCURRENCY = 5;

// 결과 저장
const results = {
  startTime: new Date().toISOString(),
  museums: [],
  errors: [],
  summary: {}
};

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function log(museum, message) {
  const timestamp = new Date().toISOString().slice(11, 19);
  console.log(`[${timestamp}] [${museum}] ${message}`);
}

// ============================================
// 1. Palais des Beaux-Arts de Lille
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
    let previousHeight = 0;
    let stall = 0;
    while (stall < 5) {
      const currentHeight = await page.evaluate(() => document.body.scrollHeight);
      if (currentHeight === previousHeight) stall++;
      else { stall = 0; previousHeight = currentHeight; }
      await page.evaluate(() => window.scrollBy(0, 2000));
      await delay(500);
    }
    
    // 링크 수집
    const links = await page.evaluate(() => {
      const urls = [];
      document.querySelectorAll('a[href*="/en/Collections/Highlights/"]').forEach(a => {
        const href = a.href;
        if (href.split('/').length > 6 && !href.includes('twitter') && !href.includes('facebook')) {
          urls.push(href);
        }
      });
      return [...new Set(urls)];
    });
    
    log(MUSEUM, `🔗 ${links.length}개 링크 발견`);
    await page.close();
    
    // 작품 스크래핑
    const artworks = [];
    for (let i = 0; i < links.length; i += CONCURRENCY) {
      const batch = links.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(batch.map(async (url, j) => {
        const artPage = await context.newPage();
        try {
          await artPage.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
          await delay(1500);
          
          const data = await artPage.evaluate((urlPath) => {
            const title = document.querySelector('h1, .title, .artwork-title')?.textContent?.trim();
            if (!title) return null;
            
            let artist = 'Unknown';
            let year = null;
            let medium = '';
            let artworkType = '';
            let description = '';
            let dimensions = '';
            
            // URL에서 카테고리 추출
            const urlParts = urlPath.split('/');
            const highlightsIdx = urlParts.indexOf('Highlights');
            if (highlightsIdx > 0 && highlightsIdx + 1 < urlParts.length - 1) {
              artworkType = decodeURIComponent(urlParts[highlightsIdx + 1]).replace(/-/g, ' ');
            }
            
            // 메타 정보 추출
            const metaTexts = [];
            document.querySelectorAll('.field, .meta-item, dt, dd, p, li, .info, .detail').forEach(el => {
              metaTexts.push(el.textContent?.trim() || '');
            });
            
            const fullText = metaTexts.join(' ');
            
            // 작가 추출
            const artistPatterns = [
              /(?:artist|artiste|by|par|auteur)\s*:?\s*([^,\n]+)/i,
              /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s*\(/,
            ];
            for (const pattern of artistPatterns) {
              const match = fullText.match(pattern);
              if (match && match[1]) {
                artist = match[1].trim();
                break;
              }
            }
            
            // 연도 추출
            const yearMatch = fullText.match(/\b(1[4-9]\d{2}|20[0-2]\d)\b/);
            if (yearMatch) year = yearMatch[1];
            
            // 미디엄/기법 추출
            const mediumPatterns = [
              /(?:technique|medium|materials?|matériaux?)\s*:?\s*([^.;\n]+)/i,
              /(?:oil|watercolor|bronze|marble|canvas|paper|wood|fresco|tempera|acrylic|pastel)[^.;\n]*/i
            ];
            for (const pattern of mediumPatterns) {
              const match = fullText.match(pattern);
              if (match) {
                medium = match[1] ? match[1].trim() : match[0].trim();
                break;
              }
            }
            
            // 이미지
            const img = document.querySelector('.artwork-image img, .main-image img, article img, .content img, .visual img');
            let imageUrl = img?.src || '';
            
            // 설명
            const descEl = document.querySelector('.description, .notice, article p, .body');
            if (descEl) description = descEl.textContent?.trim().slice(0, 500);
            
            return { title, artist, year, imageUrl, medium, artworkType, description };
          }, url);
          
          await artPage.close();
          
          if (!data) return null;
          
          return {
            id: `lille-pba-${i + j}`,
            title: data.title,
            artist: data.artist || 'Unknown',
            year: data.year,
            imageUrl: data.imageUrl,
            medium: data.medium || '',
            artworkType: data.artworkType || 'Highlights',
            description: data.description || '',
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
// 2. Musée des Beaux-Arts de Rouen
// ============================================
async function scrapeRouenMBA() {
  const MUSEUM = 'Rouen MBA';
  const CONFIG = {
    id: 'musee-beaux-arts-rouen',
    name: 'Musée des Beaux-Arts de Rouen',
    baseUrl: 'https://mbarouen.fr',
    collectionsUrl: 'https://mbarouen.fr/en/collections',
    city: 'Rouen',
    country: 'France'
  };

  log(MUSEUM, '🏛️ 스크래핑 시작...');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });

  try {
    const page = await context.newPage();
    await page.goto(CONFIG.collectionsUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await delay(3000);
    
    // 컬렉션 페이지 수집
    const collectionPages = await page.evaluate(() => {
      const pages = [];
      document.querySelectorAll('a[href*="/en/collections/"], a[href*="/en/oeuvres"], a[href*="/collection"]').forEach(a => {
        const href = a.href;
        const text = a.textContent?.trim();
        if (href !== 'https://mbarouen.fr/en/collections' && 
            !href.includes('#') && 
            text && text.length > 2) {
          pages.push({
            url: href,
            name: text,
            category: href.split('/').pop()?.replace(/-/g, ' ') || ''
          });
        }
      });
      const unique = [];
      const seen = new Set();
      pages.forEach(p => {
        if (!seen.has(p.url)) { seen.add(p.url); unique.push(p); }
      });
      return unique;
    });
    
    log(MUSEUM, `📂 ${collectionPages.length}개 컬렉션 발견`);
    await page.close();
    
    const allArtworks = [];
    
    // 각 컬렉션 페이지 스크래핑
    for (const collection of collectionPages) {
      log(MUSEUM, `   📁 "${collection.name}" 스크래핑...`);
      
      const collPage = await context.newPage();
      try {
        await collPage.goto(collection.url, { waitUntil: 'networkidle', timeout: 45000 });
        await delay(3000);
        
        // 스크롤
        for (let i = 0; i < 10; i++) {
          await collPage.evaluate(() => window.scrollBy(0, 1000));
          await delay(500);
        }
        
        // 작품 카드 추출
        const cards = await collPage.evaluate((cat) => {
          const items = [];
          
          // 다양한 카드 셀렉터 시도
          const selectors = [
            '.artwork', '.card', '.item', 'article', '.teaser', 
            '.views-row', '.node', '.gallery-item', '.collection-item'
          ];
          
          let foundCards = [];
          for (const sel of selectors) {
            const els = document.querySelectorAll(sel);
            if (els.length > 0) {
              foundCards = els;
              break;
            }
          }
          
          foundCards.forEach(el => {
            const img = el.querySelector('img');
            const titleEl = el.querySelector('h2, h3, h4, .title, .name, a');
            const title = titleEl?.textContent?.trim();
            const link = el.querySelector('a')?.href;
            
            // 메타 정보 시도
            let artist = '';
            let year = '';
            let medium = '';
            
            const metaText = el.textContent || '';
            const yearMatch = metaText.match(/\b(1[4-9]\d{2}|20[0-2]\d)\b/);
            if (yearMatch) year = yearMatch[1];
            
            if (title && img?.src) {
              items.push({
                title,
                imageUrl: img.src,
                sourceUrl: link,
                category: cat,
                artist,
                year,
                medium
              });
            }
          });
          
          return items;
        }, collection.category);
        
        log(MUSEUM, `      ✅ ${cards.length}개 작품`);
        
        cards.forEach((card, i) => {
          allArtworks.push({
            id: `rouen-mba-${allArtworks.length}`,
            title: card.title,
            artist: card.artist || 'Unknown',
            year: card.year || null,
            imageUrl: card.imageUrl,
            medium: card.medium || '',
            artworkType: collection.category,
            description: '',
            sourceUrl: card.sourceUrl || collection.url,
            museum: CONFIG.name,
            city: CONFIG.city,
            country: CONFIG.country
          });
        });
        
        await collPage.close();
      } catch (e) {
        log(MUSEUM, `      ⚠️ 오류: ${e.message}`);
        await collPage.close();
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
// 3. MAMCS Strasbourg (Navigart) - 카테고리별
// ============================================
async function scrapeMAMCS(categoryKey) {
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
  let hasMore = true;
  const MAX_PAGES = 100;

  try {
    while (hasMore && pageNum <= MAX_PAGES) {
      const pageUrl = `https://www.navigart.fr/mamcs/artworks/tree_domain_all/${category.filter}/checkbox:withimage/Avec%20image?page=${pageNum}`;
      
      const page = await context.newPage();
      try {
        await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 60000 });
        await delay(4000);
        
        // 스크롤하여 이미지 로드
        for (let i = 0; i < 5; i++) {
          await page.evaluate(() => window.scrollBy(0, 1000));
          await delay(400);
        }
        
        // 작품 데이터 추출
        const pageData = await page.evaluate(() => {
          const items = [];
          
          // Navigart 카드 구조
          const cards = document.querySelectorAll('.artwork-card, .artwork-item, [class*="artwork"], a[href*="/artwork/"]');
          
          cards.forEach(card => {
            let href = card.href || card.querySelector('a')?.href || '';
            if (!href.includes('/artwork/')) return;
            
            // 이미지 찾기
            let img = card.querySelector('img');
            if (!img) {
              const parent = card.closest('[class*="card"]') || card.parentElement;
              img = parent?.querySelector('img');
            }
            
            let imageUrl = img?.src || '';
            if (imageUrl.includes('images.navigart.fr')) {
              imageUrl = imageUrl.replace('/400/', '/1200/').replace('/200/', '/1200/');
            }
            
            // 텍스트 정보
            const textContent = card.textContent?.trim() || '';
            
            if (imageUrl && !imageUrl.startsWith('data:') && href) {
              items.push({
                sourceUrl: href,
                imageUrl,
                rawText: textContent
              });
            }
          });
          
          return items;
        });
        
        if (pageData.length === 0) {
          hasMore = false;
        } else {
          log(MUSEUM, `📄 Page ${pageNum}: ${pageData.length}개 발견`);
          
          // 상세 페이지에서 정보 추출
          for (let i = 0; i < pageData.length; i += CONCURRENCY) {
            const batch = pageData.slice(i, i + CONCURRENCY);
            const batchResults = await Promise.all(batch.map(async (item) => {
              const detailPage = await context.newPage();
              try {
                await detailPage.goto(item.sourceUrl, { waitUntil: 'networkidle', timeout: 25000 });
                await delay(1500);
                
                const detail = await detailPage.evaluate(() => {
                  let title = '';
                  let artist = 'Unknown';
                  let year = null;
                  let medium = '';
                  let dimensions = '';
                  
                  // 제목
                  const titleEl = document.querySelector('h1, .artwork-title, .title, [class*="title"]');
                  if (titleEl) title = titleEl.textContent?.trim();
                  
                  // 작가
                  const artistEl = document.querySelector('.author, .artist, [class*="author"], [class*="artist"]');
                  if (artistEl) artist = artistEl.textContent?.trim();
                  
                  // 메타데이터
                  const metaElements = document.querySelectorAll('.field, .meta-item, .info-item, dt, dd, .detail-item, [class*="meta"]');
                  metaElements.forEach(el => {
                    const text = el.textContent?.trim() || '';
                    const lowerText = text.toLowerCase();
                    
                    if (lowerText.includes('date') || lowerText.includes('année') || lowerText.includes('year')) {
                      const match = text.match(/\b(1[4-9]\d{2}|20[0-2]\d)\b/);
                      if (match) year = match[1];
                    }
                    if (lowerText.includes('technique') || lowerText.includes('medium') || lowerText.includes('matér')) {
                      const parts = text.split(':');
                      if (parts.length > 1) medium = parts[1].trim();
                    }
                    if (lowerText.includes('dimension') || lowerText.includes('size')) {
                      const parts = text.split(':');
                      if (parts.length > 1) dimensions = parts[1].trim();
                    }
                  });
                  
                  // 페이지 전체에서 연도 추출
                  if (!year) {
                    const pageText = document.body.textContent || '';
                    const yearMatch = pageText.match(/\b(1[4-9]\d{2}|20[0-2]\d)\b/);
                    if (yearMatch) year = yearMatch[1];
                  }
                  
                  // 고화질 이미지
                  let imageUrl = '';
                  const img = document.querySelector('.artwork-image img, .main-image img, img[src*="images.navigart"]');
                  if (img) {
                    imageUrl = img.src?.replace('/400/', '/1200/').replace('/200/', '/1200/') || '';
                  }
                  
                  return { title, artist, year, medium, dimensions, imageUrl };
                });
                
                await detailPage.close();
                
                return {
                  ...detail,
                  sourceUrl: item.sourceUrl,
                  imageUrl: detail.imageUrl || item.imageUrl
                };
              } catch (e) {
                await detailPage.close();
                return {
                  title: 'Untitled',
                  artist: 'Unknown',
                  year: null,
                  medium: '',
                  sourceUrl: item.sourceUrl,
                  imageUrl: item.imageUrl
                };
              }
            }));
            
            batchResults.forEach(r => artworks.push(r));
          }
          
          pageNum++;
        }
        
        await page.close();
        
        if (pageData.length < 10) {
          hasMore = false;
        }
      } catch (e) {
        await page.close();
        log(MUSEUM, `⚠️ Page ${pageNum} 오류: ${e.message}`);
        hasMore = false;
      }
      
      await delay(1000);
    }
    
    // 최종 데이터 정리
    const finalArtworks = artworks.map((a, idx) => ({
      id: `mamcs-${categoryKey}-${idx}`,
      title: a.title || 'Untitled',
      artist: a.artist || 'Unknown',
      year: a.year,
      imageUrl: a.imageUrl,
      medium: a.medium || category.medium,
      artworkType: category.artworkType,
      dimensions: a.dimensions || '',
      sourceUrl: a.sourceUrl,
      museum: MUSEUM_INFO.name,
      city: MUSEUM_INFO.city,
      country: MUSEUM_INFO.country
    }));
    
    // 저장
    const outputData = {
      museum: MUSEUM_INFO.name,
      collection: category.name,
      artworkType: category.artworkType,
      city: MUSEUM_INFO.city,
      country: MUSEUM_INFO.country,
      exhibitionType: 'permanent',
      scrapedAt: new Date().toISOString(),
      totalArtworks: finalArtworks.length,
      artworks: finalArtworks
    };
    
    const outputPath = path.join(OUTPUT_DIR, `${category.id}-collection.json`);
    fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
    
    log(MUSEUM, `✅ 완료: ${finalArtworks.length}개 작품`);
    
    await browser.close();
    
    return {
      museum: MUSEUM_INFO.name,
      collection: category.name,
      id: category.id,
      success: true,
      count: finalArtworks.length,
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
  console.log('  🏛️  Multi-Museum Parallel Scraper');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  시작 시간: ${new Date().toLocaleString()}`);
  console.log('───────────────────────────────────────────────────────────────\n');
  
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  
  // 모든 스크래핑 작업 동시 실행
  const tasks = [
    { name: 'Lille PBA', fn: () => scrapeLillePBA() },
    { name: 'Rouen MBA', fn: () => scrapeRouenMBA() },
    { name: 'MAMCS Drawings', fn: () => scrapeMAMCS('drawings') },
    { name: 'MAMCS Paintings', fn: () => scrapeMAMCS('paintings') },
    { name: 'MAMCS Photography', fn: () => scrapeMAMCS('photography') },
    { name: 'MAMCS Graphic Design', fn: () => scrapeMAMCS('graphicdesign') },
  ];
  
  console.log(`📋 총 ${tasks.length}개 작업 동시 실행\n`);
  
  // 병렬 실행
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
  
  // 최종 로그 저장
  results.endTime = new Date().toISOString();
  results.summary = {
    totalArtworks,
    successCount,
    failCount: tasks.length - successCount,
    duration
  };
  
  const logPath = path.join(LOG_DIR, 'multi-museum-scrape-log.json');
  fs.writeFileSync(logPath, JSON.stringify(results, null, 2));
  console.log(`📝 로그 저장: ${logPath}\n`);
  
  return results;
}

// 단일 미술관 실행 옵션
const arg = process.argv[2];
if (arg) {
  if (arg === 'lille') {
    scrapeLillePBA().then(r => console.log('\n완료:', r)).catch(console.error);
  } else if (arg === 'rouen') {
    scrapeRouenMBA().then(r => console.log('\n완료:', r)).catch(console.error);
  } else if (['drawings', 'paintings', 'photography', 'graphicdesign'].includes(arg)) {
    scrapeMAMCS(arg).then(r => console.log('\n완료:', r)).catch(console.error);
  } else if (arg === 'mamcs') {
    // MAMCS 전체
    Promise.all([
      scrapeMAMCS('drawings'),
      scrapeMAMCS('paintings'),
      scrapeMAMCS('photography'),
      scrapeMAMCS('graphicdesign')
    ]).then(r => console.log('\n완료:', r)).catch(console.error);
  } else {
    main().catch(console.error);
  }
} else {
  main().catch(console.error);
}

module.exports = { scrapeLillePBA, scrapeRouenMBA, scrapeMAMCS };
