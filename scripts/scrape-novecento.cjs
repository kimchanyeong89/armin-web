/**
 * Museo Novecento 스크래퍼
 * 
 * 두 컬렉션 수집:
 * 1. Alberto Della Ragione
 * 2. Ottone Rosai
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../public/data');
const PROGRESS_DIR = path.join(__dirname, '../downloads');
const TEST_MODE = process.argv.includes('--test');
const SAVE_INTERVAL = 50;

const COLLECTIONS = [
  {
    id: 'novecento-della-ragione',
    name: 'Alberto Della Ragione Collection',
    url: 'https://www.museonovecento.it/en/collezione/alberto-della-ragione-en/',
    outputFile: 'novecento-della-ragione-collection.json'
  },
  {
    id: 'novecento-rosai',
    name: 'Ottone Rosai Collection',
    url: 'https://www.museonovecento.it/en/collezione/ottone-rosai-en-the-collections/',
    outputFile: 'novecento-rosai-collection.json'
  }
];

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function saveFinal(collectionId, artworks, name) {
  const outputFile = path.join(OUTPUT_DIR, `${collectionId}-collection.json`);
  const collection = {
    museum: 'Museo Novecento',
    museumId: 'museo-novecento',
    location: 'Florence, Italy',
    collectionName: name,
    scrapedAt: new Date().toISOString(),
    totalObjects: artworks.length,
    coverImage: artworks[0]?.image || '',
    objects: artworks
  };
  fs.writeFileSync(outputFile, JSON.stringify(collection, null, 2));
  console.log(`💾 저장: ${outputFile} (${artworks.length}개)`);
}

async function scrapeCollection(browser, collection) {
  console.log(`\n=== ${collection.name} ===`);
  console.log(`URL: ${collection.url}`);
  
  const page = await browser.newPage();
  const artworks = [];
  
  try {
    await page.goto(collection.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(3000);
    
    // 스크롤하면서 모든 작품 로드
    let scrollCount = 0;
    const maxScrolls = TEST_MODE ? 3 : 30;
    
    while (scrollCount < maxScrolls) {
      await page.evaluate(() => window.scrollBy(0, 1000));
      await delay(1000);
      scrollCount++;
    }
    
    // 작품 카드 수집 - 정확한 HTML 구조 기반
    // a.single-collezione-wrapper > article.single-collezione-container
    //   h2.txt-h4 = 작가
    //   h3.txt-h5 = 제목
    //   h6 = 년도
    //   img[data-src] = 이미지
    const cards = await page.evaluate(() => {
      const items = [];
      
      // a.single-collezione-wrapper 또는 article.single-collezione-container 찾기
      const containers = document.querySelectorAll('a.single-collezione-wrapper, article.single-collezione-container');
      
      containers.forEach(el => {
        // 작가: h2.txt-h4
        const artistEl = el.querySelector('h2.txt-h4, h2');
        const artist = artistEl?.textContent?.trim() || '';
        
        // 제목: h3.txt-h5 또는 h3
        const titleEl = el.querySelector('h3.txt-h5, h3');
        const title = titleEl?.textContent?.trim() || '';
        
        // 년도: h6 또는 .collezione-anno 내부
        const yearEl = el.querySelector('.collezione-anno h6, h6');
        const year = yearEl?.textContent?.trim() || '';
        
        // 이미지: data-src 속성 우선
        const img = el.querySelector('img');
        const image = img?.getAttribute('data-src') || img?.src || '';
        
        // 링크 (a 태그이면 href, 아니면 부모 a 태그)
        const link = el.tagName === 'A' ? el.href : el.closest('a')?.href || '';
        
        if (title || artist || image) {
          items.push({
            title: title || 'Untitled',
            artist: artist || '',
            year: year || '',
            image: image,
            url: link
          });
        }
      });
      
      return items;
    });
    
    console.log(`발견된 카드: ${cards.length}개`);
    
    // 중복 제거
    const seen = new Set();
    for (const card of cards) {
      const key = `${card.title}-${card.artist}`;
      if (seen.has(key)) continue;
      seen.add(key);
      
      // 년도 파싱 (ca. 같은 근사치 포함)
      let year = null;
      if (card.year) {
        const yearMatch = card.year.match(/(\d{4})/);
        if (yearMatch) year = yearMatch[1];
      }
      
      const artwork = {
        id: `${collection.id}-${artworks.length + 1}`,
        title: card.title || 'Untitled',
        artist: (card.artist || 'Unknown').replace(/[,\.]/g, ' ').replace(/\s+/g, ' ').trim(),
        year: year,
        medium: '',
        dimensions: '',
        image: card.image || '',
        source: 'Museo Novecento',
        url: card.url || collection.url
      };
      
      artworks.push(artwork);
      console.log(`  ✓ ${artwork.title.substring(0, 30)} | ${artwork.artist.substring(0, 20)} | ${artwork.year || '-'}`);
      
      // 저장 간격
      if (artworks.length % SAVE_INTERVAL === 0) {
        saveFinal(collection.id, artworks, collection.name);
      }
    }
    
    saveFinal(collection.id, artworks, collection.name);
    
    console.log(`\n📊 ${collection.name} 결과:`);
    console.log(`  총: ${artworks.length}개`);
    console.log(`  이미지: ${artworks.filter(a => a.image).length}개`);
    console.log(`  년도: ${artworks.filter(a => a.year).length}개`);
    
  } catch (e) {
    console.log('Error:', e.message);
  }
  
  await page.close();
  return artworks;
}

async function main() {
  console.log('🎨 Museo Novecento 스크래핑');
  console.log(`모드: ${TEST_MODE ? '테스트' : '전체'}`);
  
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    for (const collection of COLLECTIONS) {
      await scrapeCollection(browser, collection);
    }
  } finally {
    await browser.close();
  }
  
  console.log('\n✅ 완료');
}

main().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
