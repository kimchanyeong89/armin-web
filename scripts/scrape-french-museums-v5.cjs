/**
 * French Museums Scraper V5 - 이어서 수집 + 전체 페이지 수집
 * 
 * 기존 저장된 파일에서 이어서 수집
 * 페이지 제한 없이 모든 작품 수집
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'data');

function log(prefix, message) {
  const now = new Date();
  const time = now.toLocaleTimeString('ko-KR');
  console.log(`[${time}] [${prefix}] ${message}`);
}

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
  const match = url.match(/\/artwork\/([^\/]+)$/);
  if (!match) return { artist: 'Unknown', title: 'Untitled' };
  
  const slug = match[1];
  const parts = slug.split('-');
  
  if (parts.length >= 3) {
    const artistParts = [];
    const titleParts = [];
    let foundTitle = false;
    
    for (let i = 0; i < parts.length - 1; i++) {
      if (!foundTitle && /^[a-z]+$/.test(parts[i])) {
        if (artistParts.length < 3) {
          artistParts.push(parts[i]);
        } else {
          foundTitle = true;
          titleParts.push(parts[i]);
        }
      } else if (/^\d{4}$/.test(parts[i])) {
        continue;
      } else {
        foundTitle = true;
        titleParts.push(parts[i]);
      }
    }
    
    const artist = artistParts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
    const title = titleParts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ') || 'Untitled';
    
    return { artist: artist || 'Unknown', title };
  }
  
  return { artist: 'Unknown', title: 'Untitled' };
}

function saveMAMCSCategory(categoryKey, artworks, artworkType) {
  const filename = `mamcs-strasbourg-${categoryKey}-collection.json`;
  const filepath = path.join(OUTPUT_DIR, filename);
  
  const output = {
    museum: {
      name: 'MAMCS - Musée d\'Art Moderne et Contemporain de Strasbourg',
      city: 'Strasbourg',
      country: 'France',
      website: 'https://www.musees.strasbourg.eu/mamcs'
    },
    collection: artworkType,
    totalCount: artworks.length,
    scrapedAt: new Date().toISOString(),
    artworks: artworks
  };
  
  fs.writeFileSync(filepath, JSON.stringify(output, null, 2));
  log(`MAMCS ${artworkType}`, `💾 저장: ${artworks.length}개 → ${filename}`);
}

// MAMCS 카테고리 스크래핑 (이어서)
async function scrapeMAMCSCategory(browser, categoryKey, filter, artworkType, existingArtworks) {
  const prefix = `MAMCS ${artworkType}`;
  const page = await browser.newPage();
  
  const existingUrls = new Set(existingArtworks.map(a => a.detailUrl));
  const artworks = [...existingArtworks];
  const startPage = Math.floor(existingArtworks.length / 15) + 1;
  
  log(prefix, `🏛️ 기존 ${existingArtworks.length}개, 페이지 ${startPage}부터 시작`);
  
  let currentPage = startPage;
  let consecutiveEmpty = 0;
  
  while (consecutiveEmpty < 3) {
    try {
      const url = `https://www.navigart.fr/mamcs/artworks/tree_domain_all/${filter}/checkbox:withimage/Avec%20image?page=${currentPage}`;
      
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1000);
      
      // 페이지에서 작품 추출
      const items = await page.evaluate(() => {
        const artworkItems = document.querySelectorAll('.item-artwork, .artwork-item, [class*="artwork"]');
        if (artworkItems.length > 0) {
          return [...artworkItems].map(item => {
            const link = item.querySelector('a');
            const img = item.querySelector('img');
            const titleEl = item.querySelector('.title, h3, h4');
            const artistEl = item.querySelector('.artist, .author');
            return {
              ua_url: link?.getAttribute('href') || '',
              oa_image_hd: img?.src || img?.dataset?.src || '',
              oa_titre: titleEl?.textContent?.trim() || '',
              oa_auteurs: artistEl?.textContent?.trim() || ''
            };
          });
        }
        
        // 그리드 아이템 시도
        const gridItems = document.querySelectorAll('.grid-item, .col');
        return [...gridItems].map(item => {
          const link = item.querySelector('a');
          const img = item.querySelector('img');
          return {
            ua_url: link?.getAttribute('href') || '',
            oa_image_hd: img?.src || img?.dataset?.src || ''
          };
        }).filter(i => i.ua_url);
      });
      
      if (items.length === 0) {
        consecutiveEmpty++;
        log(prefix, `⚠️ Page ${currentPage}: 빈 페이지 (${consecutiveEmpty}/3)`);
        currentPage++;
        continue;
      }
      
      consecutiveEmpty = 0;
      let newCount = 0;
      
      for (const item of items) {
        const detailUrl = item.ua_url || '';
        const fullUrl = detailUrl.startsWith('http') ? detailUrl : `https://www.navigart.fr${detailUrl}`;
        
        if (existingUrls.has(fullUrl)) continue;
        
        existingUrls.add(fullUrl);
        const { artist, title } = parseMAMCSUrl(detailUrl);
        
        artworks.push({
          id: `mamcs-${categoryKey}-${artworks.length + 1}`,
          title: item.oa_titre || title,
          artist: item.oa_auteurs || artist,
          year: item.oa_date_creation || '',
          medium: artworkType,
          artworkType: artworkType,
          imageUrl: item.oa_image_hd || '',
          detailUrl: fullUrl,
          museum: 'MAMCS Strasbourg',
          collection: artworkType
        });
        newCount++;
      }
      
      log(prefix, `📄 Page ${currentPage}: +${newCount}개 (총 ${artworks.length}개)`);
      currentPage++;
      
      // 20페이지마다 저장
      if (currentPage % 20 === 0) {
        saveMAMCSCategory(categoryKey, artworks, artworkType);
      }
      
      await page.waitForTimeout(300);
      
    } catch (e) {
      log(prefix, `❌ Page ${currentPage} 에러: ${e.message.slice(0, 50)}`);
      consecutiveEmpty++;
      currentPage++;
    }
  }
  
  await page.close();
  return artworks;
}

// Rouen MBA 스크래핑 (이어서)
async function scrapeRouen(browser, existingArtworks) {
  const prefix = 'Rouen MBA';
  const page = await browser.newPage();
  
  const collections = [
    'impressionism', 'landscapes', 'the-renaissance', 'baroque-europe',
    'the-french-grand-siecle', 'romanticism', 'the-salon', 'portraits',
    'still-life', 'religious-art', 'sculpture', 'drawings'
  ];
  
  const existingUrls = new Set(existingArtworks.map(a => a.detailUrl));
  const artworks = [...existingArtworks];
  
  log(prefix, `🏛️ 기존 ${existingArtworks.length}개 로드됨`);
  
  for (const collection of collections) {
    try {
      const url = `https://mbarouen.fr/en/collections/${collection}`;
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(2000);
      
      const items = await page.evaluate(() => {
        const cards = document.querySelectorAll('.card-oeuvre, .oeuvre-card, [class*="oeuvre"], .views-row');
        return [...cards].map(card => {
          const link = card.querySelector('a');
          const img = card.querySelector('img');
          const titleEl = card.querySelector('.title, h3, h4');
          const artistEl = card.querySelector('.author, .artist, .field--name-field-auteur');
          
          return {
            detailUrl: link?.href || '',
            imageUrl: img?.src || img?.dataset?.src || '',
            title: titleEl?.textContent?.trim() || '',
            artist: artistEl?.textContent?.trim() || ''
          };
        }).filter(item => item.detailUrl);
      });
      
      let newCount = 0;
      for (const item of items) {
        if (existingUrls.has(item.detailUrl)) continue;
        existingUrls.add(item.detailUrl);
        
        artworks.push({
          id: `rouen-${artworks.length + 1}`,
          title: item.title || 'Untitled',
          artist: item.artist || 'Unknown',
          year: '',
          medium: collection,
          artworkType: collection,
          imageUrl: item.imageUrl,
          detailUrl: item.detailUrl,
          museum: 'Musée des Beaux-Arts de Rouen',
          collection: collection
        });
        newCount++;
      }
      
      if (newCount > 0) {
        log(prefix, `📂 ${collection}: +${newCount}개 (총 ${artworks.length}개)`);
      }
      
    } catch (e) {
      log(prefix, `❌ ${collection} 에러: ${e.message.slice(0, 50)}`);
    }
  }
  
  await page.close();
  return artworks;
}

// Lille PBA 스크래핑 (이어서)
async function scrapeLille(browser, existingArtworks) {
  const prefix = 'Lille PBA';
  const page = await browser.newPage();
  
  const categories = [
    '16th-20th-century-Paintings',
    'Antiquity',
    'Middle-Ages-and-Renaissance',
    'Ceramics-and-Decorative-Arts',
    'Drawings',
    'Plans-in-Relief',
    'Sculptures'
  ];
  
  const existingUrls = new Set(existingArtworks.map(a => a.detailUrl));
  const artworks = [...existingArtworks];
  
  log(prefix, `🏛️ 기존 ${existingArtworks.length}개 로드됨`);
  
  for (const category of categories) {
    try {
      const url = `https://pba.lille.fr/en/Collections/Highlights/${category}`;
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(2000);
      
      const items = await page.evaluate(() => {
        const cards = document.querySelectorAll('.card, .artwork-card, [class*="artwork"], .ez-view-galeriephotosfullcontent');
        return [...cards].map(card => {
          const link = card.querySelector('a');
          const img = card.querySelector('img');
          const titleEl = card.querySelector('.title, h3, h4, .card-title');
          const artistEl = card.querySelector('.author, .artist, .card-subtitle');
          
          return {
            detailUrl: link?.href || '',
            imageUrl: img?.src || img?.dataset?.src || '',
            title: titleEl?.textContent?.trim() || '',
            artist: artistEl?.textContent?.trim() || ''
          };
        }).filter(item => item.detailUrl);
      });
      
      let newCount = 0;
      for (const item of items) {
        if (existingUrls.has(item.detailUrl)) continue;
        existingUrls.add(item.detailUrl);
        
        artworks.push({
          id: `lille-${artworks.length + 1}`,
          title: item.title || 'Untitled',
          artist: item.artist || 'Unknown',
          year: '',
          medium: category,
          artworkType: category,
          imageUrl: item.imageUrl,
          detailUrl: item.detailUrl,
          museum: 'Palais des Beaux-Arts de Lille',
          collection: category
        });
        newCount++;
      }
      
      if (newCount > 0) {
        log(prefix, `📂 ${category}: +${newCount}개 (총 ${artworks.length}개)`);
      }
      
    } catch (e) {
      log(prefix, `❌ ${category} 에러: ${e.message.slice(0, 50)}`);
    }
  }
  
  await page.close();
  return artworks;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  🏛️  French Museums Scraper V5 (이어서 수집 + 무제한 페이지)');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  시작 시간: ${new Date().toLocaleString()}`);
  console.log('───────────────────────────────────────────────────────────────\n');
  
  // 기존 데이터 로드
  const existingData = {
    drawings: loadExisting('mamcs-strasbourg-drawings-collection.json'),
    paintings: loadExisting('mamcs-strasbourg-paintings-collection.json'),
    photography: loadExisting('mamcs-strasbourg-photography-collection.json'),
    graphicdesign: loadExisting('mamcs-strasbourg-graphic-design-collection.json'),
    rouen: loadExisting('musee-beaux-arts-rouen-collection.json'),
    lille: loadExisting('palais-beaux-arts-lille-collection.json')
  };
  
  console.log('📊 기존 데이터:');
  console.log(`   - MAMCS Drawing: ${existingData.drawings.length}개`);
  console.log(`   - MAMCS Painting: ${existingData.paintings.length}개`);
  console.log(`   - MAMCS Photography: ${existingData.photography.length}개`);
  console.log(`   - MAMCS Graphic Design: ${existingData.graphicdesign.length}개`);
  console.log(`   - Rouen MBA: ${existingData.rouen.length}개`);
  console.log(`   - Lille PBA: ${existingData.lille.length}개`);
  console.log('');
  
  const browser = await chromium.launch({ headless: true });
  
  try {
    // MAMCS 4개 카테고리 병렬 스크래핑
    log('Main', '🚀 MAMCS 4개 카테고리 병렬 스크래핑 시작...');
    
    const mamcsResults = await Promise.all([
      scrapeMAMCSCategory(browser, 'drawings', 'Dessin', 'Drawing', existingData.drawings),
      scrapeMAMCSCategory(browser, 'paintings', 'Peinture', 'Painting', existingData.paintings),
      scrapeMAMCSCategory(browser, 'photography', 'Photographie', 'Photography', existingData.photography),
      scrapeMAMCSCategory(browser, 'graphicdesign', 'Design%20graphique', 'Graphic Design', existingData.graphicdesign)
    ]);
    
    // MAMCS 결과 저장
    saveMAMCSCategory('drawings', mamcsResults[0], 'Drawing');
    saveMAMCSCategory('paintings', mamcsResults[1], 'Painting');
    saveMAMCSCategory('photography', mamcsResults[2], 'Photography');
    saveMAMCSCategory('graphicdesign', mamcsResults[3], 'Graphic Design');
    
    // Rouen & Lille
    log('Main', '🚀 Rouen & Lille 스크래핑...');
    
    const [rouenArtworks, lilleArtworks] = await Promise.all([
      scrapeRouen(browser, existingData.rouen),
      scrapeLille(browser, existingData.lille)
    ]);
    
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
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  ✅ 스크래핑 완료!');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  MAMCS Drawing: ${mamcsResults[0].length}개`);
    console.log(`  MAMCS Painting: ${mamcsResults[1].length}개`);
    console.log(`  MAMCS Photography: ${mamcsResults[2].length}개`);
    console.log(`  MAMCS Graphic Design: ${mamcsResults[3].length}개`);
    console.log(`  Rouen MBA: ${rouenArtworks.length}개`);
    console.log(`  Lille PBA: ${lilleArtworks.length}개`);
    console.log(`  ────────────────────────────────────`);
    const total = mamcsResults[0].length + mamcsResults[1].length + mamcsResults[2].length + mamcsResults[3].length + rouenArtworks.length + lilleArtworks.length;
    console.log(`  총: ${total}개`);
    console.log('═══════════════════════════════════════════════════════════════');
    
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
