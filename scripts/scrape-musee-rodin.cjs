/**
 * Musée Rodin Collection Scraper
 * 
 * 3개 컬렉션을 각각 별도 JSON으로 저장:
 * - rodin-peintures.json (~210 artworks)
 * - rodin-sculptures.json (~6,800 artworks) 
 * - rodin-gravures.json (~1,200 artworks)
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const COLLECTIONS = {
  peintures: {
    name: 'Peintures',
    pageId: '66615c6ab358e62d33dee7c9',
    maxPages: 15,  // 0-14
    outputFile: 'rodin-peintures.json'
  },
  sculptures: {
    name: 'Sculptures', 
    pageId: '66615b99b358e62d33dee7ba',
    maxPages: 454,  // 0-453
    outputFile: 'rodin-sculptures.json'
  },
  gravures: {
    name: 'Gravures',
    pageId: '66615c38b358e62d33dee7c3',
    maxPages: 80,  // 0-79
    outputFile: 'rodin-gravures.json'
  }
};

const BASE_URL = 'https://collections.musee-rodin.fr';
const DELAY = 800;  // 요청 간격 (ms)
const SAVE_INTERVAL = 25;  // 25개 작품마다 저장

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function scrapeCollection(browser, collectionKey) {
  const collection = COLLECTIONS[collectionKey];
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Starting ${collection.name} collection...`);
  console.log(`Expected: ~${collection.maxPages * 15} artworks`);
  console.log(`${'='.repeat(60)}\n`);

  const outputPath = path.join(__dirname, '..', 'public', 'data', collection.outputFile);
  
  // 이전 진행 상황 로드
  let artworks = [];
  let processedUrls = new Set();
  let startPage = 0;
  
  if (fs.existsSync(outputPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
      if (existing.artworks && existing.artworks.length > 0) {
        artworks = existing.artworks;
        artworks.forEach(a => processedUrls.add(a.sourceUrl));
        // 마지막 저장된 페이지부터 다시 시작
        startPage = Math.floor(artworks.length / 15);
        console.log(`Resuming from page ${startPage}, ${artworks.length} artworks loaded`);
      }
    } catch (e) {
      console.log('Starting fresh...');
    }
  }

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1920, height: 1080 });

  try {
    // 페이지네이션 수집
    for (let pgn = startPage; pgn < collection.maxPages; pgn++) {
      const listUrl = `${BASE_URL}/page/${collectionKey}/${collection.pageId}?v=mosaic&pgn=${pgn}`;
      console.log(`\n[Page ${pgn + 1}/${collection.maxPages}] Loading...`);
      
      await page.goto(listUrl, { waitUntil: 'networkidle2', timeout: 60000 });
      await sleep(500);

      // 작품 링크 수집
      const artworkUrls = await page.evaluate(() => {
        const links = document.querySelectorAll('a[href*="/document/"]');
        const urls = [];
        links.forEach(link => {
          const href = link.getAttribute('href');
          if (href && href.includes('/document/')) {
            // URL에서 쿼리 파라미터 제거하고 기본 URL만 추출
            const urlParts = href.split('?')[0];
            const fullUrl = urlParts.startsWith('http') ? urlParts : `https://collections.musee-rodin.fr${urlParts}`;
            if (!urls.includes(fullUrl)) {
              urls.push(fullUrl);
            }
          }
        });
        return urls;
      });

      console.log(`  Found ${artworkUrls.length} artworks`);

      // 각 작품 상세 페이지 방문
      for (let i = 0; i < artworkUrls.length; i++) {
        const artworkUrl = artworkUrls[i];
        
        // 이미 처리된 URL 스킵
        if (processedUrls.has(artworkUrl)) {
          console.log(`  [${i + 1}/${artworkUrls.length}] Already processed, skipping...`);
          continue;
        }

        try {
          await page.goto(artworkUrl, { waitUntil: 'networkidle2', timeout: 45000 });
          await sleep(DELAY);

          const artwork = await page.evaluate(() => {
            // 제목
            const titleEl = document.querySelector('h2.mt-3.ps-0');
            const title = titleEl ? titleEl.textContent.trim() : '';

            // 필드 값 추출 함수
            const getFieldValue = (fieldId) => {
              const container = document.getElementById(fieldId);
              if (!container) return '';
              const valueEl = container.querySelector('.value-field');
              if (!valueEl) return '';
              return valueEl.textContent.trim();
            };

            // 작가
            const author = getFieldValue('Nauteur-field');
            
            // 연도
            const date = getFieldValue('NdateDeCreation-field');
            
            // 재료
            const materials = getFieldValue('Nmateriaux-field');
            
            // 기법
            const techniques = getFieldValue('Ntechniques-field');
            
            // 크기
            const dimensions = getFieldValue('dimensions-field');
            
            // 소장번호
            const inventoryNumber = getFieldValue('numeroDinventaire-field');
            
            // 이미지 URL (big 사이즈)
            const imgEl = document.querySelector('img[src*="/media/cache/big/"]');
            const imageUrl = imgEl ? imgEl.getAttribute('src') : '';

            return {
              title,
              author,
              date,
              materials,
              techniques,
              dimensions,
              inventoryNumber,
              imageUrl
            };
          });

          // 유효한 작품만 추가
          if (artwork.title || artwork.imageUrl) {
            artworks.push({
              id: `rodin-${artworks.length + 1}`,
              title: artwork.title || 'Sans titre',
              artist: artwork.author ? artwork.author.replace(/\s*\(.*?\)\s*/g, '').trim() : '',
              year: artwork.date || '',
              medium: [artwork.materials, artwork.techniques].filter(Boolean).join(', '),
              dimensions: artwork.dimensions || '',
              inventoryNumber: artwork.inventoryNumber || '',
              imageUrl: artwork.imageUrl || '',
              sourceUrl: artworkUrl
            });

            processedUrls.add(artworkUrl);
            console.log(`  [${i + 1}/${artworkUrls.length}] ✓ ${artwork.title?.substring(0, 50) || 'Sans titre'}`);

            // 주기적 저장
            if (artworks.length % SAVE_INTERVAL === 0) {
              saveProgress(outputPath, artworks, collection.name);
            }
          }
        } catch (err) {
          console.log(`  [${i + 1}/${artworkUrls.length}] ✗ Error: ${err.message.substring(0, 50)}`);
        }
      }

      // 페이지 완료 후 저장
      saveProgress(outputPath, artworks, collection.name);

      // 빈 페이지면 중단
      if (artworkUrls.length === 0) {
        console.log(`No more artworks found. Stopping at page ${pgn}`);
        break;
      }
    }
  } finally {
    await page.close();
  }

  // 최종 저장
  saveProgress(outputPath, artworks, collection.name);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`${collection.name} COMPLETE: ${artworks.length} artworks`);
  console.log(`${'='.repeat(60)}\n`);

  return artworks.length;
}

function saveProgress(outputPath, artworks, collectionName) {
  const data = {
    exhibitionId: `rodin-${collectionName.toLowerCase()}`,
    title: `Musée Rodin - ${collectionName}`,
    museum: 'Musée Rodin',
    location: 'Paris, France',
    type: 'permanent',
    description: `Collection ${collectionName} du Musée Rodin`,
    totalArtworks: artworks.length,
    scrapedAt: new Date().toISOString(),
    artworks
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
  console.log(`    💾 Saved: ${artworks.length} artworks`);
}

async function main() {
  // 커맨드라인 인수로 컬렉션 지정 가능
  const args = process.argv.slice(2);
  let collectionsToScrape = Object.keys(COLLECTIONS);
  
  if (args.length > 0) {
    collectionsToScrape = args.filter(arg => COLLECTIONS[arg]);
    if (collectionsToScrape.length === 0) {
      console.log('Usage: node scrape-musee-rodin.cjs [peintures|sculptures|gravures]');
      console.log('  No args = scrape all collections');
      process.exit(1);
    }
  }

  console.log(`\n${'#'.repeat(60)}`);
  console.log('  MUSÉE RODIN COLLECTION SCRAPER');
  console.log(`  Collections: ${collectionsToScrape.join(', ')}`);
  console.log(`${'#'.repeat(60)}\n`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const results = {};
    for (const key of collectionsToScrape) {
      results[key] = await scrapeCollection(browser, key);
    }

    console.log('\n' + '='.repeat(60));
    console.log('FINAL RESULTS:');
    for (const [key, count] of Object.entries(results)) {
      console.log(`  ${COLLECTIONS[key].name}: ${count} artworks`);
    }
    console.log('='.repeat(60));
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
