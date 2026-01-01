/**
 * Musée de l'Armée (Invalides) Domain Scraper - API Pagination Version
 * 
 * Uses browser session to make paginated API calls
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://basedescollections.musee-armee.fr';

const DOMAINS = [
  { domain: 'Photographie', name: 'photographie', outputFile: 'musee-armee-photographie.json', expectedCount: 332 },
  { domain: 'Dessin', name: 'dessin', outputFile: 'musee-armee-dessin.json', expectedCount: 1068 },
  { domain: 'Peinture', name: 'peinture', outputFile: 'musee-armee-peinture.json', expectedCount: 77 }
];

const DELAY = 500;
const SAVE_INTERVAL = 25;
const PAGE_SIZE = 50;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function scrapeDomain(domainConfig, testMode = false) {
  console.log('\n' + '='.repeat(60));
  console.log(`SCRAPING: ${domainConfig.domain} (expected: ${domainConfig.expectedCount})`);
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
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const page = await context.newPage();
  
  try {
    // Establish session
    console.log('\n📡 Establishing session...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await sleep(2000);
    
    // Collect all results using API pagination
    let allResults = [];
    let pageNum = 0;
    let totalHits = 0;
    
    console.log('\n📡 Fetching all results via API...');
    
    while (true) {
      const searchBody = {
        query: [`domain_s:"${domainConfig.domain}"`],
        sf: "*",
        pageSize: PAGE_SIZE,
        locale: "fr"
      };
      
      // Use page.evaluate to make API call with session cookies
      const result = await page.evaluate(async (params) => {
        const response = await fetch('/in/rest/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params.body)
        });
        return response.json();
      }, { body: searchBody });
      
      if (result.code || result.errorReponse) {
        console.log('   API error, trying scroll method...');
        break;
      }
      
      if (result.numHits) totalHits = result.numHits;
      
      if (!result.resultSet || result.resultSet.length === 0) {
        // No results or end reached - try scrolling
        break;
      }
      
      for (const item of result.resultSet) {
        const id = item.id?.[0]?.value || '';
        if (id && !allResults.find(r => r.id?.[0]?.value === id)) {
          allResults.push(item);
        }
      }
      
      console.log(`   Page ${pageNum + 1}: ${allResults.length}/${totalHits}`);
      pageNum++;
      
      // Check if we have all results
      if (allResults.length >= totalHits) break;
      if (allResults.length >= domainConfig.expectedCount) break;
      
      // Need to scroll to load more - API doesn't have direct pagination
      break;
    }
    
    // If API didn't return all results, use scroll method
    if (allResults.length < domainConfig.expectedCount) {
      console.log(`\n📜 Using scroll method to load more (have ${allResults.length}, need ${domainConfig.expectedCount})...`);
      
      const searchUrl = `${BASE_URL}/query?q=domain_s:"${encodeURIComponent(domainConfig.domain)}"`;
      
      page.on('response', async response => {
        if (response.url().includes('/in/rest/api/search') && response.request().method() === 'POST') {
          try {
            const json = await response.json();
            if (json.resultSet) {
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
      
      await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 60000 });
      await sleep(3000);
      
      // Extended scroll with click-to-load
      let scrollCount = 0;
      let lastCount = allResults.length;
      let noNewCount = 0;
      
      while (allResults.length < domainConfig.expectedCount && scrollCount < 500) {
        // Scroll to bottom
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await sleep(800);
        
        // Try clicking "Load more" button if exists
        const loadMore = await page.$('button:has-text("Charger"), button:has-text("plus"), .load-more, [class*="load"]');
        if (loadMore) {
          try {
            await loadMore.click();
            await sleep(1500);
          } catch (e) {}
        }
        
        scrollCount++;
        
        if (allResults.length > lastCount) {
          noNewCount = 0;
          if (scrollCount % 25 === 0) {
            console.log(`   Scroll ${scrollCount}: ${allResults.length}/${domainConfig.expectedCount}`);
          }
          lastCount = allResults.length;
        } else {
          noNewCount++;
          if (noNewCount >= 15) {
            console.log(`   No new results after ${noNewCount} scrolls at ${allResults.length}`);
            break;
          }
        }
      }
    }
    
    console.log(`\n✅ Collected ${allResults.length} total items`);
    
    // Filter out already processed
    const newResults = allResults.filter(item => {
      const ark = item.ark?.[0]?.value || item.id?.[0]?.value || '';
      return !processedIds.has(ark);
    });
    
    console.log(`📝 ${newResults.length} new items to process (${processedIds.size} already done)`);
    
    if (testMode) {
      newResults.splice(5);
      console.log('TEST MODE: Processing only 5 items');
    }
    
    // Process each new result
    for (let i = 0; i < newResults.length; i++) {
      const result = newResults[i];
      const itemId = result.id?.[0]?.value || '';
      const ark = result.ark?.[0]?.value || itemId;
      
      const sourceUrl = `${BASE_URL}/notice?id=${encodeURIComponent(itemId)}`;
      
      try {
        // Get notice details
        let noticeData = null;
        const noticeListener = async response => {
          if (response.url().includes('/in/rest/api/notice') && response.url().includes('aspect=Meta')) {
            try { noticeData = await response.json(); } catch (e) {}
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
          domain: domainConfig.domain,
          imageUrl: '',
          sourceUrl: sourceUrl
        };
        
        // Extract from result
        artwork.title = result.title?.[0]?.value || result.titre?.[0]?.value || '';
        artwork.imageUrl = result.imageSource_512?.[0]?.value 
          ? `${BASE_URL}${result.imageSource_512[0].value}` 
          : '';
        
        // Extract from notice
        if (noticeData && noticeData.fieldGroups) {
          for (const group of noticeData.fieldGroups) {
            if (!group.fields) continue;
            for (const field of group.fields) {
              const qa = field.qa || [];
              for (const item of qa) {
                const val = item.Answer?.value || '';
                if (!val) continue;
                const q = (item.Question?.value || '').toLowerCase();
                
                if (q.includes('titre')) artwork.title = artwork.title || val;
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
          console.log(`💾 Saved: ${artworks.length} artworks`);
        }
        
        if ((i + 1) % 25 === 0) {
          console.log(`   Progress: ${i + 1}/${newResults.length} new items`);
        }
        
      } catch (error) {
        console.log(`   ⚠️ Error on item ${i + 1}: ${error.message}`);
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
  
  console.log(`🏛️ Musée de l'Armée Scraper - API Version`);
  console.log(`   Domains: ${domainsToScrape.map(d => d.domain).join(', ')}`);
  
  for (const domain of domainsToScrape) {
    await scrapeDomain(domain, testMode);
    await sleep(2000);
  }
  
  console.log('\n🎉 Done!');
})();
