/**
 * Musée de l'Armée Domain Scraper - Intercept Version
 * 
 * Uses response interception with pageNo to get ALL results
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://basedescollections.musee-armee.fr';
const PAGE_SIZE = 50;
const DELAY = 500;
const SAVE_INTERVAL = 25;

const DOMAINS = [
  { domain: 'Photographie', name: 'photographie', outputFile: 'musee-armee-photographie.json', expectedCount: 332 },
  { domain: 'Dessin', name: 'dessin', outputFile: 'musee-armee-dessin.json', expectedCount: 1068 },
  { domain: 'Peinture', name: 'peinture', outputFile: 'musee-armee-peinture.json', expectedCount: 77 }
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function scrapeDomain(domainConfig, testMode = false) {
  console.log('\n' + '='.repeat(60));
  console.log(`SCRAPING: ${domainConfig.domain} (expected: ${domainConfig.expectedCount})`);
  console.log('='.repeat(60));
  
  const outputPath = path.join(__dirname, '..', 'public', 'data', domainConfig.outputFile);
  
  // Load existing
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
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const page = await context.newPage();
  
  try {
    // Collect results via response interception
    let allResults = [];
    let totalHits = 0;
    let queryId = null;
    let pagesLoaded = new Set();
    
    page.on('response', async response => {
      if (response.url().includes('/in/rest/api/search') && response.request().method() === 'POST') {
        try {
          const req = JSON.parse(response.request().postData());
          if (req.queryid) queryId = req.queryid;
          const pageNo = req.pageNo || 1;
          
          const json = await response.json();
          if (json.numHits) totalHits = json.numHits;
          
          if (json.resultSet && !pagesLoaded.has(pageNo)) {
            pagesLoaded.add(pageNo);
            for (const item of json.resultSet) {
              const id = item.id?.[0]?.value || '';
              if (id && !allResults.find(r => r.id?.[0]?.value === id)) {
                allResults.push(item);
              }
            }
          }
        } catch (e) {}
      }
    });
    
    // Load initial page
    console.log('\n📡 Loading search page...');
    const searchUrl = `${BASE_URL}/query?q=domain_s:"${encodeURIComponent(domainConfig.domain)}"`;
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await sleep(2000);
    
    console.log(`📊 Total hits: ${totalHits}`);
    console.log(`✅ Query ID: ${queryId}`);
    console.log(`📋 Initial results: ${allResults.length}`);
    
    // Now make direct API calls for all pages using route interception
    const totalPages = Math.ceil(totalHits / PAGE_SIZE);
    console.log(`\n📡 Fetching remaining ${totalPages} pages via direct navigation...`);
    
    // We need to trigger the API calls - let's use route interception to modify requests
    let currentPageNo = 2;
    
    while (allResults.length < totalHits && currentPageNo <= totalPages + 5) {
      // Scroll to trigger more loads
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await sleep(300);
      
      // If scroll doesn't help, try to inject the API call
      if (allResults.length < currentPageNo * PAGE_SIZE && queryId) {
        try {
          const result = await page.evaluate(async (params) => {
            const { queryId, domain, pageNo, pageSize } = params;
            const response = await fetch('/in/rest/api/search', {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              credentials: 'include',
              body: JSON.stringify({
                query: [`domain_s:"${domain}"`],
                queryid: queryId,
                order: "score",
                sf: "*",
                includeFacets: false,
                mappedFQ: {},
                pageNo: pageNo,
                pageSize: pageSize,
                locale: "fr"
              })
            });
            return response.json();
          }, { queryId, domain: domainConfig.domain, pageNo: currentPageNo, pageSize: PAGE_SIZE });
          
          if (result.resultSet && result.resultSet.length > 0) {
            let added = 0;
            for (const item of result.resultSet) {
              const id = item.id?.[0]?.value || '';
              if (id && !allResults.find(r => r.id?.[0]?.value === id)) {
                allResults.push(item);
                added++;
              }
            }
            console.log(`   Page ${currentPageNo}: +${added} items, total: ${allResults.length}/${totalHits}`);
            currentPageNo++;
          } else {
            console.log(`   Page ${currentPageNo}: empty response`);
            break;
          }
        } catch (error) {
          console.log(`   Page ${currentPageNo} error: ${error.message}`);
          break;
        }
      }
      
      await sleep(200);
      
      if (testMode && allResults.length >= 20) break;
    }
    
    console.log(`\n✅ Collected ${allResults.length} total items`);
    
    // Filter new items
    const newResults = allResults.filter(item => {
      const ark = item.ark?.[0]?.value || item.id?.[0]?.value || '';
      return !processedIds.has(ark);
    });
    
    console.log(`📝 ${newResults.length} new items to process (${processedIds.size} already done)`);
    
    if (testMode) {
      newResults.splice(5);
      console.log('TEST MODE: Processing only 5 items');
    }
    
    // Process each new item
    for (let i = 0; i < newResults.length; i++) {
      const result = newResults[i];
      const itemId = result.id?.[0]?.value || '';
      const ark = result.ark?.[0]?.value || itemId;
      const sourceUrl = `${BASE_URL}/notice?id=${encodeURIComponent(itemId)}`;
      
      try {
        // Get notice details
        const noticeResult = await page.evaluate(async (id) => {
          const response = await fetch(`/in/rest/api/notice?id=${encodeURIComponent(id)}&locale=fr&aspect=Meta`, {
            credentials: 'include'
          });
          return response.json();
        }, itemId);
        
        // Build artwork
        let artwork = {
          id: `musee-armee-${domainConfig.name}-${artworks.length + 1}`,
          ark: ark,
          title: result.title?.[0]?.value || result.titre?.[0]?.value || '',
          artist: '',
          year: '',
          medium: '',
          dimensions: '',
          inventoryNumber: '',
          domain: domainConfig.domain,
          imageUrl: result.imageSource_512?.[0]?.value ? `${BASE_URL}${result.imageSource_512[0].value}` : '',
          sourceUrl: sourceUrl
        };
        
        // Extract from notice
        if (noticeResult && noticeResult.fieldGroups) {
          for (const group of noticeResult.fieldGroups) {
            if (!group.fields) continue;
            for (const field of group.fields) {
              for (const item of (field.qa || [])) {
                const val = item.Answer?.value || '';
                if (!val) continue;
                const q = (item.Question?.value || '').toLowerCase();
                
                if (q.includes('titre') && !artwork.title) artwork.title = val;
                else if (q.includes('auteur') || q.includes('créateur')) artwork.artist = val;
                else if (q.includes('date')) artwork.year = val;
                else if (q.includes('technique') || q.includes('matér')) artwork.medium = val;
                else if (q.includes('dimension')) artwork.dimensions = val;
                else if (q.includes('inventaire') || q.includes('numéro')) artwork.inventoryNumber = val;
              }
            }
          }
        }
        
        artworks.push(artwork);
        processedIds.add(ark);
        
        if ((artworks.length) % SAVE_INTERVAL === 0 || i === newResults.length - 1) {
          const output = {
            museum: "Musée de l'Armée (Invalides)",
            collection: domainConfig.domain,
            scrapedAt: new Date().toISOString(),
            totalArtworks: artworks.length,
            artworks: artworks
          };
          fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
          console.log(`💾 Saved: ${artworks.length}/${totalHits} artworks`);
        }
        
        if ((i + 1) % 50 === 0) {
          console.log(`   Progress: ${i + 1}/${newResults.length}`);
        }
        
        await sleep(DELAY);
        
      } catch (error) {
        console.log(`   ⚠️ Error on ${i + 1}: ${error.message}`);
      }
    }
    
    // Final save
    const output = {
      museum: "Musée de l'Armée (Invalides)",
      collection: domainConfig.domain,
      scrapedAt: new Date().toISOString(),
      totalArtworks: artworks.length,
      artworks: artworks
    };
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    
    console.log(`\n✅ ${domainConfig.domain}: ${artworks.length}/${domainConfig.expectedCount} artworks`);
    
  } finally {
    await browser.close();
  }
  
  return artworks.length;
}

// Main
(async () => {
  const args = process.argv.slice(2);
  const domainArg = args[0];
  const countArg = parseInt(args[1]) || null;
  const testMode = args.includes('--test');
  
  let domainsToScrape = DOMAINS;
  
  if (domainArg && !domainArg.startsWith('--')) {
    const match = DOMAINS.find(d => d.domain.toLowerCase() === domainArg.toLowerCase());
    if (match) {
      if (countArg) match.expectedCount = countArg;
      domainsToScrape = [match];
    }
  }
  
  console.log(`🏛️ Musée de l'Armée Scraper - Intercept Version`);
  console.log(`   Domains: ${domainsToScrape.map(d => d.domain).join(', ')}`);
  
  for (const domain of domainsToScrape) {
    await scrapeDomain(domain, testMode);
    await sleep(2000);
  }
  
  console.log('\n🎉 Complete!');
})();
