/**
 * French Museums Scraper V6 - 개선된 이어서 수집
 * 
 * V4 방식 유지 + 페이지 제한 제거 + 이어서 수집
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../public/data');

const delay = (ms) => new Promise(r => setTimeout(r, ms));
const timestamp = () => new Date().toLocaleTimeString('ko-KR', { hour12: false });
const log = (prefix, msg) => console.log(`[${timestamp()}] [${prefix}] ${msg}`);

// 기존 파일 로드
function loadExisting(filename) {
  const filepath = path.join(OUTPUT_DIR, filename);
  if (fs.existsSync(filepath)) {
    try {
      const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
      return data.artworks || [];
    } catch (e) {
      return [];
    }
  }
  return [];
}

// URL에서 작가명과 제목 파싱
function parseMAMCSUrl(url) {
  const match = url.match(/\/artwork\/([^?]+)/);
  if (!match) return { artist: null, title: null };
  
  const slug = match[1];
  const parts = slug.split('-');
  
  let idIndex = parts.length - 1;
  for (let i = parts.length - 1; i >= 0; i--) {
    if (/^\d/.test(parts[i])) {
      idIndex = i;
      break;
    }
  }
  
  let artistParts = [];
  let titleStart = 0;
  
  for (let i = 0; i < Math.min(4, idIndex); i++) {
    const part = parts[i];
    if (part.length <= 15 && /^[a-z]/.test(part)) {
      artistParts.push(part);
      titleStart = i + 1;
    } else {
      break;
    }
  }
  
  const artist = artistParts.length > 0 
    ? artistParts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
    : null;
  
  const titleParts = parts.slice(titleStart, idIndex);
  const title = titleParts.length > 0
    ? titleParts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
    : null;
  
  return { artist, title };
}

const MAMCS_CATEGORIES = {
  drawings: { filter: 'Dessin', artworkType: 'Drawing', fileName: 'mamcs-strasbourg-drawings-collection.json' },
  paintings: { filter: 'Peinture', artworkType: 'Painting', fileName: 'mamcs-strasbourg-paintings-collection.json' },
  photography: { filter: 'Photographie', artworkType: 'Photography', fileName: 'mamcs-strasbourg-photography-collection.json' },
  graphicdesign: { filter: 'Design%20graphique', artworkType: 'Graphic Design', fileName: 'mamcs-strasbourg-graphic-design-collection.json' }
};

// MAMCS 저장
function saveMAMCS(categoryKey, artworks) {
  const category = MAMCS_CATEGORIES[categoryKey];
  const output = {
    museum: {
      name: 'Musée d\'Art Moderne et Contemporain de Strasbourg',
      city: 'Strasbourg',
      country: 'France',
      website: 'https://www.navigart.fr/mamcs/'
    },
    collection: category.artworkType,
    totalCount: artworks.length,
    scrapedAt: new Date().toISOString(),
    artworks: artworks
  };
  
  fs.writeFileSync(path.join(OUTPUT_DIR, category.fileName), JSON.stringify(output, null, 2));
  log(`MAMCS ${category.artworkType}`, `💾 저장: ${artworks.length}개`);
}

// MAMCS 카테고리 스크래핑
async function scrapeMAMCSCategory(browser, categoryKey) {
  const category = MAMCS_CATEGORIES[categoryKey];
  const existingArtworks = loadExisting(category.fileName);
  const existingUrls = new Set(existingArtworks.map(a => a.sourceUrl));
  const artworks = [...existingArtworks];
  
  // 기존 데이터에서 시작 페이지 계산 (페이지당 약 15개)
  const startPage = Math.max(1, Math.floor(existingArtworks.length / 15) + 1);
  let consecutiveEmpty = 0;
  
  log(`MAMCS ${category.artworkType}`, `🏛️ 기존 ${existingArtworks.length}개, 페이지 ${startPage}부터 시작`);
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  
  let currentPage = startPage;
  
  // 연속 빈 페이지 5개면 종료
  while (consecutiveEmpty < 5) {
    const url = `https://www.navigart.fr/mamcs/artworks/tree_domain_all/${category.filter}/checkbox:withimage/Avec%20image?page=${currentPage}`;
    const browserPage = await context.newPage();
    
    try {
      await browserPage.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      await delay(4000);
      
      // 스크롤로 모든 이미지 로드
      for (let i = 0; i < 10; i++) {
        await browserPage.evaluate(() => window.scrollBy(0, 600));
        await delay(300);
      }
      
      // 모든 작품 카드에서 데이터 추출
      const pageData = await browserPage.evaluate(() => {
        const items = [];
        const artworkLinks = document.querySelectorAll('a[href*="/artwork/"]');
        const uniqueUrls = new Set();
        
        artworkLinks.forEach(link => {
          const href = link.href;
          if (uniqueUrls.has(href)) return;
          uniqueUrls.add(href);
          
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
              imageUrl
            });
          }
        });
        
        return items;
      });
      
      if (pageData.length === 0) {
        consecutiveEmpty++;
        log(`MAMCS ${category.artworkType}`, `   Page ${currentPage}: 0개 (빈 ${consecutiveEmpty}/5)`);
      } else {
        consecutiveEmpty = 0;
        let newCount = 0;
        
        for (const item of pageData) {
          if (existingUrls.has(item.sourceUrl)) continue;
          existingUrls.add(item.sourceUrl);
          
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
            museum: 'Musée d\'Art Moderne et Contemporain de Strasbourg',
            city: 'Strasbourg',
            country: 'France'
          });
          newCount++;
        }
        
        log(`MAMCS ${category.artworkType}`, `📄 Page ${currentPage}: +${newCount}개 (누적 ${artworks.length}개)`);
        
        // 20페이지마다 저장
        if (currentPage % 20 === 0) {
          saveMAMCS(categoryKey, artworks);
        }
      }
    } catch (e) {
      log(`MAMCS ${category.artworkType}`, `❌ Page ${currentPage} 에러: ${e.message.slice(0, 50)}`);
      consecutiveEmpty++;
    } finally {
      await browserPage.close();
    }
    
    currentPage++;
    await delay(500);
  }
  
  await context.close();
  log(`MAMCS ${category.artworkType}`, `✅ 완료: ${artworks.length}개`);
  
  return { categoryKey, artworks };
}

// Rouen 스크래핑
async function scrapeRouen(browser) {
  const existingArtworks = loadExisting('musee-beaux-arts-rouen-collection.json');
  const existingUrls = new Set(existingArtworks.map(a => a.sourceUrl));
  const artworks = [...existingArtworks];
  
  log('Rouen MBA', `🏛️ 기존 ${existingArtworks.length}개 로드됨`);
  
  const ROUEN_COLLECTIONS = [
    'impressionism', 'landscapes', 'the-renaissance', 'baroque-europe',
    'the-french-grand-siecle', 'romanticism', 'the-salon', 'portraits',
    'still-life', 'religious-art', 'sculpture', 'drawings'
  ];
  
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
      
      const links = await listPage.$$eval('a[href*="/oeuvres/"]', els => 
        [...new Set(els.map(a => a.href).filter(h => h.includes('/oeuvres/')))]
      );
      
      log('Rouen MBA', `   ${links.length}개 발견`);
      
      // 상세 페이지 병렬 처리 (3개씩)
      for (let i = 0; i < links.length; i += 3) {
        const batch = links.slice(i, i + 3);
        
        const results = await Promise.all(batch.map(async (link) => {
          if (existingUrls.has(link)) return null;
          
          const detailPage = await context.newPage();
          try {
            await detailPage.goto(link, { waitUntil: 'networkidle', timeout: 25000 });
            await delay(1000);
            
            const data = await detailPage.evaluate((collName) => {
              const title = document.querySelector('h1.title')?.innerText?.trim() || 
                           document.querySelector('h1')?.innerText?.trim();
              const artist = document.querySelector('.field--name-field-auteur')?.innerText?.trim() ||
                            document.querySelector('.author')?.innerText?.trim();
              const img = document.querySelector('.node__content img, .artwork-image img');
              let imageUrl = img?.src || '';
              if (imageUrl.includes('styles/')) {
                imageUrl = imageUrl.replace(/styles\/[^/]+\/public/, 'files');
              }
              
              return { title, artist, imageUrl, collection: collName };
            }, collection);
            
            return { ...data, sourceUrl: link };
          } catch (e) {
            return null;
          } finally {
            await detailPage.close();
          }
        }));
        
        for (const data of results) {
          if (data && data.title) {
            existingUrls.add(data.sourceUrl);
            artworks.push({
              id: `rouen-${artworks.length}`,
              title: data.title,
              artist: data.artist || 'Unknown',
              year: null,
              imageUrl: data.imageUrl,
              medium: data.collection,
              artworkType: data.collection,
              sourceUrl: data.sourceUrl,
              museum: 'Musée des Beaux-Arts de Rouen',
              city: 'Rouen',
              country: 'France'
            });
          }
        }
      }
    } catch (e) {
      log('Rouen MBA', `❌ ${collection} 에러: ${e.message.slice(0, 50)}`);
    } finally {
      await listPage.close();
    }
  }
  
  await context.close();
  log('Rouen MBA', `✅ 완료: ${artworks.length}개`);
  
  return artworks;
}

// Lille 스크래핑
async function scrapeLille(browser) {
  const existingArtworks = loadExisting('palais-beaux-arts-lille-collection.json');
  const existingUrls = new Set(existingArtworks.map(a => a.sourceUrl || a.detailUrl));
  const artworks = [...existingArtworks];
  
  log('Lille PBA', `🏛️ 기존 ${existingArtworks.length}개 로드됨`);
  
  const LILLE_CATEGORIES = [
    '16th-20th-century-Paintings', 'Antiquity', 'Middle-Ages-and-Renaissance',
    'Ceramics-and-Decorative-Arts', 'Drawings', 'Plans-in-Relief', 'Sculptures'
  ];
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  
  for (const category of LILLE_CATEGORIES) {
    const url = `https://pba.lille.fr/en/Collections/Highlights/${category}`;
    log('Lille PBA', `📂 ${category} 수집 중...`);
    
    const page = await context.newPage();
    
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      await delay(2000);
      
      // 이미지 갤러리에서 모든 항목 추출
      const items = await page.evaluate((catName) => {
        const results = [];
        const images = document.querySelectorAll('.ez-view-galeriephotosfullcontent img, .gallery-item img');
        
        images.forEach(img => {
          let imageUrl = img.src || img.dataset.src || '';
          if (imageUrl.includes('/alias/')) {
            // 더 큰 해상도로 변환
            imageUrl = imageUrl.replace(/\/alias\/[^/]+/, '/alias/original');
          }
          
          const link = img.closest('a');
          const parent = img.closest('.gallery-item, .ez-view-galeriephotosfullcontent');
          const titleEl = parent?.querySelector('.title, .caption, h3');
          const artistEl = parent?.querySelector('.artist, .author, .subtitle');
          
          if (imageUrl && !imageUrl.startsWith('data:')) {
            results.push({
              imageUrl,
              title: titleEl?.textContent?.trim() || 'Untitled',
              artist: artistEl?.textContent?.trim() || '',
              sourceUrl: link?.href || imageUrl,
              category: catName
            });
          }
        });
        
        return results;
      }, category);
      
      let newCount = 0;
      for (const item of items) {
        if (existingUrls.has(item.sourceUrl)) continue;
        existingUrls.add(item.sourceUrl);
        
        artworks.push({
          id: `lille-${artworks.length}`,
          title: item.title,
          artist: item.artist || 'Unknown',
          year: null,
          imageUrl: item.imageUrl,
          medium: item.category,
          artworkType: item.category,
          sourceUrl: item.sourceUrl,
          museum: 'Palais des Beaux-Arts de Lille',
          city: 'Lille',
          country: 'France'
        });
        newCount++;
      }
      
      if (newCount > 0) {
        log('Lille PBA', `   +${newCount}개 (누적 ${artworks.length}개)`);
      }
    } catch (e) {
      log('Lille PBA', `❌ ${category} 에러: ${e.message.slice(0, 50)}`);
    } finally {
      await page.close();
    }
  }
  
  await context.close();
  log('Lille PBA', `✅ 완료: ${artworks.length}개`);
  
  return artworks;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  🏛️  French Museums Scraper V6 (이어서 수집 + 무제한)');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  시작: ${new Date().toLocaleString()}`);
  console.log('───────────────────────────────────────────────────────────────\n');
  
  const browser = await chromium.launch({ headless: true });
  
  try {
    // 6개 전부 동시에 병렬 스크래핑
    log('Main', '🚀 MAMCS 4개 + Rouen + Lille 동시 스크래핑 시작!');
    
    const [
      drawingsResult,
      paintingsResult,
      photographyResult,
      graphicdesignResult,
      rouenArtworks,
      lilleArtworks
    ] = await Promise.all([
      scrapeMAMCSCategory(browser, 'drawings'),
      scrapeMAMCSCategory(browser, 'paintings'),
      scrapeMAMCSCategory(browser, 'photography'),
      scrapeMAMCSCategory(browser, 'graphicdesign'),
      scrapeRouen(browser),
      scrapeLille(browser)
    ]);
    
    const mamcsResults = [drawingsResult, paintingsResult, photographyResult, graphicdesignResult];
    
    // MAMCS 결과 저장
    for (const result of mamcsResults) {
      saveMAMCS(result.categoryKey, result.artworks);
    }
    
    // Rouen 저장
    const rouenOutput = {
      museum: {
        name: 'Musée des Beaux-Arts de Rouen',
        city: 'Rouen',
        country: 'France',
        website: 'https://mbarouen.fr'
      },
      totalCount: rouenArtworks.length,
      scrapedAt: new Date().toISOString(),
      artworks: rouenArtworks
    };
    fs.writeFileSync(path.join(OUTPUT_DIR, 'musee-beaux-arts-rouen-collection.json'), JSON.stringify(rouenOutput, null, 2));
    log('Rouen MBA', `💾 저장: ${rouenArtworks.length}개`);
    
    // Lille 저장
    const lilleOutput = {
      museum: {
        name: 'Palais des Beaux-Arts de Lille',
        city: 'Lille',
        country: 'France',
        website: 'https://pba.lille.fr'
      },
      totalCount: lilleArtworks.length,
      scrapedAt: new Date().toISOString(),
      artworks: lilleArtworks
    };
    fs.writeFileSync(path.join(OUTPUT_DIR, 'palais-beaux-arts-lille-collection.json'), JSON.stringify(lilleOutput, null, 2));
    log('Lille PBA', `💾 저장: ${lilleArtworks.length}개`);
    
    // 최종 결과
    const drawings = mamcsResults.find(r => r.categoryKey === 'drawings')?.artworks.length || 0;
    const paintings = mamcsResults.find(r => r.categoryKey === 'paintings')?.artworks.length || 0;
    const photography = mamcsResults.find(r => r.categoryKey === 'photography')?.artworks.length || 0;
    const graphicdesign = mamcsResults.find(r => r.categoryKey === 'graphicdesign')?.artworks.length || 0;
    
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  ✅ 스크래핑 완료!');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  MAMCS Drawing: ${drawings}개`);
    console.log(`  MAMCS Painting: ${paintings}개`);
    console.log(`  MAMCS Photography: ${photography}개`);
    console.log(`  MAMCS Graphic Design: ${graphicdesign}개`);
    console.log(`  Rouen MBA: ${rouenArtworks.length}개`);
    console.log(`  Lille PBA: ${lilleArtworks.length}개`);
    console.log(`  ────────────────────────────────────`);
    const total = drawings + paintings + photography + graphicdesign + rouenArtworks.length + lilleArtworks.length;
    console.log(`  총: ${total}개`);
    console.log('═══════════════════════════════════════════════════════════════');
    
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
