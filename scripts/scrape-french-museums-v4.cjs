/**
 * 프랑스 미술관 스크래퍼 V4 (고속 버전)
 * - 목록 페이지에서 데이터 추출 + URL 파싱으로 작가/제목 보완
 * - MAMCS: 4개 카테고리 분리
 * - 병렬 처리로 속도 향상
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../public/data');
const LOG_DIR = path.join(__dirname, '../downloads');

const MUSEUMS = {
  mamcs: {
    name: 'Musée d\'Art Moderne et Contemporain de Strasbourg',
    city: 'Strasbourg',
    country: 'France'
  },
  rouen: {
    name: 'Musée des Beaux-Arts de Rouen',
    city: 'Rouen',
    country: 'France'
  },
  lille: {
    name: 'Palais des Beaux-Arts de Lille',
    city: 'Lille',
    country: 'France'
  }
};

const MAMCS_CATEGORIES = {
  drawings: { filter: 'Dessin', artworkType: 'Drawing', fileName: 'mamcs-strasbourg-drawings-collection.json', maxPages: 60 },
  paintings: { filter: 'Peinture', artworkType: 'Painting', fileName: 'mamcs-strasbourg-paintings-collection.json', maxPages: 120 },
  photography: { filter: 'Photographie', artworkType: 'Photography', fileName: 'mamcs-strasbourg-photography-collection.json', maxPages: 60 },
  graphicdesign: { filter: 'Design%20graphique', artworkType: 'Graphic Design', fileName: 'mamcs-strasbourg-graphic-design-collection.json', maxPages: 40 }
};

const ROUEN_COLLECTIONS = [
  'impressionism', 'landscapes', 'the-renaissance', 'baroque-europe',
  'the-french-grand-siecle', 'romanticism', 'the-salon', 'portraits',
  'still-life', 'religious-art', 'sculpture', 'drawings'
];

const LILLE_CATEGORIES = [
  '16th-20th-century-Paintings', 'Antiquity', 'Middle-Ages-and-Renaissance',
  'Ceramics-and-Decorative-Arts', 'Drawings', 'Plans-in-Relief', 'Sculptures'
];

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
function timestamp() { return new Date().toLocaleTimeString('ko-KR', { hour12: false }); }
function log(prefix, msg) { console.log(`[${timestamp()}] [${prefix}] ${msg}`); }

// URL에서 작가명과 제목 파싱
function parseMAMCSUrl(url) {
  // 형식: /artwork/작가명-제목-id
  const match = url.match(/\/artwork\/([^?]+)/);
  if (!match) return { artist: null, title: null };
  
  const slug = match[1];
  const parts = slug.split('-');
  
  // 마지막 부분이 ID (숫자로 시작)
  let idIndex = parts.length - 1;
  for (let i = parts.length - 1; i >= 0; i--) {
    if (/^\d/.test(parts[i])) {
      idIndex = i;
      break;
    }
  }
  
  // 작가명은 보통 처음 2-3개 부분
  // 이름 패턴: 첫글자 대문자
  let artistParts = [];
  let titleStart = 0;
  
  for (let i = 0; i < Math.min(4, idIndex); i++) {
    const part = parts[i];
    // 작가명인지 판단 (짧은 이름 + 대문자 시작)
    if (part.length <= 15 && /^[a-z]/.test(part)) {
      artistParts.push(part);
      titleStart = i + 1;
    } else {
      break;
    }
  }
  
  // 작가명 조합 (첫글자 대문자로)
  const artist = artistParts.length > 0 
    ? artistParts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
    : null;
  
  // 제목은 나머지 부분
  const titleParts = parts.slice(titleStart, idIndex);
  const title = titleParts.length > 0
    ? titleParts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
    : null;
  
  return { artist, title };
}

// ========================================
// MAMCS Navigart 스크래퍼 (고속)
// ========================================
async function scrapeMAMCSCategory(browser, categoryKey) {
  const category = MAMCS_CATEGORIES[categoryKey];
  const artworks = [];
  let consecutiveEmpty = 0;
  
  log(`MAMCS ${category.artworkType}`, '🏛️ 스크래핑 시작...');
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  
  for (let page = 1; page <= category.maxPages && consecutiveEmpty < 3; page++) {
    const url = `https://www.navigart.fr/mamcs/artworks/tree_domain_all/${category.filter}/checkbox:withimage/Avec%20image?page=${page}`;
    const browserPage = await context.newPage();
    
    try {
      await browserPage.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      await delay(4000);
      
      // 스크롤로 모든 이미지 로드
      for (let i = 0; i < 8; i++) {
        await browserPage.evaluate(() => window.scrollBy(0, 600));
        await delay(400);
      }
      
      // 모든 작품 카드에서 데이터 추출
      const pageData = await browserPage.evaluate((artType) => {
        const items = [];
        const artworkLinks = document.querySelectorAll('a[href*="/artwork/"]');
        const uniqueUrls = new Set();
        
        artworkLinks.forEach(link => {
          const href = link.href;
          if (uniqueUrls.has(href)) return;
          uniqueUrls.add(href);
          
          // 링크 근처의 이미지 찾기
          const parent = link.closest('div');
          const grandParent = parent?.parentElement;
          const container = grandParent?.parentElement || grandParent;
          
          let img = container?.querySelector('img[src*="navigart"]');
          if (!img) img = parent?.querySelector('img');
          
          let imageUrl = img?.src || '';
          if (imageUrl.includes('/400/')) {
            imageUrl = imageUrl.replace('/400/', '/1200/');
          }
          
          if (imageUrl && !imageUrl.startsWith('data:')) {
            items.push({
              sourceUrl: href,
              imageUrl,
              artworkType: artType
            });
          }
        });
        
        return items;
      }, category.artworkType);
      
      if (pageData.length === 0) {
        consecutiveEmpty++;
        log(`MAMCS ${category.artworkType}`, `   Page ${page}: 0개 (빈 페이지 ${consecutiveEmpty}/3)`);
      } else {
        consecutiveEmpty = 0;
        
        // URL에서 작가/제목 파싱
        for (const item of pageData) {
          const parsed = parseMAMCSUrl(item.sourceUrl);
          
          artworks.push({
            id: `mamcs-${categoryKey}-${artworks.length}`,
            title: parsed.title || 'Untitled',
            artist: parsed.artist || 'Unknown',
            year: null,
            imageUrl: item.imageUrl,
            medium: category.artworkType,
            artworkType: category.artworkType,
            sourceUrl: item.sourceUrl,
            museum: MUSEUMS.mamcs.name,
            city: MUSEUMS.mamcs.city,
            country: MUSEUMS.mamcs.country
          });
        }
        
        log(`MAMCS ${category.artworkType}`, `📄 Page ${page}: ${pageData.length}개 (누적 ${artworks.length}개)`);
      }
    } catch (e) {
      log(`MAMCS ${category.artworkType}`, `❌ Page ${page} 에러: ${e.message.slice(0, 50)}`);
      consecutiveEmpty++;
    } finally {
      await browserPage.close();
    }
    
    await delay(500);
  }
  
  await context.close();
  log(`MAMCS ${category.artworkType}`, `✅ 완료: ${artworks.length}개`);
  
  return { categoryKey, artworks };
}

// ========================================
// Rouen MBA 스크래퍼
// ========================================
async function scrapeRouen(browser) {
  const artworks = [];
  
  log('Rouen MBA', '🏛️ 스크래핑 시작...');
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  
  for (const collection of ROUEN_COLLECTIONS) {
    const listUrl = `https://mbarouen.fr/en/collections/${collection}`;
    log('Rouen MBA', `📂 ${collection} 수집 중...`);
    
    const listPage = await context.newPage();
    
    try {
      await listPage.goto(listUrl, { waitUntil: 'networkidle', timeout: 60000 });
      await delay(2000);
      
      // 작품 링크 수집
      const links = await listPage.$$eval('a[href*="/oeuvres/"]', els => 
        [...new Set(els.map(a => a.href).filter(h => h.includes('/oeuvres/')))]
      );
      
      log('Rouen MBA', `   ${links.length}개 발견`);
      
      // 상세 페이지 병렬 처리 (3개씩)
      for (let i = 0; i < links.length; i += 3) {
        const batch = links.slice(i, i + 3);
        
        const results = await Promise.all(batch.map(async (link) => {
          const detailPage = await context.newPage();
          try {
            await detailPage.goto(link, { waitUntil: 'networkidle', timeout: 25000 });
            await delay(1000);
            
            const data = await detailPage.evaluate((collName) => {
              const title = document.querySelector('h1.title')?.innerText?.trim();
              const artistH2 = document.querySelector('h2:not(.block-title)')?.innerText?.trim();
              const mainContent = document.querySelector('.node-oeuvre, main')?.innerText || '';
              
              let year = null, medium = null;
              const dateMatch = mainContent.match(/DATE\s*:\s*(\d{4})/i);
              if (dateMatch) year = dateMatch[1];
              const mediumMatch = mainContent.match(/MEDIUM\s*:\s*([^\n]+)/i);
              if (mediumMatch) medium = mediumMatch[1].trim();
              
              const ogImage = document.querySelector('meta[property="og:image"]')?.content || '';
              
              return { title, artist: artistH2?.split('\n')[0], year, medium, imageUrl: ogImage, collection: collName };
            }, collection);
            
            return data.title ? { ...data, sourceUrl: link } : null;
          } catch (e) {
            return null;
          } finally {
            await detailPage.close();
          }
        }));
        
        for (const data of results) {
          if (data) {
            artworks.push({
              id: `rouen-mba-${artworks.length}`,
              title: data.title,
              artist: data.artist || 'Unknown',
              year: data.year,
              imageUrl: data.imageUrl || '',
              medium: data.medium || 'Unknown',
              artworkType: 'Painting',
              collection: data.collection,
              sourceUrl: data.sourceUrl,
              museum: MUSEUMS.rouen.name,
              city: MUSEUMS.rouen.city,
              country: MUSEUMS.rouen.country
            });
          }
        }
      }
      
      log('Rouen MBA', `   ${collection} 완료 (누적 ${artworks.length}개)`);
    } catch (e) {
      log('Rouen MBA', `❌ ${collection} 에러: ${e.message.slice(0, 50)}`);
    } finally {
      await listPage.close();
    }
    
    await delay(500);
  }
  
  await context.close();
  log('Rouen MBA', `✅ 완료: ${artworks.length}개`);
  return artworks;
}

// ========================================
// Lille PBA 스크래퍼
// ========================================
async function scrapeLille(browser) {
  const artworks = [];
  
  log('Lille PBA', '🏛️ 스크래핑 시작...');
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  
  for (const category of LILLE_CATEGORIES) {
    const listUrl = `https://pba.lille.fr/en/Collections/Highlights/${category}`;
    log('Lille PBA', `📂 ${category} 수집 중...`);
    
    const listPage = await context.newPage();
    
    try {
      await listPage.goto(listUrl, { waitUntil: 'networkidle', timeout: 60000 });
      await delay(2000);
      
      // 스크롤로 모든 작품 로드
      for (let i = 0; i < 15; i++) {
        await listPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await delay(400);
      }
      
      // 작품 링크 수집
      const links = await listPage.$$eval('a[href*="/Collections/Highlights/"]', els => 
        [...new Set(els.map(a => a.href).filter(h => 
          h.includes('/Highlights/') && 
          !h.includes('twitter') && !h.includes('facebook') &&
          h.split('/').length > 7
        ))]
      );
      
      log('Lille PBA', `   ${links.length}개 발견`);
      
      // 상세 페이지 병렬 처리 (3개씩)
      for (let i = 0; i < links.length; i += 3) {
        const batch = links.slice(i, i + 3);
        
        const results = await Promise.all(batch.map(async (link) => {
          const detailPage = await context.newPage();
          try {
            await detailPage.goto(link, { waitUntil: 'networkidle', timeout: 25000 });
            await delay(1000);
            
            const data = await detailPage.evaluate((cat) => {
              const title = document.querySelector('h1')?.innerText?.trim();
              const mainText = document.querySelector('main, .ez-zone-primary')?.innerText || '';
              const lines = mainText.split('\n').map(l => l.trim()).filter(l => l);
              
              let artist = null, year = null, medium = null, dimensions = null;
              
              for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line.toLowerCase().includes('oil on') || line.toLowerCase().includes('canvas') ||
                    line.toLowerCase().includes('bronze') || line.toLowerCase().includes('marble')) {
                  medium = line;
                }
                if (line.includes(' cm') && (line.includes('H.') || line.includes('L.'))) {
                  dimensions = line;
                }
                if (/^\d{4}\s*-\s*\d{4}$/.test(line) && i > 0) {
                  artist = lines[i-1];
                }
                if (/^\d{4}$/.test(line)) year = line;
              }
              
              const imgs = [...document.querySelectorAll('img')];
              let imageUrl = '';
              for (const img of imgs) {
                if (img.src.includes('/storage/images/') && img.src.includes('artwork')) {
                  imageUrl = img.src;
                  break;
                }
              }
              
              return { title, artist, year, medium, dimensions, imageUrl, category: cat };
            }, category);
            
            return data.title && data.title !== 'HIGHLIGHTS' ? { ...data, sourceUrl: link } : null;
          } catch (e) {
            return null;
          } finally {
            await detailPage.close();
          }
        }));
        
        for (const data of results) {
          if (data) {
            artworks.push({
              id: `lille-pba-${artworks.length}`,
              title: data.title,
              artist: data.artist || 'Unknown',
              year: data.year,
              imageUrl: data.imageUrl || '',
              medium: data.medium || 'Unknown',
              artworkType: data.category.replace(/-/g, ' '),
              dimensions: data.dimensions,
              sourceUrl: data.sourceUrl,
              museum: MUSEUMS.lille.name,
              city: MUSEUMS.lille.city,
              country: MUSEUMS.lille.country
            });
          }
        }
      }
      
      log('Lille PBA', `   ${category} 완료 (누적 ${artworks.length}개)`);
    } catch (e) {
      log('Lille PBA', `❌ ${category} 에러: ${e.message.slice(0, 50)}`);
    } finally {
      await listPage.close();
    }
    
    await delay(500);
  }
  
  await context.close();
  log('Lille PBA', `✅ 완료: ${artworks.length}개`);
  return artworks;
}

// ========================================
// 메인 실행
// ========================================
async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  🏛️  French Museums Scraper V4 (고속 버전)');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  시작 시간: ${new Date().toLocaleString()}`);
  console.log('───────────────────────────────────────────────────────────────\n');
  
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  
  const browser = await chromium.launch({ headless: true });
  const startTime = Date.now();
  const results = {};
  
  try {
    // MAMCS 4개 카테고리 병렬 실행
    log('Main', '🚀 MAMCS 4개 카테고리 병렬 스크래핑 시작...');
    
    const mamcsPromises = Object.keys(MAMCS_CATEGORIES).map(key => 
      scrapeMAMCSCategory(browser, key)
    );
    
    // Rouen, Lille도 동시 시작
    const rouenPromise = scrapeRouen(browser);
    const lillePromise = scrapeLille(browser);
    
    // 모두 완료 대기
    const [mamcsResults, rouenArtworks, lilleArtworks] = await Promise.all([
      Promise.all(mamcsPromises),
      rouenPromise,
      lillePromise
    ]);
    
    // MAMCS 결과 저장
    for (const { categoryKey, artworks } of mamcsResults) {
      const category = MAMCS_CATEGORIES[categoryKey];
      const output = {
        museum: MUSEUMS.mamcs.name,
        collection: `MAMCS Strasbourg - ${category.artworkType}`,
        artworkType: category.artworkType,
        city: MUSEUMS.mamcs.city,
        country: MUSEUMS.mamcs.country,
        exhibitionType: 'permanent',
        scrapedAt: new Date().toISOString(),
        totalArtworks: artworks.length,
        artworks
      };
      fs.writeFileSync(path.join(OUTPUT_DIR, category.fileName), JSON.stringify(output, null, 2));
      results[`MAMCS ${category.artworkType}`] = artworks.length;
    }
    
    // Rouen 저장
    const rouenOutput = {
      museum: MUSEUMS.rouen.name,
      city: MUSEUMS.rouen.city,
      country: MUSEUMS.rouen.country,
      exhibitionType: 'permanent',
      scrapedAt: new Date().toISOString(),
      totalArtworks: rouenArtworks.length,
      artworks: rouenArtworks
    };
    fs.writeFileSync(path.join(OUTPUT_DIR, 'musee-beaux-arts-rouen-collection.json'), JSON.stringify(rouenOutput, null, 2));
    results['Rouen MBA'] = rouenArtworks.length;
    
    // Lille 저장
    const lilleOutput = {
      museum: MUSEUMS.lille.name,
      city: MUSEUMS.lille.city,
      country: MUSEUMS.lille.country,
      exhibitionType: 'permanent',
      scrapedAt: new Date().toISOString(),
      totalArtworks: lilleArtworks.length,
      artworks: lilleArtworks
    };
    fs.writeFileSync(path.join(OUTPUT_DIR, 'palais-beaux-arts-lille-collection.json'), JSON.stringify(lilleOutput, null, 2));
    results['Lille PBA'] = lilleArtworks.length;
    
  } finally {
    await browser.close();
  }
  
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  📊  스크래핑 결과 요약');
  console.log('═══════════════════════════════════════════════════════════════');
  
  let total = 0;
  for (const [name, count] of Object.entries(results)) {
    console.log(`  ✅ ${name}: ${count}개 작품`);
    total += count;
  }
  
  console.log('───────────────────────────────────────────────────────────────');
  console.log(`  총 작품 수: ${total}`);
  console.log(`  소요 시간: ${minutes}분 ${seconds}초`);
  console.log('═══════════════════════════════════════════════════════════════\n');
}

main().catch(console.error);
