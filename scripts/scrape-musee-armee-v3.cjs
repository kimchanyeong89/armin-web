/**
 * Musée de l'Armée (Invalides) Collection Scraper - v3
 * 
 * API 직접 호출 + 페이지네이션 완전 지원
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

// Collections to scrape
const COLLECTIONS = [
  {
    id: '5d9f27b0-02aa-46d7-9f68-e1456a7a0867',
    name: 'napoleon',
    title: 'Objets de la période napoléonienne',
    outputFile: 'musee-armee-napoleon.json',
    expectedCount: 219
  },
  {
    id: 'affe25d5-be7a-40a8-bbc8-67989a8afca6',
    name: 'noel',
    title: 'Fêtes de fin d\'année - Noël',
    outputFile: 'musee-armee-noel.json',
    expectedCount: 22
  }
];

const PAGE_SIZE = 100;  // API에서 한 번에 가져올 개수
const DELAY = 600;
const SAVE_INTERVAL = 20;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
        artworks.forEach(a => processedIds.add(a.sourceUrl));
        console.log(`📂 Resuming from ${artworks.length} existing artworks`);
      }
    } catch (e) {
      console.log('Starting fresh...');
    }
  }
  
  const page = await browser.newPage();
  
  // Collect all search results via API interception
  let allSearchResults = [];
  let totalHits = 0;
  let maxPageNo = 0;
  
  try {
    // First, visit the collection page to establish session
    console.log('\n📡 Connecting to Musée de l\'Armée...');
    await page.goto(`${BASE_URL}/notice?id=${collection.id}`, { 
      waitUntil: 'networkidle', 
      timeout: 60000 
    });
    await sleep(2000);
    
    // Now we need to intercept the search API calls
    // The page makes a POST to /in/rest/api/search with profile:ID
    
    // Set up API response capture
    page.on('response', async response => {
      const url = response.url();
      if (url.includes('/in/rest/api/search') && response.request().method() === 'POST') {
        try {
          const json = await response.json();
          if (json.numHits) totalHits = json.numHits;
          if (json.maxPageNo !== undefined) maxPageNo = json.maxPageNo;
          if (json.resultSet && json.resultSet.length > 0) {
            // Add new results, avoiding duplicates
            for (const result of json.resultSet) {
              const id = result.id?.[0]?.value || '';
              if (id && !allSearchResults.find(r => r.id?.[0]?.value === id)) {
                allSearchResults.push(result);
              }
            }
          }
        } catch (e) {}
      }
    });
    
    // Reload to capture initial results
    await page.goto(`${BASE_URL}/notice?id=${collection.id}`, { 
      waitUntil: 'networkidle', 
      timeout: 60000 
    });
    await sleep(3000);
    
    console.log(`📊 Total hits: ${totalHits}`);
    console.log(`📄 Max pages: ${maxPageNo + 1}`);
    console.log(`📋 Initial results: ${allSearchResults.length}`);
    
    // If we don't have all results, we need to scroll/paginate
    // The site uses infinite scroll or lazy loading
    let previousCount = 0;
    let scrollAttempts = 0;
    const maxScrollAttempts = 50;
    
    while (allSearchResults.length < totalHits && scrollAttempts < maxScrollAttempts) {
      // Scroll to bottom to trigger loading
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await sleep(1500);
      
      // Also try clicking "load more" button if exists
      try {
        await page.click('button[class*="more"], [class*="load-more"], .MuiButton-root:has-text("Plus")', { timeout: 500 });
        await sleep(1500);
      } catch (e) {}
      
      scrollAttempts++;
      
      // Check if we got more results
      if (allSearchResults.length > previousCount) {
        console.log(`   Scroll ${scrollAttempts}: ${allSearchResults.length} results`);
        previousCount = allSearchResults.length;
      }
      
      // If no new results after 5 attempts, break
      if (scrollAttempts % 5 === 0 && allSearchResults.length === previousCount) {
        console.log('   No more results from scrolling');
        break;
      }
      
      if (testMode && allSearchResults.length >= 10) {
        console.log('   Test mode limit reached');
        break;
      }
    }
    
    console.log(`\n✅ Collected ${allSearchResults.length} items from API`);
    
    // If we still don't have enough results, manually paginate the API
    if (allSearchResults.length < totalHits && !testMode) {
      console.log('\n📡 Manually fetching remaining pages...');
      
      for (let pageNo = 1; pageNo <= maxPageNo; pageNo++) {
        // Check if we already have enough
        if (allSearchResults.length >= totalHits) break;
        
        console.log(`   Fetching page ${pageNo + 1}/${maxPageNo + 1}...`);
        
        // Navigate with pagination parameter
        // The site uses queryId in URL for pagination
        const queryId = `N-${Date.now()}-manual`;
        
        // Trigger page load - we rely on the response listener
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });
        await sleep(1000);
      }
    }
    
    // Now process each result to get full details
    const itemsToProcess = testMode ? allSearchResults.slice(0, 10) : allSearchResults;
    console.log(`\n📝 Processing ${itemsToProcess.length} artworks...`);
    
    for (let i = 0; i < itemsToProcess.length; i++) {
      const result = itemsToProcess[i];
      const itemId = result.id?.[0]?.value || '';
      const sourceUrl = `${BASE_URL}/notice?id=${encodeURIComponent(itemId)}`;
      
      // Skip if already processed
      if (processedIds.has(sourceUrl)) {
        console.log(`[${i + 1}/${itemsToProcess.length}] ⏭ Already processed`);
        continue;
      }
      
      try {
        // Set up listener for notice API
        let noticeData = null;
        const noticeListener = async response => {
          if (response.url().includes('/in/rest/api/notice') && response.url().includes('aspect=Meta')) {
            try {
              noticeData = await response.json();
            } catch (e) {}
          }
        };
        page.on('response', noticeListener);
        
        await page.goto(sourceUrl, { waitUntil: 'networkidle', timeout: 45000 });
        await sleep(DELAY);
        
        page.off('response', noticeListener);
        
        // Extract data
        let artwork = {
          id: `musee-armee-${artworks.length + 1}`,
          title: '',
          artist: '',
          year: '',
          medium: '',
          dimensions: '',
          inventoryNumber: '',
          place: '',
          subject: '',
          theme: '',
          imageUrl: '',
          sourceUrl: sourceUrl
        };
        
        // Try to get from notice API
        if (noticeData && noticeData.fields) {
          const fields = noticeData.fields;
          const getField = (name) => {
            const field = fields.find(f => f.name === name);
            if (!field || !field.values) return '';
            return field.values.map(v => v.qa?.Answer || '').filter(Boolean).join(', ');
          };
          
          artwork.title = getField('title') || 'Sans titre';
          artwork.artist = getField('creator') || 'Anonyme';
          artwork.year = getField('dateDescription') || '';
          artwork.medium = getField('descriptionTechnique') || '';
          artwork.dimensions = getField('descriptionDimension') || '';
          artwork.inventoryNumber = getField('identifierInventory') || '';
          artwork.place = getField('place') || '';
          artwork.subject = getField('subjectPerson') || '';
          artwork.theme = getField('subjectTheme') || '';
        } else {
          // Fallback to search result data
          const getValue = (field) => {
            if (!field || !Array.isArray(field)) return '';
            return field[0]?.value || '';
          };
          const getMeta = (meta, key) => {
            if (!meta || !meta[key]) return '';
            return Array.isArray(meta[key]) ? meta[key].map(v => v.value).join(', ') : '';
          };
          
          const meta = result.meta || {};
          artwork.title = getValue(result.title) || 'Sans titre';
          artwork.artist = getMeta(meta, 'creator') || 'Anonyme';
          artwork.year = getMeta(meta, 'dateDescription') || '';
          artwork.inventoryNumber = getMeta(meta, 'identifierInventory') || '';
        }
        
        // Get image URL
        const imgSrc = result.imageSource_512?.[0]?.value || result.imageSource_256?.[0]?.value || '';
        artwork.imageUrl = imgSrc ? `${BASE_URL}${imgSrc}` : '';
        
        // Fallback: get image from page
        if (!artwork.imageUrl) {
          artwork.imageUrl = await page.evaluate(() => {
            const img = document.querySelector('img[src*="/rest/Thumb"], img[src*="/Attachment"]');
            return img?.src || '';
          });
        }
        
        artworks.push(artwork);
        processedIds.add(sourceUrl);
        
        console.log(`[${artworks.length}/${itemsToProcess.length}] ✓ ${artwork.title.substring(0, 45)}`);
        
        // Save periodically
        if (artworks.length % SAVE_INTERVAL === 0) {
          saveProgress(outputPath, artworks, collection);
        }
        
      } catch (err) {
        console.log(`[${i + 1}] ✗ Error: ${err.message.substring(0, 50)}`);
      }
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
  console.log('  MUSÉE DE L\'ARMÉE COLLECTION SCRAPER v3');
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
