/**
 * Musée de l'Armée (Invalides) Collection Scraper
 * 
 * 나폴레옹 시대 컬렉션 스크래핑 (219 artworks)
 * 
 * 6가지 필수 데이터:
 * 1. title - 작품 제목
 * 2. artist - 작가
 * 3. year - 연도/시기
 * 4. medium - 재료/기법
 * 5. dimensions - 크기
 * 6. inventoryNumber - 인벤토리 번호
 * + imageUrl - 이미지 URL
 * + sourceUrl - 원본 페이지 URL
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://basedescollections.musee-armee.fr';

// Napoleon Collection Profile ID
const COLLECTIONS = [
  {
    id: '5d9f27b0-02aa-46d7-9f68-e1456a7a0867',
    name: 'napoleon',
    title: 'Objets de la période napoléonienne',
    outputFile: 'musee-armee-napoleon.json'
  }
];

const PAGE_SIZE = 50;  // 한 번에 가져올 개수
const DELAY = 500;
const SAVE_INTERVAL = 25;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchSearchResults(page, profileId, pageNo = 0, pageSize = PAGE_SIZE) {
  const queryId = `N-${Date.now()}-scraper`;
  
  // POST search API
  const response = await page.evaluate(async ({ profileId, pageNo, pageSize, queryId }) => {
    const res = await fetch('https://basedescollections.musee-armee.fr/in/rest/api/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: [`profile:${profileId}`],
        queryid: queryId,
        sf: '*',
        includeFacets: false,
        multiselect: ['*'],
        pageSize: pageSize,
        pageNo: pageNo,
        locale: 'fr'
      })
    });
    return await res.json();
  }, { profileId, pageNo, pageSize, queryId });
  
  return response;
}

async function fetchArtworkDetail(page, artworkId) {
  // Fetch Meta aspect for full details
  const response = await page.evaluate(async (id) => {
    const res = await fetch(`https://basedescollections.musee-armee.fr/in/rest/api/notice?id=${encodeURIComponent(id)}&locale=fr&aspect=Meta`);
    return await res.json();
  }, artworkId);
  
  return response;
}

function extractArtworkFromSearch(result) {
  // Extract basic data from search results
  const getValue = (field) => {
    if (!field) return '';
    if (Array.isArray(field) && field.length > 0) {
      return field[0].value || '';
    }
    return '';
  };
  
  const getMeta = (meta, key) => {
    if (!meta || !meta[key]) return '';
    if (Array.isArray(meta[key]) && meta[key].length > 0) {
      return meta[key].map(v => v.value).join(', ');
    }
    return '';
  };
  
  const id = getValue(result.id);
  const ark = getValue(result.ark);
  const title = getValue(result.title);
  const imageSource = getValue(result.imageSource_512);
  
  // Extract meta fields
  const meta = result.meta || {};
  const artist = getMeta(meta, 'creator');
  const inventoryNumber = getMeta(meta, 'identifierInventory');
  const place = getMeta(meta, 'place');
  const dateDesc = getMeta(meta, 'dateDescription');
  
  return {
    id: ark || id,
    title: title || 'Sans titre',
    artist: artist || 'Anonyme',
    year: dateDesc || '',
    inventoryNumber: inventoryNumber || '',
    place: place || '',
    imageUrl: imageSource ? `${BASE_URL}${imageSource}` : '',
    sourceUrl: `${BASE_URL}/notice?id=${encodeURIComponent(id)}`
  };
}

function extractArtworkFromDetail(detail) {
  // Extract full data from notice API
  const fields = detail.fields || [];
  
  const getField = (name) => {
    const field = fields.find(f => f.name === name);
    if (!field || !field.values) return '';
    return field.values.map(v => v.qa?.Answer || '').filter(Boolean).join(', ');
  };
  
  return {
    title: getField('title') || 'Sans titre',
    artist: getField('creator') || 'Anonyme',
    year: getField('dateDescription') || '',
    medium: getField('descriptionTechnique') || '',
    dimensions: getField('descriptionDimension') || '',
    inventoryNumber: getField('identifierInventory') || '',
    place: getField('place') || '',
    subject: getField('subjectPerson') || '',
    theme: getField('subjectTheme') || ''
  };
}

async function scrapeCollection(browser, collection, testMode = false) {
  console.log('\n' + '='.repeat(60));
  console.log(`SCRAPING: ${collection.title}`);
  console.log('='.repeat(60));
  
  const outputPath = path.join(__dirname, '..', 'public', 'data', collection.outputFile);
  
  // Load existing progress
  let artworks = [];
  let processedIds = new Set();
  
  if (fs.existsSync(outputPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
      if (existing.artworks && existing.artworks.length > 0) {
        artworks = existing.artworks;
        artworks.forEach(a => processedIds.add(a.id));
        console.log(`📂 Resuming from ${artworks.length} existing artworks`);
      }
    } catch (e) {
      console.log('Starting fresh...');
    }
  }
  
  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'fr-FR,fr;q=0.9'
  });
  
  try {
    // First, visit the collection page to establish session and trigger API calls
    console.log('\n📡 Connecting to Musée de l\'Armée database...');
    await page.goto(`${BASE_URL}/notice?id=${collection.id}`, { waitUntil: 'networkidle', timeout: 60000 });
    await sleep(3000);
    
    // Now the page should have made the API call, let's make our own
    console.log('🔍 Fetching collection info...');
    const firstPage = await fetchSearchResults(page, collection.id, 0, 1);
    const totalHits = firstPage.numHits || 0;
    const maxPageNo = firstPage.maxPageNo || 0;
    
    console.log(`📊 Total artworks: ${totalHits}`);
    console.log(`📄 Max pages: ${maxPageNo + 1} (${PAGE_SIZE} per page)`);
    
    if (testMode) {
      console.log('\n🧪 TEST MODE - Only fetching first 10 artworks');
    }
    
    const maxItems = testMode ? 10 : totalHits;
    const totalPages = testMode ? 1 : (maxPageNo + 1);
    
    // Fetch all pages
    for (let pageNo = 0; pageNo < totalPages && artworks.length < maxItems; pageNo++) {
      console.log(`\n📄 Page ${pageNo + 1}/${totalPages}...`);
      
      const searchResult = await fetchSearchResults(page, collection.id, pageNo, PAGE_SIZE);
      const results = searchResult.resultSet || [];
      
      console.log(`   Found ${results.length} items`);
      
      for (let i = 0; i < results.length && artworks.length < maxItems; i++) {
        const result = results[i];
        const basicData = extractArtworkFromSearch(result);
        
        // Skip if already processed
        if (processedIds.has(basicData.id)) {
          console.log(`   [${i + 1}] ⏭ Already processed: ${basicData.title.substring(0, 40)}`);
          continue;
        }
        
        // Fetch full details for medium, dimensions, etc.
        try {
          const fullId = result.id?.[0]?.value || '';
          if (fullId) {
            const detail = await fetchArtworkDetail(page, fullId);
            const detailData = extractArtworkFromDetail(detail);
            
            // Merge basic and detail data
            const artwork = {
              id: `musee-armee-${artworks.length + 1}`,
              ark: basicData.id,
              title: detailData.title || basicData.title,
              artist: detailData.artist || basicData.artist,
              year: detailData.year || basicData.year,
              medium: detailData.medium || '',
              dimensions: detailData.dimensions || '',
              inventoryNumber: detailData.inventoryNumber || basicData.inventoryNumber,
              place: detailData.place || basicData.place,
              subject: detailData.subject || '',
              theme: detailData.theme || '',
              imageUrl: basicData.imageUrl,
              sourceUrl: basicData.sourceUrl
            };
            
            artworks.push(artwork);
            processedIds.add(basicData.id);
            
            console.log(`   [${artworks.length}/${maxItems}] ✓ ${artwork.title.substring(0, 40)}`);
            
            // Save periodically
            if (artworks.length % SAVE_INTERVAL === 0) {
              saveProgress(outputPath, artworks, collection);
            }
          }
        } catch (err) {
          console.log(`   [${i + 1}] ✗ Error: ${err.message.substring(0, 50)}`);
        }
        
        await sleep(DELAY);
      }
      
      // Save after each page
      saveProgress(outputPath, artworks, collection);
    }
    
  } finally {
    await page.close();
  }
  
  // Final save
  saveProgress(outputPath, artworks, collection);
  
  console.log('\n' + '='.repeat(60));
  console.log(`✅ ${collection.title}: ${artworks.length} artworks scraped`);
  console.log('='.repeat(60));
  
  return artworks.length;
}

function saveProgress(outputPath, artworks, collection) {
  const data = {
    exhibitionId: `musee-armee-${collection.name}`,
    title: collection.title,
    museum: 'Musée de l\'Armée - Invalides',
    location: 'Paris, France',
    type: 'permanent',
    description: `Collection permanente: ${collection.title}`,
    totalArtworks: artworks.length,
    scrapedAt: new Date().toISOString(),
    artworks
  };
  
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
  console.log(`   💾 Saved: ${artworks.length} artworks`);
}

async function main() {
  const args = process.argv.slice(2);
  const testMode = args.includes('--test');
  
  console.log('\n' + '#'.repeat(60));
  console.log('  MUSÉE DE L\'ARMÉE COLLECTION SCRAPER');
  console.log('  Les Invalides, Paris');
  console.log('#'.repeat(60));
  
  if (testMode) {
    console.log('\n🧪 Running in TEST mode (10 artworks only)');
  }
  
  const browser = await chromium.launch({
    headless: true
  });
  
  try {
    const results = {};
    
    for (const collection of COLLECTIONS) {
      results[collection.name] = await scrapeCollection(browser, collection, testMode);
    }
    
    console.log('\n\n' + '='.repeat(60));
    console.log('FINAL RESULTS:');
    console.log('='.repeat(60));
    for (const [name, count] of Object.entries(results)) {
      console.log(`  ${name}: ${count} artworks`);
    }
    
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
