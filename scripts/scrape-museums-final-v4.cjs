/**
 * Multi-Museum Final Scraper V4
 * 
 * 테스트 결과 기반 정확한 셀렉터 사용
 * - MAMCS: URL에서 title/artist 파싱, 이미지 직접 추출
 * - Rouen: title은 og:title 또는 URL에서, h2는 artist
 * - Lille: 정상 작동
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'data');
const LOG_DIR = path.join(__dirname, '..', 'downloads');

function log(task, message) {
  const time = new Date().toLocaleTimeString('ko-KR', { hour12: false });
  console.log(`[${time}] [${task}] ${message}`);
}

// URL 슬러그에서 제목/작가 파싱
function parseMAMCSUrl(url) {
  // URL 형식: /artwork/artist-name-artwork-title-id
  const match = url.match(/\/artwork\/([^?]+)/);
  if (!match) return { artist: '', title: '' };
  
  const slug = match[1];
  // 마지막 숫자 ID 제거
  const parts = slug.replace(/-\d+$/, '').split('-');
  
  // 보통 첫 2-3단어가 작가 이름, 나머지가 제목
  // 예: gustave-dore-coucher-de-soleil-dans-les-alpes
  // 작가: Gustave Doré, 제목: Coucher de soleil dans les Alpes
  
  // 작가 이름 끝나는 지점 찾기 (보통 2-3단어)
  let artistParts = [];
  let titleParts = [];
  let foundSeparator = false;
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    // 'dit', 'dite', 'le', 'la', 'de', 'du', 'van', 'von' 같은 단어는 작가 이름의 일부일 수 있음
    const isNamePart = ['dit', 'dite', 'le', 'la', 'de', 'du', 'van', 'von', 'der'].includes(part.toLowerCase());
    
    if (artistParts.length >= 2 && !isNamePart && !foundSeparator) {
      foundSeparator = true;
    }
    
    if (!foundSeparator) {
      artistParts.push(part);
    } else {
      titleParts.push(part);
    }
  }
  
  const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  
  return {
    artist: artistParts.map(capitalize).join(' '),
    title: titleParts.map(capitalize).join(' ') || 'Untitled'
  };
}

// Rouen URL에서 제목 추출
function parseRouenUrl(url) {
  // URL 형식: /en/oeuvres/the-church-at-moret-in-the-morning-sun
  const match = url.match(/\/oeuvres\/([^/?]+)/);
  if (!match) return '';
  
  const slug = match[1].replace(/-\d+$/, ''); // 끝에 숫자 제거
  const parts = slug.split('-');
  
  return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

// ═══════════════════════════════════════════════════════════════
// MAMCS Strasbourg - 전체 컬렉션 (이미지 있는 것만)
// ═══════════════════════════════════════════════════════════════
async function scrapeMAMCS() {
  const taskName = 'MAMCS';
  log(taskName, '🏛️ 전체 컬렉션 스크래핑 시작...');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  
  const artworks = [];
  const baseUrl = 'https://www.navigart.fr/mamcs/artworks/checkbox:withimage/Avec%20image';
  const maxPages = 1231; // 11,777개 / ~10개 per page
  
  let consecutiveEmpty = 0;
  const page = await context.newPage();
  
  try {
    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      const url = `${baseUrl}?page=${pageNum}`;
      
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(1000);
        
        // 목록에서 작품 정보 직접 추출
        const items = await page.$$eval('a[href*="/artwork/"]', links => {
          const results = [];
          const seen = new Set();
          
          for (const link of links) {
            const href = link.href;
            if (seen.has(href) || !href.includes('/artwork/')) continue;
            seen.add(href);
            
            // 이미지 찾기
            const img = link.querySelector('img');
            const imageUrl = img?.src || '';
            
            // 텍스트 정보 (카드 전체에서)
            const card = link.closest('.artwork-card, .card, [class*="artwork"]') || link;
            const text = card.textContent || '';
            
            results.push({ href, imageUrl, text });
          }
          
          return results;
        });
        
        if (items.length === 0) {
          consecutiveEmpty++;
          if (consecutiveEmpty >= 3) {
            log(taskName, `⚠️ 3페이지 연속 빈 페이지, 종료`);
            break;
          }
          continue;
        }
        
        consecutiveEmpty = 0;
        
        for (const item of items) {
          // URL에서 작가/제목 파싱
          const parsed = parseMAMCSUrl(item.href);
          
          // 텍스트에서 연도 추출
          const yearMatch = item.text.match(/(\d{4})/);
          const year = yearMatch ? yearMatch[1] : null;
          
          // 텍스트에서 타입 추출
          const typeMatch = item.text.match(/(Peinture|Dessin|Photographie|Sculpture|Estampe|Design graphique)/i);
          const artworkType = typeMatch ? typeMatch[1] : '';
          
          artworks.push({
            id: `mamcs-${artworks.length}`,
            title: parsed.title,
            artist: parsed.artist || 'Unknown',
            year: year,
            imageUrl: item.imageUrl,
            medium: '',
            artworkType: artworkType,
            sourceUrl: item.href,
            museum: "Musée d'Art Moderne et Contemporain de Strasbourg",
            city: 'Strasbourg',
            country: 'France'
          });
        }
        
        if (pageNum % 50 === 0) {
          log(taskName, `📄 Page ${pageNum}/${maxPages}: 총 ${artworks.length}개`);
          
          // 중간 저장
          const tempOutput = {
            museum: "Musée d'Art Moderne et Contemporain de Strasbourg",
            collection: "Full Collection (with images)",
            city: 'Strasbourg',
            country: 'France',
            exhibitionType: 'permanent',
            scrapedAt: new Date().toISOString(),
            totalArtworks: artworks.length,
            artworks
          };
          fs.writeFileSync(
            path.join(OUTPUT_DIR, 'mamcs-strasbourg-collection.json'),
            JSON.stringify(tempOutput, null, 2)
          );
        }
        
        // 요청 사이 딜레이
        await page.waitForTimeout(500);
        
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
    collection: "Full Collection (with images)",
    city: 'Strasbourg',
    country: 'France',
    exhibitionType: 'permanent',
    scrapedAt: new Date().toISOString(),
    totalArtworks: artworks.length,
    artworks
  };
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'mamcs-strasbourg-collection.json'),
    JSON.stringify(output, null, 2)
  );
  
  log(taskName, `✅ 완료: ${artworks.length}개 작품`);
  return artworks.length;
}

// ═══════════════════════════════════════════════════════════════
// Rouen MBA - 각 컬렉션 카테고리
// ═══════════════════════════════════════════════════════════════
async function scrapeRouen() {
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
  const seenUrls = new Set();
  const page = await context.newPage();
  
  try {
    for (const collection of collections) {
      log(taskName, `📂 "${collection.name}" 수집 중...`);
      
      await page.goto(collection.url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);
      
      // 스크롤
      let prevHeight = 0;
      for (let i = 0; i < 10; i++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1000);
        const h = await page.evaluate(() => document.body.scrollHeight);
        if (h === prevHeight) break;
        prevHeight = h;
      }
      
      // 작품 링크 수집
      const links = await page.$$eval('a[href*="/en/oeuvres/"]', els => 
        [...new Set(els.map(a => a.href).filter(h => h.includes('/oeuvres/')))]
      );
      
      log(taskName, `   발견: ${links.length}개 작품`);
      
      // 각 작품 상세 페이지
      for (const link of links) {
        if (seenUrls.has(link)) continue;
        seenUrls.add(link);
        
        try {
          const detailPage = await context.newPage();
          await detailPage.goto(link, { waitUntil: 'domcontentloaded', timeout: 20000 });
          await detailPage.waitForTimeout(1500);
          
          const data = await detailPage.evaluate(() => {
            // 제목 - og:title 또는 page title에서
            const ogTitle = document.querySelector('meta[property="og:title"]')?.content || '';
            let title = ogTitle;
            if (!title || title === 'Musée des Beaux-Arts') {
              const h1 = document.querySelector('#page-title, .page-title, h1.title');
              title = h1?.textContent?.trim() || '';
            }
            
            // 작가 - h2
            const artist = document.querySelector('h2')?.textContent?.trim() || '';
            
            // 메타 정보
            const bodyText = document.body.textContent || '';
            const dateMatch = bodyText.match(/DATE\s*:\s*(\d{4})/i);
            const year = dateMatch ? dateMatch[1] : '';
            
            const mediumMatch = bodyText.match(/MEDIUM\s*:\s*([^\n]+)/i);
            const medium = mediumMatch ? mediumMatch[1].trim() : '';
            
            // 이미지 - deepzoom에서 추출
            const deepzoomImgs = document.querySelectorAll('img[src*="deepzoom"]');
            let imageUrl = '';
            for (const img of deepzoomImgs) {
              const src = img.src;
              const hashMatch = src.match(/deepzoom\/([a-f0-9]+)_files/);
              if (hashMatch) {
                imageUrl = `https://mbarouen.fr/sites/default/files/styles/large/public/oeuvres/${hashMatch[1]}.jpg`;
                break;
              }
            }
            
            return { title, artist, year, medium, imageUrl };
          });
          
          await detailPage.close();
          
          // URL에서 제목 백업
          let title = data.title;
          if (!title || title === 'Musée des Beaux-Arts') {
            title = parseRouenUrl(link);
          }
          
          // 작가 정리 (날짜/인벤토리 번호 제거)
          let artist = data.artist || '';
          const artistClean = artist.replace(/\s*\([^)]*\)\s*\|.*$/, '').trim();
          
          if (title && title !== 'Musée des Beaux-Arts') {
            artworks.push({
              id: `rouen-mba-${artworks.length}`,
              title: title,
              artist: artistClean || 'Unknown',
              year: data.year || null,
              imageUrl: data.imageUrl || '',
              medium: data.medium || '',
              artworkType: collection.name.includes('Drawing') ? 'Drawing' : 
                          collection.name.includes('Sculpture') ? 'Sculpture' : 'Painting',
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
  
  // 저장
  const output = {
    museum: 'Musée des Beaux-Arts de Rouen',
    city: 'Rouen',
    country: 'France',
    exhibitionType: 'permanent',
    scrapedAt: new Date().toISOString(),
    totalArtworks: artworks.length,
    artworks
  };
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'musee-beaux-arts-rouen-collection.json'),
    JSON.stringify(output, null, 2)
  );
  
  log(taskName, `✅ 완료: ${artworks.length}개 작품`);
  return artworks.length;
}

// ═══════════════════════════════════════════════════════════════
// Lille PBA - Highlights
// ═══════════════════════════════════════════════════════════════
async function scrapeLille() {
  const taskName = 'Lille PBA';
  log(taskName, '🏛️ Highlights 스크래핑 시작...');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  
  const page = await context.newPage();
  const artworks = [];
  
  try {
    await page.goto('https://pba.lille.fr/en/Collections/Highlights', { 
      waitUntil: 'networkidle', 
      timeout: 60000 
    });
    
    // 스크롤
    log(taskName, '📜 페이지 스크롤 중...');
    let prevHeight = 0;
    for (let i = 0; i < 30; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(2000);
      const h = await page.evaluate(() => document.body.scrollHeight);
      if (h === prevHeight) break;
      prevHeight = h;
    }
    
    // 작품 링크
    const links = await page.$$eval('a[href*="/Collections/Highlights/"]', els => 
      [...new Set(els.map(a => a.href).filter(h => {
        const parts = h.split('/');
        return parts.length > 6; // /en/Collections/Highlights/Category/Artwork
      }))]
    );
    
    log(taskName, `🔗 ${links.length}개 작품 발견`);
    
    for (let i = 0; i < links.length; i++) {
      try {
        const detailPage = await context.newPage();
        await detailPage.goto(links[i], { waitUntil: 'domcontentloaded', timeout: 20000 });
        await detailPage.waitForTimeout(1500);
        
        const data = await detailPage.evaluate(() => {
          // 제목
          const title = document.querySelector('h1')?.textContent?.trim() || '';
          
          // 작가 (제목 근처 또는 텍스트에서)
          const bodyText = document.body.textContent || '';
          const artistMatch = bodyText.match(/by\s+([A-Z][a-zéèêë]+(?:\s+[A-Z][a-zéèêë]+)*)/i) ||
                              bodyText.match(/([A-Z][a-zéèêë]+(?:\s+[A-Z][a-zéèêë]+)+)\s*\n/);
          const artist = artistMatch ? artistMatch[1] : '';
          
          // 연도
          const yearMatch = bodyText.match(/\b(1[4-9]\d{2}|20[0-2]\d)\b/);
          const year = yearMatch ? yearMatch[0] : '';
          
          // 이미지
          const img = document.querySelector('img[src*="artwork_illustration"], img[src*="pba.lille.fr"]');
          const imageUrl = img?.src || '';
          
          // 카테고리 (URL에서)
          const pathParts = window.location.pathname.split('/').filter(p => p);
          const category = pathParts[3] || ''; // Highlights 다음 부분
          
          // 매체
          const mediumMatch = bodyText.match(/(oil on canvas|watercolour?|bronze|marble|wood|paper on|canvas)/i);
          const medium = mediumMatch ? mediumMatch[0] : '';
          
          return { title, artist, year, imageUrl, category, medium };
        });
        
        await detailPage.close();
        
        if (data.title) {
          artworks.push({
            id: `lille-pba-${artworks.length}`,
            title: data.title,
            artist: data.artist || 'Unknown',
            year: data.year || null,
            imageUrl: data.imageUrl || '',
            medium: data.medium || '',
            artworkType: data.category?.replace(/-/g, ' ') || '',
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
  console.log('  🏛️  Multi-Museum Final Scraper V4');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  시작 시간: ${new Date().toLocaleString()}`);
  console.log('───────────────────────────────────────────────────────────────');
  console.log('');
  
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  const startTime = Date.now();
  const results = {};
  
  // 순차 실행 (Lille → Rouen → MAMCS)
  try {
    results.lillePBA = await scrapeLille();
  } catch (err) {
    console.error('Lille PBA 오류:', err.message);
    results.lillePBA = 0;
  }
  
  try {
    results.rouenMBA = await scrapeRouen();
  } catch (err) {
    console.error('Rouen MBA 오류:', err.message);
    results.rouenMBA = 0;
  }
  
  try {
    results.mamcs = await scrapeMAMCS();
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
}

main().catch(console.error);
