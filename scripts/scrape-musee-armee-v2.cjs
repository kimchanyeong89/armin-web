/**
 * Musée de l'Armée (Invalides) Collection Scraper - v2
 * 
 * DOM 기반 스크래핑 + API 인터셉트
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
    outputFile: 'musee-armee-napoleon.json',
    expectedCount: 219
  }
];

const DELAY = 800;
const SAVE_INTERVAL = 10;

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
  
  // Intercept API responses to get the search results
  let searchResults = [];
  let totalHits = 0;
  
  page.on('response', async response => {
    const url = response.url();
    if (url.includes('/in/rest/api/search') && response.request().method() === 'POST') {
      try {
        const json = await response.json();
        totalHits = json.numHits || 0;
        if (json.resultSet) {
          searchResults = json.resultSet;
        }
      } catch (e) {}
    }
  });
  
  try {
    // Visit collection page
    console.log('\n📡 Loading collection page...');
    await page.goto(`${BASE_URL}/notice?id=${collection.id}`, { 
      waitUntil: 'networkidle', 
      timeout: 60000 
    });
    await sleep(3000);
    
    console.log(`📊 Total hits from API: ${totalHits}`);
    console.log(`📋 Search results captured: ${searchResults.length}`);
    
    // Get all artwork links from the page
    let allArtworkLinks = [];
    let currentPage = 1;
    const maxItems = testMode ? 10 : (collection.expectedCount || 1000);
    
    while (allArtworkLinks.length < maxItems) {
      // Get links from current page
      const pageLinks = await page.evaluate(() => {
        const links = [];
        document.querySelectorAll('a[href*="/notice?id="]').forEach(a => {
          const href = a.href;
          // Skip collection profile links
          if (href.includes('5d9f27b0-02aa-46d7-9f68-e1456a7a0867')) return;
          
          const title = a.innerText?.trim() || '';
          // Get image if available
          const img = a.querySelector('img') || a.closest('div')?.querySelector('img');
          const imgSrc = img?.src || '';
          
          if (!links.find(l => l.href === href)) {
            links.push({ href, title: title.substring(0, 100), imgSrc });
          }
        });
        return links;
      });
      
      console.log(`\n📄 Page ${currentPage}: Found ${pageLinks.length} artwork links`);
      
      // Add new links
      for (const link of pageLinks) {
        if (!allArtworkLinks.find(l => l.href === link.href)) {
          allArtworkLinks.push(link);
        }
      }
      
      console.log(`   Total links collected: ${allArtworkLinks.length}`);
      
      // Check if there's more pages - look for "load more" or pagination
      const hasNextPage = await page.evaluate(() => {
        // Look for pagination or "load more" button
        const loadMore = document.querySelector('button[class*="load"], [class*="more"], [class*="next"]');
        const pagination = document.querySelector('[class*="pagination"] button:not([disabled])');
        return !!(loadMore || pagination);
      });
      
      if (!hasNextPage || allArtworkLinks.length >= maxItems) {
        console.log('   No more pages or reached limit');
        break;
      }
      
      // Try to load next page
      try {
        // Scroll down to trigger lazy loading
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await sleep(1500);
        
        // Click next/more button if available
        const clicked = await page.evaluate(() => {
          const btn = document.querySelector('button[class*="load"], [class*="more"], [class*="next"]');
          if (btn) {
            btn.click();
            return true;
          }
          return false;
        });
        
        if (clicked) {
          await sleep(2000);
          currentPage++;
        } else {
          break;
        }
      } catch (e) {
        console.log('   Pagination failed:', e.message);
        break;
      }
    }
    
    console.log(`\n✅ Collected ${allArtworkLinks.length} artwork links`);
    
    // Now visit each artwork detail page
    const linksToProcess = allArtworkLinks.slice(0, maxItems);
    
    for (let i = 0; i < linksToProcess.length; i++) {
      const link = linksToProcess[i];
      
      // Skip if already processed
      if (processedIds.has(link.href)) {
        console.log(`[${i + 1}/${linksToProcess.length}] ⏭ Already processed`);
        continue;
      }
      
      try {
        // Clear previous API data
        let noticeData = null;
        
        // Set up listener for this detail page
        const detailListener = async response => {
          const url = response.url();
          if (url.includes('/in/rest/api/notice') && url.includes('aspect=Meta')) {
            try {
              noticeData = await response.json();
            } catch (e) {}
          }
        };
        page.on('response', detailListener);
        
        await page.goto(link.href, { waitUntil: 'networkidle', timeout: 45000 });
        await sleep(1500);
        
        page.off('response', detailListener);
        
        // Extract data from notice API or DOM
        let artwork = null;
        
        if (noticeData && noticeData.fields) {
          // Extract from API response
          const fields = noticeData.fields;
          const getField = (name) => {
            const field = fields.find(f => f.name === name);
            if (!field || !field.values) return '';
            return field.values.map(v => v.qa?.Answer || '').filter(Boolean).join(', ');
          };
          
          artwork = {
            id: `musee-armee-${artworks.length + 1}`,
            title: getField('title') || link.title || 'Sans titre',
            artist: getField('creator') || 'Anonyme',
            year: getField('dateDescription') || '',
            medium: getField('descriptionTechnique') || '',
            dimensions: getField('descriptionDimension') || '',
            inventoryNumber: getField('identifierInventory') || '',
            place: getField('place') || '',
            subject: getField('subjectPerson') || '',
            theme: getField('subjectTheme') || ''
          };
        } else {
          // Fallback to DOM scraping
          artwork = await page.evaluate(() => {
            const getText = (selector) => document.querySelector(selector)?.innerText?.trim() || '';
            
            // Try to find title from h1 or h2
            const title = getText('h1') || getText('h2') || '';
            
            // Look for field containers
            const findField = (labelPattern) => {
              const elements = document.querySelectorAll('span, div, p');
              for (const el of elements) {
                const text = el.innerText || '';
                if (text.match(labelPattern)) {
                  const parent = el.closest('div, tr');
                  const value = parent?.querySelector('.value, td:last-child')?.innerText?.trim();
                  if (value) return value;
                }
              }
              return '';
            };
            
            return {
              title: title || 'Sans titre',
              artist: findField(/Auteur|Exécutant/i) || 'Anonyme',
              year: findField(/Date|Période/i) || '',
              medium: findField(/Technique/i) || '',
              dimensions: findField(/Dimension/i) || '',
              inventoryNumber: findField(/inventaire/i) || ''
            };
          });
          
          artwork.id = `musee-armee-${artworks.length + 1}`;
        }
        
        // Get image URL
        const imageUrl = link.imgSrc || await page.evaluate(() => {
          const img = document.querySelector('img[src*="/rest/Thumb"], img[src*="/Attachment"]');
          return img?.src || '';
        });
        
        artwork.imageUrl = imageUrl;
        artwork.sourceUrl = link.href;
        
        artworks.push(artwork);
        processedIds.add(link.href);
        
        console.log(`[${artworks.length}/${linksToProcess.length}] ✓ ${artwork.title.substring(0, 50)}`);
        
        // Save periodically
        if (artworks.length % SAVE_INTERVAL === 0) {
          saveProgress(outputPath, artworks, collection);
        }
        
        await sleep(DELAY);
        
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
  console.log('  MUSÉE DE L\'ARMÉE COLLECTION SCRAPER v2');
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
