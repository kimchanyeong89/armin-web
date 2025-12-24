/**
 * 프랑스 미술관 스크래퍼 V3
 * - 각 작품 상세 페이지에서 정확한 데이터 추출
 * - MAMCS: 4개 카테고리 분리 (Drawing, Painting, Photography, Graphic Design)
 * - Rouen MBA: 모든 컬렉션
 * - Lille PBA: 모든 하이라이트
 * 
 * 데이터 형식: title, artist, year, imageUrl, medium, artworkType, description, dimensions
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../public/data');
const LOG_DIR = path.join(__dirname, '../downloads');

// 미술관 정보
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

// MAMCS 카테고리별 URL
const MAMCS_CATEGORIES = {
  drawings: {
    filter: 'Dessin',
    artworkType: 'Drawing',
    fileName: 'mamcs-strasbourg-drawings-collection.json',
    maxPages: 60
  },
  paintings: {
    filter: 'Peinture',
    artworkType: 'Painting',
    fileName: 'mamcs-strasbourg-paintings-collection.json',
    maxPages: 120
  },
  photography: {
    filter: 'Photographie',
    artworkType: 'Photography',
    fileName: 'mamcs-strasbourg-photography-collection.json',
    maxPages: 60
  },
  graphicdesign: {
    filter: 'Design%20graphique',
    artworkType: 'Graphic Design',
    fileName: 'mamcs-strasbourg-graphic-design-collection.json',
    maxPages: 40
  }
};

// Rouen 컬렉션 목록
const ROUEN_COLLECTIONS = [
  'impressionism',
  'landscapes', 
  'the-renaissance',
  'baroque-europe',
  'the-french-grand-siecle',
  'romanticism',
  'the-salon',
  'portraits',
  'still-life',
  'religious-art',
  'sculpture',
  'drawings'
];

// Lille 카테고리 목록
const LILLE_CATEGORIES = [
  '16th-20th-century-Paintings',
  'Antiquity',
  'Middle-Ages-and-Renaissance',
  'Ceramics-and-Decorative-Arts',
  'Drawings',
  'Plans-in-Relief',
  'Sculptures'
];

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function timestamp() {
  return new Date().toLocaleTimeString('ko-KR', { hour12: false });
}

function log(prefix, msg) {
  console.log(`[${timestamp()}] [${prefix}] ${msg}`);
}

// ========================================
// MAMCS Navigart 스크래퍼
// ========================================
async function scrapeMAMCSCategory(context, categoryKey) {
  const category = MAMCS_CATEGORIES[categoryKey];
  const artworks = [];
  let page = 1;
  let consecutiveEmpty = 0;
  
  log(`MAMCS ${category.artworkType}`, '🏛️ 스크래핑 시작...');
  
  while (page <= category.maxPages && consecutiveEmpty < 3) {
    const url = `https://www.navigart.fr/mamcs/artworks/tree_domain_all/${category.filter}/checkbox:withimage/Avec%20image?page=${page}`;
    
    const browserPage = await context.newPage();
    
    try {
      await browserPage.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      await delay(3000);
      
      // 스크롤해서 모든 아이템 로드
      for (let i = 0; i < 5; i++) {
        await browserPage.evaluate(() => window.scrollBy(0, 800));
        await delay(300);
      }
      
      // 작품 링크 수집
      const links = await browserPage.$$eval('a[href*="/artwork/"]', els => 
        [...new Set(els.map(a => a.href).filter(h => h.includes('/artwork/')))]
      );
      
      if (links.length === 0) {
        consecutiveEmpty++;
        log(`MAMCS ${category.artworkType}`, `   Page ${page}: 0개 (빈 페이지 ${consecutiveEmpty}/3)`);
      } else {
        consecutiveEmpty = 0;
        
        // 각 링크에서 상세 정보 가져오기
        for (const link of links) {
          const detailPage = await context.newPage();
          try {
            await detailPage.goto(link, { waitUntil: 'networkidle', timeout: 30000 });
            await delay(1500);
            
            const data = await detailPage.evaluate((artType) => {
              // 텍스트 추출 헬퍼
              const getText = (selector) => document.querySelector(selector)?.innerText?.trim() || '';
              
              // 작가 (첫번째 trusted 요소 중 작가명)
              const artistEl = document.querySelector('h2, .artist-name');
              let artist = artistEl?.innerText?.trim() || 'Unknown';
              
              // 제목 (single-artwork-title-ua 클래스 또는 h1)
              const titleEl = document.querySelector('.single-artwork-title-ua, h1');
              let title = titleEl?.innerText?.trim() || 'Untitled';
              
              // trusted 클래스 요소들에서 정보 추출
              const trustedEls = [...document.querySelectorAll('.trusted')];
              let year = null;
              let medium = null;
              let dimensions = null;
              
              trustedEls.forEach(el => {
                const text = el.innerText?.trim();
                if (!text) return;
                
                // 연도 패턴 (4자리 숫자만)
                if (/^\d{4}$/.test(text)) {
                  year = text;
                }
                // 기법/재료 (sur toile, sur papier 등)
                else if (text.includes('sur ') || text.includes('huile') || text.includes('acrylique') || 
                         text.includes('encre') || text.includes('crayon') || text.includes('pastel') ||
                         text.includes('gouache') || text.includes('aquarelle')) {
                  medium = text;
                }
                // 크기 (cm 포함)
                else if (text.includes(' cm') || text.includes(' x ')) {
                  dimensions = text;
                }
                // 작가명 (첫글자 대문자 + 전체 대문자)
                else if (/^[A-Z][a-zà-ÿ]+\s+[A-Z]+$/.test(text) || /^[A-Z]+\s+[A-Z][a-zà-ÿ]+/.test(text)) {
                  artist = text;
                }
              });
              
              // 이미지
              const img = document.querySelector('img[src*="navigart"]');
              let imageUrl = img?.src || '';
              if (imageUrl.includes('/400/')) {
                imageUrl = imageUrl.replace('/400/', '/1200/');
              }
              
              return {
                title: title !== 'Untitled' ? title : null,
                artist: artist !== 'Unknown' ? artist : null,
                year,
                medium,
                dimensions,
                imageUrl,
                artworkType: artType
              };
            }, category.artworkType);
            
            if (data.imageUrl) {
              artworks.push({
                id: `mamcs-${categoryKey}-${artworks.length}`,
                title: data.title || 'Untitled',
                artist: data.artist || 'Unknown',
                year: data.year,
                imageUrl: data.imageUrl,
                medium: data.medium || category.artworkType,
                artworkType: category.artworkType,
                dimensions: data.dimensions,
                sourceUrl: link,
                museum: MUSEUMS.mamcs.name,
                city: MUSEUMS.mamcs.city,
                country: MUSEUMS.mamcs.country
              });
            }
          } catch (e) {
            // 상세 페이지 에러 무시
          } finally {
            await detailPage.close();
          }
        }
        
        log(`MAMCS ${category.artworkType}`, `📄 Page ${page}/${category.maxPages}: ${links.length}개 (누적 ${artworks.length}개)`);
      }
      
      page++;
    } catch (e) {
      log(`MAMCS ${category.artworkType}`, `❌ Page ${page} 에러: ${e.message}`);
      consecutiveEmpty++;
    } finally {
      await browserPage.close();
    }
    
    await delay(500);
  }
  
  log(`MAMCS ${category.artworkType}`, `✅ 완료: ${artworks.length}개`);
  return artworks;
}

// ========================================
// Rouen MBA 스크래퍼
// ========================================
async function scrapeRouen(context) {
  const artworks = [];
  
  log('Rouen MBA', '🏛️ 스크래핑 시작...');
  
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
      
      log('Rouen MBA', `   ${links.length}개 링크 발견`);
      
      // 각 작품 상세 페이지 스크래핑
      for (const link of links) {
        const detailPage = await context.newPage();
        
        try {
          await detailPage.goto(link, { waitUntil: 'networkidle', timeout: 30000 });
          await delay(1500);
          
          const data = await detailPage.evaluate((collName) => {
            // 제목
            const title = document.querySelector('h1.title')?.innerText?.trim();
            
            // 작가
            const artistH2 = document.querySelector('h2:not(.block-title)')?.innerText?.trim();
            
            // 본문에서 DATE, MEDIUM 추출
            const mainContent = document.querySelector('.node-oeuvre, main')?.innerText || '';
            
            let year = null;
            let medium = null;
            
            const dateMatch = mainContent.match(/DATE\s*:\s*(\d{4})/i);
            if (dateMatch) year = dateMatch[1];
            
            const mediumMatch = mainContent.match(/MEDIUM\s*:\s*([^\n]+)/i);
            if (mediumMatch) medium = mediumMatch[1].trim();
            
            // 설명 텍스트
            const descEl = document.querySelector('.field-name-body, .description');
            const description = descEl?.innerText?.trim()?.slice(0, 500);
            
            // 이미지 - OpenSeadragon 사용하므로 og:image 확인
            let imageUrl = document.querySelector('meta[property="og:image"]')?.content || '';
            
            // 대안: deepzoom 타일에서 추출
            if (!imageUrl) {
              const deepzoomImg = document.querySelector('img[src*="deepzoom"]');
              if (deepzoomImg) {
                const match = deepzoomImg.src.match(/deepzoom\/([a-f0-9]+)_files/);
                if (match) {
                  imageUrl = `https://mbarouen.fr/sites/default/files/styles/large/public/oeuvres/${match[1]}.jpg`;
                }
              }
            }
            
            return {
              title,
              artist: artistH2?.split('\n')[0], // 줄바꿈 전까지만
              year,
              medium,
              description,
              imageUrl,
              collection: collName
            };
          }, collection);
          
          if (data.title) {
            artworks.push({
              id: `rouen-mba-${artworks.length}`,
              title: data.title,
              artist: data.artist || 'Unknown',
              year: data.year,
              imageUrl: data.imageUrl || '',
              medium: data.medium || 'Unknown',
              artworkType: 'Painting',
              description: data.description,
              collection: data.collection,
              sourceUrl: link,
              museum: MUSEUMS.rouen.name,
              city: MUSEUMS.rouen.city,
              country: MUSEUMS.rouen.country
            });
          }
        } catch (e) {
          // 에러 무시
        } finally {
          await detailPage.close();
        }
      }
      
      log('Rouen MBA', `   ${collection} 완료 (누적 ${artworks.length}개)`);
    } catch (e) {
      log('Rouen MBA', `❌ ${collection} 에러: ${e.message}`);
    } finally {
      await listPage.close();
    }
    
    await delay(1000);
  }
  
  log('Rouen MBA', `✅ 완료: ${artworks.length}개`);
  return artworks;
}

// ========================================
// Lille PBA 스크래퍼
// ========================================
async function scrapeLille(context) {
  const artworks = [];
  
  log('Lille PBA', '🏛️ 스크래핑 시작...');
  
  for (const category of LILLE_CATEGORIES) {
    const listUrl = `https://pba.lille.fr/en/Collections/Highlights/${category}`;
    log('Lille PBA', `📂 ${category} 수집 중...`);
    
    const listPage = await context.newPage();
    
    try {
      await listPage.goto(listUrl, { waitUntil: 'networkidle', timeout: 60000 });
      await delay(2000);
      
      // 스크롤해서 모든 작품 로드
      let prevHeight = 0;
      for (let i = 0; i < 20; i++) {
        await listPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await delay(500);
        const newHeight = await listPage.evaluate(() => document.body.scrollHeight);
        if (newHeight === prevHeight) break;
        prevHeight = newHeight;
      }
      
      // 작품 링크 수집 (Highlights 내부 링크만)
      const links = await listPage.$$eval('a[href*="/Collections/Highlights/"]', els => 
        [...new Set(els.map(a => a.href).filter(h => 
          h.includes('/Highlights/') && 
          !h.includes('twitter') && 
          !h.includes('facebook') &&
          !h.endsWith('/Highlights/') &&
          h.split('/').length > 7 // 상세 페이지만
        ))]
      );
      
      log('Lille PBA', `   ${links.length}개 링크 발견`);
      
      // 각 작품 상세 페이지 스크래핑
      for (const link of links) {
        const detailPage = await context.newPage();
        
        try {
          await detailPage.goto(link, { waitUntil: 'networkidle', timeout: 30000 });
          await delay(1500);
          
          const data = await detailPage.evaluate((cat) => {
            // 제목
            const title = document.querySelector('h1')?.innerText?.trim();
            
            // 본문에서 정보 추출
            const mainText = document.querySelector('main, .ez-zone-primary')?.innerText || '';
            const lines = mainText.split('\n').map(l => l.trim()).filter(l => l);
            
            let artist = null;
            let year = null;
            let medium = null;
            let dimensions = null;
            
            // 패턴 매칭으로 정보 추출
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              
              // 미디엄 (Oil on canvas 등)
              if (line.toLowerCase().includes('oil on') || 
                  line.toLowerCase().includes('canvas') ||
                  line.toLowerCase().includes('bronze') ||
                  line.toLowerCase().includes('marble') ||
                  line.toLowerCase().includes('paper')) {
                medium = line;
              }
              
              // 크기 (H. xxx cm)
              if (line.includes(' cm') && (line.includes('H.') || line.includes('L.'))) {
                dimensions = line;
              }
              
              // 작가명 (이름 + 생몰년)
              if (/^\d{4}\s*-\s*\d{4}$/.test(line)) {
                // 바로 위 줄이 작가명
                if (i > 0 && !lines[i-1].includes('cm')) {
                  artist = lines[i-1];
                }
              }
              
              // 연도 (4자리 숫자만 있는 줄)
              if (/^\d{4}$/.test(line)) {
                year = line;
              }
            }
            
            // 이미지
            const imgs = [...document.querySelectorAll('img')];
            let imageUrl = '';
            for (const img of imgs) {
              if (img.src.includes('/storage/images/') && img.src.includes('artwork')) {
                imageUrl = img.src;
                break;
              }
            }
            
            return {
              title,
              artist,
              year,
              medium,
              dimensions,
              imageUrl,
              category: cat
            };
          }, category);
          
          if (data.title && data.title !== 'HIGHLIGHTS') {
            artworks.push({
              id: `lille-pba-${artworks.length}`,
              title: data.title,
              artist: data.artist || 'Unknown',
              year: data.year,
              imageUrl: data.imageUrl || '',
              medium: data.medium || 'Unknown',
              artworkType: category.replace(/-/g, ' '),
              dimensions: data.dimensions,
              sourceUrl: link,
              museum: MUSEUMS.lille.name,
              city: MUSEUMS.lille.city,
              country: MUSEUMS.lille.country
            });
          }
        } catch (e) {
          // 에러 무시
        } finally {
          await detailPage.close();
        }
      }
      
      log('Lille PBA', `   ${category} 완료 (누적 ${artworks.length}개)`);
    } catch (e) {
      log('Lille PBA', `❌ ${category} 에러: ${e.message}`);
    } finally {
      await listPage.close();
    }
    
    await delay(1000);
  }
  
  log('Lille PBA', `✅ 완료: ${artworks.length}개`);
  return artworks;
}

// ========================================
// 메인 실행
// ========================================
async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  🏛️  French Museums Scraper V3 (상세 페이지 버전)');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  시작 시간: ${new Date().toLocaleString()}`);
  console.log('───────────────────────────────────────────────────────────────\n');
  
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  
  const startTime = Date.now();
  const results = {};
  
  try {
    // 1. MAMCS 4개 카테고리 순차 실행
    for (const categoryKey of Object.keys(MAMCS_CATEGORIES)) {
      const category = MAMCS_CATEGORIES[categoryKey];
      const artworks = await scrapeMAMCSCategory(context, categoryKey);
      
      // 저장
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
      
      fs.writeFileSync(
        path.join(OUTPUT_DIR, category.fileName),
        JSON.stringify(output, null, 2)
      );
      
      results[`MAMCS ${category.artworkType}`] = artworks.length;
    }
    
    // 2. Rouen
    const rouenArtworks = await scrapeRouen(context);
    const rouenOutput = {
      museum: MUSEUMS.rouen.name,
      city: MUSEUMS.rouen.city,
      country: MUSEUMS.rouen.country,
      exhibitionType: 'permanent',
      scrapedAt: new Date().toISOString(),
      totalArtworks: rouenArtworks.length,
      artworks: rouenArtworks
    };
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'musee-beaux-arts-rouen-collection.json'),
      JSON.stringify(rouenOutput, null, 2)
    );
    results['Rouen MBA'] = rouenArtworks.length;
    
    // 3. Lille
    const lilleArtworks = await scrapeLille(context);
    const lilleOutput = {
      museum: MUSEUMS.lille.name,
      city: MUSEUMS.lille.city,
      country: MUSEUMS.lille.country,
      exhibitionType: 'permanent',
      scrapedAt: new Date().toISOString(),
      totalArtworks: lilleArtworks.length,
      artworks: lilleArtworks
    };
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'palais-beaux-arts-lille-collection.json'),
      JSON.stringify(lilleOutput, null, 2)
    );
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
