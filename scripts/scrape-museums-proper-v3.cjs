/**
 * Multi-Museum Proper Scraper V3
 * 
 * 각 미술관 전체 컬렉션을 제대로 스크래핑:
 * 1. MAMCS Strasbourg - 11,777개 작품 (이미지 있는 것만)
 * 2. Rouen MBA - 모든 컬렉션 카테고리 순회
 * 3. Lille PBA - Highlights (전체 컬렉션 API 없음)
 * 
 * 데이터 형식: title, artist, year, imageUrl, medium, artworkType, dimensions, description
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'data');
const LOG_DIR = path.join(__dirname, '..', 'downloads');

// 로그 함수
function log(task, message) {
  const time = new Date().toLocaleTimeString('ko-KR', { hour12: false });
  console.log(`[${time}] [${task}] ${message}`);
}

// ═══════════════════════════════════════════════════════════════
// MAMCS Strasbourg - Navigart API (전체 컬렉션, 이미지 있는 것만)
// ═══════════════════════════════════════════════════════════════
async function scrapeMAMCSFull() {
  const taskName = 'MAMCS Full';
  log(taskName, '🏛️ 전체 컬렉션 스크래핑 시작...');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  
  const artworks = [];
  const baseUrl = 'https://www.navigart.fr/mamcs/artworks/checkbox:withimage/Avec%20image';
  const totalPages = 1231; // 11,777개 작품 ÷ ~10개/페이지
  
  let consecutiveEmpty = 0;
  let page = await context.newPage();
  
  try {
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const url = `${baseUrl}?page=${pageNum}`;
      
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(1500);
        
        // 작품 카드들 수집
        const items = await page.$$eval('.artwork-item, .navigart-artwork, [class*="artwork"]', cards => {
          return cards.map(card => {
            // 이미지 URL
            const img = card.querySelector('img');
            const imageUrl = img?.src || img?.getAttribute('data-src') || '';
            
            // 링크 (상세 페이지)
            const link = card.querySelector('a');
            const sourceUrl = link?.href || '';
            
            // 텍스트 정보 추출
            const text = card.textContent || '';
            
            return { imageUrl, sourceUrl, text };
          }).filter(item => item.imageUrl && item.sourceUrl);
        });
        
        if (items.length === 0) {
          consecutiveEmpty++;
          if (consecutiveEmpty >= 5) {
            log(taskName, `⚠️ 5페이지 연속 빈 페이지, 종료`);
            break;
          }
          continue;
        }
        
        consecutiveEmpty = 0;
        
        // 각 작품 상세 페이지 방문해서 정보 추출
        for (const item of items) {
          try {
            const detailPage = await context.newPage();
            await detailPage.goto(item.sourceUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
            await detailPage.waitForTimeout(800);
            
            const details = await detailPage.evaluate(() => {
              const getText = (sel) => document.querySelector(sel)?.textContent?.trim() || '';
              const getAttr = (sel, attr) => document.querySelector(sel)?.getAttribute(attr) || '';
              
              // 아티스트 (링크 텍스트)
              const artistLink = document.querySelector('a[href*="/artworks/authors/"]');
              const artist = artistLink?.textContent?.trim() || 'Unknown';
              
              // 제목 (아티스트 다음 요소나 특정 클래스)
              const pageText = document.body.textContent || '';
              
              // 이미지
              const img = document.querySelector('img[src*="images.navigart.fr"]');
              const imageUrl = img?.src || '';
              
              // 메타 정보 추출 (텍스트 기반)
              const lines = pageText.split('\n').map(l => l.trim()).filter(l => l);
              
              let title = '';
              let year = '';
              let artworkType = '';
              let medium = '';
              let dimensions = '';
              
              // 아티스트 이름 다음 줄이 제목인 경우가 많음
              const artistIdx = lines.findIndex(l => l === artist);
              if (artistIdx >= 0 && artistIdx + 1 < lines.length) {
                title = lines[artistIdx + 1];
              }
              
              // 연도 패턴 찾기
              const yearMatch = pageText.match(/(\d{4})\s*[-–]?\s*(\d{4})?|vers\s+(\d{4})/i);
              if (yearMatch) {
                year = yearMatch[0];
              }
              
              // 작품 타입 (Peinture, Dessin, Photographie, etc.)
              const typeMatch = pageText.match(/(Peinture|Dessin|Photographie|Sculpture|Estampe|Design graphique|Objet)/i);
              if (typeMatch) {
                artworkType = typeMatch[1];
              }
              
              // 기법 (Huile sur toile, etc.)
              const mediumMatch = pageText.match(/(Huile sur toile|Huile sur bois|Aquarelle|Gouache|Encre|Crayon|Fusain|Pastel|Acrylique|Technique mixte|Tirage|Épreuve)/i);
              if (mediumMatch) {
                medium = mediumMatch[0];
              }
              
              // 크기
              const dimMatch = pageText.match(/(\d+(?:,\d+)?)\s*[x×]\s*(\d+(?:,\d+)?)\s*(?:cm|mm)?/i);
              if (dimMatch) {
                dimensions = dimMatch[0];
              }
              
              return { artist, title, year, artworkType, medium, dimensions, imageUrl };
            });
            
            await detailPage.close();
            
            // URL에서 제목/작가 파싱 (백업)
            const urlParts = item.sourceUrl.split('/artwork/')[1]?.split('-') || [];
            let parsedTitle = details.title;
            let parsedArtist = details.artist;
            
            if (!parsedTitle && urlParts.length > 2) {
              // URL: artist-name-artwork-title-id
              // 첫 2-3개는 보통 아티스트 이름
              const nameParts = [];
              const titleParts = [];
              let foundName = false;
              
              for (const part of urlParts) {
                if (part.match(/^\d+$/)) continue; // ID 스킵
                if (part.length < 3) continue;
                
                if (!foundName && part.match(/^[a-z]+$/i)) {
                  nameParts.push(part);
                  if (nameParts.length >= 2) foundName = true;
                } else {
                  titleParts.push(part);
                }
              }
              
              if (!parsedArtist || parsedArtist === 'Unknown') {
                parsedArtist = nameParts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
              }
              if (!parsedTitle) {
                parsedTitle = titleParts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
              }
            }
            
            artworks.push({
              id: `mamcs-${artworks.length}`,
              title: parsedTitle || 'Untitled',
              artist: parsedArtist || 'Unknown',
              year: details.year || null,
              imageUrl: details.imageUrl || item.imageUrl,
              medium: details.medium || '',
              artworkType: details.artworkType || '',
              dimensions: details.dimensions || '',
              sourceUrl: item.sourceUrl,
              museum: "Musée d'Art Moderne et Contemporain de Strasbourg",
              city: 'Strasbourg',
              country: 'France'
            });
            
          } catch (err) {
            // 상세 페이지 오류 시 기본 정보만 저장
            artworks.push({
              id: `mamcs-${artworks.length}`,
              title: 'Untitled',
              artist: 'Unknown',
              year: null,
              imageUrl: item.imageUrl,
              sourceUrl: item.sourceUrl,
              museum: "Musée d'Art Moderne et Contemporain de Strasbourg",
              city: 'Strasbourg',
              country: 'France'
            });
          }
        }
        
        if (pageNum % 10 === 0) {
          log(taskName, `📄 Page ${pageNum}/${totalPages}: 총 ${artworks.length}개`);
          
          // 중간 저장
          if (pageNum % 100 === 0) {
            const tempOutput = {
              museum: "Musée d'Art Moderne et Contemporain de Strasbourg",
              collection: "Full Collection",
              city: 'Strasbourg',
              country: 'France',
              exhibitionType: 'permanent',
              scrapedAt: new Date().toISOString(),
              totalArtworks: artworks.length,
              artworks
            };
            fs.writeFileSync(
              path.join(OUTPUT_DIR, 'mamcs-strasbourg-collection-temp.json'),
              JSON.stringify(tempOutput, null, 2)
            );
            log(taskName, `💾 중간 저장: ${artworks.length}개`);
          }
        }
        
      } catch (err) {
        log(taskName, `⚠️ Page ${pageNum} 오류: ${err.message}`);
      }
    }
    
  } finally {
    await browser.close();
  }
  
  // 최종 저장
  const output = {
    museum: "Musée d'Art Moderne et Contemporain de Strasbourg",
    collection: "Full Collection",
    city: 'Strasbourg',
    country: 'France',
    exhibitionType: 'permanent',
    scrapedAt: new Date().toISOString(),
    totalArtworks: artworks.length,
    artworks
  };
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'mamcs-strasbourg-full-collection.json'),
    JSON.stringify(output, null, 2)
  );
  
  log(taskName, `✅ 완료: ${artworks.length}개 작품`);
  return artworks.length;
}

// ═══════════════════════════════════════════════════════════════
// Rouen MBA - 각 컬렉션 페이지에서 모든 작품 수집
// ═══════════════════════════════════════════════════════════════
async function scrapeRouenMBAProper() {
  const taskName = 'Rouen MBA';
  log(taskName, '🏛️ 전체 컬렉션 스크래핑 시작...');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  
  const collections = [
    { name: 'Impressionism', url: 'https://mbarouen.fr/en/collections/impressionism' },
    { name: 'The Renaissance', url: 'https://mbarouen.fr/en/collections/the-renaissance' },
    { name: 'Baroque Europe', url: 'https://mbarouen.fr/en/collections/baroque-europe' },
    { name: 'Grand Siècle', url: 'https://mbarouen.fr/en/collections/the-french-grand-siecle' },
    { name: 'Drawing Collection', url: 'https://mbarouen.fr/en/collections/the-drawing-collection' },
    { name: 'Landscapes', url: 'https://mbarouen.fr/en/collections/landscapes' },
    { name: 'Sculpture', url: 'https://mbarouen.fr/en/collections/sculpture' },
    { name: 'Romanticism', url: 'https://mbarouen.fr/en/collections/romanticism' },
    { name: 'The Salon', url: 'https://mbarouen.fr/en/collections/the-salon' },
    { name: 'Portraits', url: 'https://mbarouen.fr/en/collections/portraits' },
    { name: 'Still Lifes', url: 'https://mbarouen.fr/en/collections/still-lifes' },
    { name: 'Rouen', url: 'https://mbarouen.fr/en/collections/rouen' }
  ];
  
  const artworks = [];
  const page = await context.newPage();
  
  try {
    for (const collection of collections) {
      log(taskName, `📂 "${collection.name}" 수집 중...`);
      
      await page.goto(collection.url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);
      
      // 무한 스크롤 처리
      let prevHeight = 0;
      let scrollAttempts = 0;
      while (scrollAttempts < 20) {
        const currentHeight = await page.evaluate(() => document.body.scrollHeight);
        if (currentHeight === prevHeight) break;
        prevHeight = currentHeight;
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1500);
        scrollAttempts++;
      }
      
      // 작품 링크 수집
      const links = await page.$$eval('a[href*="/en/oeuvres/"]', els => 
        [...new Set(els.map(a => a.href).filter(h => h.includes('/oeuvres/')))]
      );
      
      log(taskName, `   발견: ${links.length}개 작품 링크`);
      
      // 각 작품 상세 페이지 방문
      for (const link of links) {
        try {
          const detailPage = await context.newPage();
          await detailPage.goto(link, { waitUntil: 'domcontentloaded', timeout: 20000 });
          await detailPage.waitForTimeout(1000);
          
          const details = await detailPage.evaluate(() => {
            // 제목 - h1 태그
            const title = document.querySelector('h1')?.textContent?.trim() || '';
            
            // 작가 - h2 태그
            const artist = document.querySelector('h2')?.textContent?.trim() || '';
            
            // 연도/매체 정보
            const metaText = document.body.textContent || '';
            const dateMatch = metaText.match(/DATE\s*:\s*(\d{4})/i);
            const year = dateMatch ? dateMatch[1] : '';
            
            const mediumMatch = metaText.match(/MEDIUM\s*:\s*([^\n]+)/i);
            const medium = mediumMatch ? mediumMatch[1].trim() : '';
            
            // 이미지 - deepzoom 폴더의 원본 이미지
            const deepzoomImg = document.querySelector('img[src*="deepzoom"]');
            let imageUrl = '';
            if (deepzoomImg) {
              // deepzoom URL에서 원본 이미지 경로 추출
              const src = deepzoomImg.src;
              // 예: .../deepzoom/hash_files/10/0_0.jpg -> .../styles/large/public/hash.jpg
              const hashMatch = src.match(/deepzoom\/([a-f0-9]+)_files/);
              if (hashMatch) {
                imageUrl = `https://mbarouen.fr/sites/default/files/styles/large/public/oeuvres/${hashMatch[1]}.jpg`;
              }
            }
            
            // 설명
            const descEl = document.querySelector('.field-name-body, .description, p');
            const description = descEl?.textContent?.trim()?.substring(0, 500) || '';
            
            return { title, artist, year, medium, imageUrl, description };
          });
          
          await detailPage.close();
          
          if (details.title && details.title !== 'MUSÉE DES BEAUX-ARTS') {
            artworks.push({
              id: `rouen-mba-${artworks.length}`,
              title: details.title,
              artist: details.artist || 'Unknown',
              year: details.year || null,
              imageUrl: details.imageUrl || '',
              medium: details.medium || '',
              artworkType: collection.name.includes('Drawing') ? 'Drawing' : 
                          collection.name.includes('Sculpture') ? 'Sculpture' : 'Painting',
              description: details.description || '',
              category: collection.name,
              sourceUrl: link,
              museum: 'Musée des Beaux-Arts de Rouen',
              city: 'Rouen',
              country: 'France'
            });
          }
          
        } catch (err) {
          // 오류 시 건너뛰기
        }
      }
    }
    
  } finally {
    await browser.close();
  }
  
  // 중복 제거 (sourceUrl 기준)
  const uniqueArtworks = [];
  const seenUrls = new Set();
  for (const art of artworks) {
    if (!seenUrls.has(art.sourceUrl)) {
      seenUrls.add(art.sourceUrl);
      uniqueArtworks.push(art);
    }
  }
  
  // 저장
  const output = {
    museum: 'Musée des Beaux-Arts de Rouen',
    city: 'Rouen',
    country: 'France',
    exhibitionType: 'permanent',
    scrapedAt: new Date().toISOString(),
    totalArtworks: uniqueArtworks.length,
    artworks: uniqueArtworks
  };
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'musee-beaux-arts-rouen-collection.json'),
    JSON.stringify(output, null, 2)
  );
  
  log(taskName, `✅ 완료: ${uniqueArtworks.length}개 작품`);
  return uniqueArtworks.length;
}

// ═══════════════════════════════════════════════════════════════
// Lille PBA - Highlights (전체 컬렉션 접근 불가)
// ═══════════════════════════════════════════════════════════════
async function scrapeLillePBAProper() {
  const taskName = 'Lille PBA';
  log(taskName, '🏛️ Highlights 스크래핑 시작...');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  
  const page = await context.newPage();
  const artworks = [];
  
  try {
    // Highlights 페이지
    await page.goto('https://pba.lille.fr/en/Collections/Highlights', { 
      waitUntil: 'networkidle', 
      timeout: 60000 
    });
    
    // 무한 스크롤
    log(taskName, '📜 페이지 스크롤 중...');
    let prevHeight = 0;
    for (let i = 0; i < 30; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(2000);
      const currentHeight = await page.evaluate(() => document.body.scrollHeight);
      if (currentHeight === prevHeight) break;
      prevHeight = currentHeight;
    }
    
    // 작품 링크 수집
    const links = await page.$$eval('a[href*="/Collections/Highlights/"]', els => 
      [...new Set(els.map(a => a.href).filter(h => !h.endsWith('/Highlights') && !h.endsWith('/Highlights/')))]
    );
    
    log(taskName, `🔗 ${links.length}개 작품 링크 발견`);
    
    // 각 작품 상세 페이지 방문
    for (let i = 0; i < links.length; i++) {
      try {
        const detailPage = await context.newPage();
        await detailPage.goto(links[i], { waitUntil: 'domcontentloaded', timeout: 20000 });
        await detailPage.waitForTimeout(1000);
        
        const details = await detailPage.evaluate(() => {
          // 제목
          const titleEl = document.querySelector('h1, .title, .artwork-title');
          const title = titleEl?.textContent?.trim() || '';
          
          // 작가
          const artistEl = document.querySelector('.artist, .author, h2');
          const artist = artistEl?.textContent?.trim() || '';
          
          // 연도
          const yearMatch = document.body.textContent.match(/(\d{4})/);
          const year = yearMatch ? yearMatch[1] : '';
          
          // 이미지
          const img = document.querySelector('.artwork-image img, .main-image img, img[src*="pba.lille"]');
          const imageUrl = img?.src || '';
          
          // 카테고리 (URL에서)
          const pathParts = window.location.pathname.split('/');
          const category = pathParts[pathParts.length - 2] || '';
          
          // 설명
          const descEl = document.querySelector('.description, .content p, .text');
          const description = descEl?.textContent?.trim()?.substring(0, 500) || '';
          
          // 매체
          const bodyText = document.body.textContent || '';
          const mediumMatch = bodyText.match(/(oil on canvas|watercolor|bronze|marble|wood|paper)/i);
          const medium = mediumMatch ? mediumMatch[0] : '';
          
          return { title, artist, year, imageUrl, category, description, medium };
        });
        
        await detailPage.close();
        
        if (details.title) {
          artworks.push({
            id: `lille-pba-${artworks.length}`,
            title: details.title,
            artist: details.artist || 'Unknown',
            year: details.year || null,
            imageUrl: details.imageUrl || '',
            medium: details.medium || '',
            artworkType: details.category?.replace(/-/g, ' ') || '',
            description: details.description || '',
            sourceUrl: links[i],
            museum: 'Palais des Beaux-Arts de Lille',
            city: 'Lille',
            country: 'France'
          });
        }
        
        if ((i + 1) % 10 === 0) {
          log(taskName, `📝 진행: ${i + 1}/${links.length}`);
        }
        
      } catch (err) {
        // 오류 시 건너뛰기
      }
    }
    
  } finally {
    await browser.close();
  }
  
  // 저장
  const output = {
    museum: 'Palais des Beaux-Arts de Lille',
    city: 'Lille',
    country: 'France',
    exhibitionType: 'permanent',
    collection: 'Highlights',
    note: 'Full collection not accessible via web scraping',
    scrapedAt: new Date().toISOString(),
    totalArtworks: artworks.length,
    artworks
  };
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'palais-beaux-arts-lille-collection.json'),
    JSON.stringify(output, null, 2)
  );
  
  log(taskName, `✅ 완료: ${artworks.length}개 작품`);
  return artworks.length;
}

// ═══════════════════════════════════════════════════════════════
// 메인 실행
// ═══════════════════════════════════════════════════════════════
async function main() {
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  🏛️  Multi-Museum Proper Scraper V3');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  시작 시간: ${new Date().toLocaleString()}`);
  console.log('───────────────────────────────────────────────────────────────');
  console.log('');
  console.log('📋 스크래핑 대상:');
  console.log('   - MAMCS Strasbourg: ~11,777개 (이미지 있는 전체 컬렉션)');
  console.log('   - Rouen MBA: 모든 컬렉션 카테고리');
  console.log('   - Lille PBA: Highlights');
  console.log('');
  
  // 출력 디렉토리 확인
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  const startTime = Date.now();
  const results = {};
  
  // 순차 실행 (MAMCS가 너무 크므로)
  try {
    // 1. Lille PBA (가장 작음)
    results.lillePBA = await scrapeLillePBAProper();
  } catch (err) {
    console.error('Lille PBA 오류:', err.message);
    results.lillePBA = 0;
  }
  
  try {
    // 2. Rouen MBA
    results.rouenMBA = await scrapeRouenMBAProper();
  } catch (err) {
    console.error('Rouen MBA 오류:', err.message);
    results.rouenMBA = 0;
  }
  
  try {
    // 3. MAMCS (가장 큼)
    results.mamcs = await scrapeMAMCSFull();
  } catch (err) {
    console.error('MAMCS 오류:', err.message);
    results.mamcs = 0;
  }
  
  const endTime = Date.now();
  const duration = Math.round((endTime - startTime) / 1000);
  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;
  
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  📊  스크래핑 결과 요약');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  ✅ Lille PBA: ${results.lillePBA}개 작품`);
  console.log(`  ✅ Rouen MBA: ${results.rouenMBA}개 작품`);
  console.log(`  ✅ MAMCS Strasbourg: ${results.mamcs}개 작품`);
  console.log('───────────────────────────────────────────────────────────────');
  console.log(`  총 작품 수: ${results.lillePBA + results.rouenMBA + results.mamcs}`);
  console.log(`  소요 시간: ${minutes}분 ${seconds}초`);
  console.log('═══════════════════════════════════════════════════════════════');
  
  // 로그 저장
  const logData = {
    scrapedAt: new Date().toISOString(),
    duration: `${minutes}m ${seconds}s`,
    results
  };
  
  fs.writeFileSync(
    path.join(LOG_DIR, 'multi-museum-scrape-v3-log.json'),
    JSON.stringify(logData, null, 2)
  );
}

main().catch(console.error);
