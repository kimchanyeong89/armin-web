/**
 * Musée de l'Armée (Invalides) Domain Scraper - Stable Version
 * 
 * API 직접 호출 방식으로 안정적인 스크래핑
 * 
 * 3개 도메인 스크래핑:
 * - Photographie (332)
 * - Dessin (1068)
 * - Peinture (77)
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://basedescollections.musee-armee.fr';

// 3 domains to scrape
const DOMAINS = [
  {
    domain: 'Photographie',
    name: 'photographie',
    title: 'Photographie',
    outputFile: 'musee-armee-photographie.json',
    expectedCount: 332
  },
  {
    domain: 'Dessin',
    name: 'dessin', 
    title: 'Dessin',
    outputFile: 'musee-armee-dessin.json',
    expectedCount: 1068
  },
  {
    domain: 'Peinture',
    name: 'peinture',
    title: 'Peinture',
    outputFile: 'musee-armee-peinture.json',
    expectedCount: 77
  }
];

const DELAY = 500;
const SAVE_INTERVAL = 25;
const PAGE_SIZE = 50;  // API page size

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function scrapeDomain(domainConfig, testMode = false) {
  console.log('\n' + '='.repeat(60));
  console.log(`SCRAPING: ${domainConfig.title} (expected: ${domainConfig.expectedCount})`);
  console.log('='.repeat(60));
  
  const outputPath = path.join(__dirname, '..', 'public', 'data', domainConfig.outputFile);
  
  // Load existing progress
  let artworks = [];
  let processedIds = new Set();
  
  if (fs.existsSync(outputPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
      if (existing.artworks && existing.artworks.length > 0) {
        artworks = existing.artworks;
        artworks.forEach(a => processedIds.add(a.ark || a.sourceUrl));
        console.log(`📂 Resuming from ${artworks.length} existing artworks`);
      }
    } catch (e) {
      console.log('Starting fresh...');
    }
  }
  
  // Launch fresh browser for this domain
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  
  try {
    // First, visit the search page to establish session
    console.log('\n📡 Establishing session...');
    const searchUrl = `${BASE_URL}/query?q=domain_s:"${encodeURIComponent(domainConfig.domain)}"`;
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await sleep(3000);
    
    // Collect all results by scrolling
    let allResults = [];
    let totalHits = 0;
    
    // Set up response listener
    page.on('response', async response => {
      const url = response.url();
      if (url.includes('/in/rest/api/search') && response.request().method() === 'POST') {
        try {
          const json = await response.json();
          if (json.numHits) totalHits = json.numHits;
          if (json.resultSet) {
            for (const result of json.resultSet) {
              const id = result.id?.[0]?.value || '';
              if (id && !allResults.find(r => r.id?.[0]?.value === id)) {
                allResults.push(result);
              }
            }
          }
        } catch (e) {}
      }
    });
    
    // Reload to capture initial results
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await sleep(2000);
    
    console.log(`📊 Total hits: ${totalHits}`);
    console.log(`📋 Initial results: ${allResults.length}`);
    
    const maxItems = testMode ? 5 : domainConfig.expectedCount;
    
    // Scroll to load all results
    let scrollCount = 0;
    const maxScrolls = Math.ceil(maxItems / 8) + 100;  // Increased
    let lastCount = 0;
    let noNewResultsCount = 0;
    
    while (allResults.length < maxItems && scrollCount < maxScrolls) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await sleep(1500);  // Increased wait time
      scrollCount++;
      
      if (allResults.length > lastCount) {
        noNewResultsCount = 0;
        if (scrollCount % 20 === 0) {
          console.log(`   Scroll ${scrollCount}: ${allResults.length}/${maxItems}`);
        }
        lastCount = allResults.length;
      } else {
        noNewResultsCount++;
        if (noNewResultsCount >= 10) {  // Increased patience
          console.log(`   No new results after ${noNewResultsCount} scrolls, stopping`);
          break;
        }
      }
      
      if (testMode && allResults.length >= 5) break;
    }
    
    console.log(`\n✅ Collected ${allResults.length} items`);
    
    // Process each result
    const itemsToProcess = testMode ? allResults.slice(0, 5) : allResults;
    console.log(`📝 Processing ${itemsToProcess.length} artworks...`);
    
    for (let i = 0; i < itemsToProcess.length; i++) {
      const result = itemsToProcess[i];
      const itemId = result.id?.[0]?.value || '';
      const ark = result.ark?.[0]?.value || itemId;
      
      // Skip if already processed
      if (processedIds.has(ark)) {
        continue;
      }
      
      const sourceUrl = `${BASE_URL}/notice?id=${encodeURIComponent(itemId)}`;
      
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
        
        await page.goto(sourceUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await sleep(DELAY);
        
        page.off('response', noticeListener);
        
        // Build artwork object
        let artwork = {
          id: `musee-armee-${domainConfig.name}-${artworks.length + 1}`,
          ark: ark,
          title: '',
          artist: '',
          year: '',
          medium: '',
          dimensions: '',
          inventoryNumber: '',
          place: '',
          subject: '',
          theme: '',
          domain: domainConfig.domain,
          imageUrl: '',
          sourceUrl: sourceUrl
        };
        
        // Extract from notice API
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
          const getValue = (field) => Array.isArray(field) ? field[0]?.value || '' : '';
          const getMeta = (meta, key) => {
            if (!meta?.[key]) return '';
            return Array.isArray(meta[key]) ? meta[key].map(v => v.value).join(', ') : '';
          };
          
          const meta = result.meta || {};
          artwork.title = getValue(result.title) || 'Sans titre';
          artwork.artist = getMeta(meta, 'creator') || 'Anonyme';
          artwork.inventoryNumber = getMeta(meta, 'identifierInventory') || '';
        }
        
        // Get image URL
        const imgSrc = result.imageSource_512?.[0]?.value || result.imageSource_256?.[0]?.value || '';
        artwork.imageUrl = imgSrc ? `${BASE_URL}${imgSrc}` : '';
        
        artworks.push(artwork);
        processedIds.add(ark);
        
        console.log(`[${artworks.length}/${itemsToProcess.length}] ✓ ${artwork.title.substring(0, 45)}`);
        
        // Save periodically
        if (artworks.length % SAVE_INTERVAL === 0) {
          saveProgress(outputPath, artworks, domainConfig);
        }
        
      } catch (err) {
        console.log(`[${i + 1}] ✗ Error: ${err.message.substring(0, 50)}`);
        // Continue to next item instead of stopping
      }
    }
    
  } catch (err) {
    console.error(`Domain scrape error: ${err.message}`);
  } finally {
    await browser.close();
  }
  
  // Final save
  saveProgress(outputPath, artworks, domainConfig);
  
  console.log('\n' + '='.repeat(60));
  console.log(`✅ ${domainConfig.title}: ${artworks.length}/${domainConfig.expectedCount} artworks`);
  console.log('='.repeat(60));
  
  return artworks.length;
}

function saveProgress(outputPath, artworks, domainConfig) {
  const data = {
    exhibitionId: `musee-armee-${domainConfig.name}`,
    title: `Musée de l'Armée - ${domainConfig.title}`,
    museum: 'Musée de l\'Armée - Invalides',
    location: 'Paris, France',
    type: 'permanent',
    description: `Collection permanente: ${domainConfig.title}`,
    domain: domainConfig.domain,
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
  
  // Allow specifying which domain to scrape
  let domainsToScrape = DOMAINS;
  const domainArg = args.find(a => !a.startsWith('--'));
  if (domainArg) {
    domainsToScrape = DOMAINS.filter(d => 
      d.name.toLowerCase() === domainArg.toLowerCase() ||
      d.domain.toLowerCase() === domainArg.toLowerCase()
    );
    if (domainsToScrape.length === 0) {
      console.log('Available domains: photographie, dessin, peinture');
      process.exit(1);
    }
  }
  
  console.log('\n' + '#'.repeat(60));
  console.log('  MUSÉE DE L\'ARMÉE - DOMAIN SCRAPER (Stable)');
  console.log('  Les Invalides, Paris');
  console.log('#'.repeat(60));
  console.log(`\n📋 Domains to scrape: ${domainsToScrape.map(d => d.domain).join(', ')}`);
  
  if (testMode) {
    console.log('🧪 Running in TEST mode (5 artworks per domain)');
  }
  
  const results = {};
  
  // Process domains sequentially (each with its own browser)
  for (const domainConfig of domainsToScrape) {
    results[domainConfig.name] = await scrapeDomain(domainConfig, testMode);
  }
  
  console.log('\n\n' + '='.repeat(60));
  console.log('FINAL RESULTS:');
  console.log('='.repeat(60));
  for (const [name, count] of Object.entries(results)) {
    const expected = DOMAINS.find(d => d.name === name)?.expectedCount || '?';
    console.log(`  ${name}: ${count}/${expected} artworks`);
  }
}

main().catch(console.error);
