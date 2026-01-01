/**
 * Musée de l'Armée - Full Domain Scraper with Resume
 * 
 * Uses scrolling + API interception to collect all items
 * Supports resume from existing data
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://basedescollections.musee-armee.fr';

const DOMAINS = [
  { name: 'photographie', query: 'Photographie', expected: 332, file: 'musee-armee-photographie.json' },
  { name: 'dessin', query: 'Dessin', expected: 1068, file: 'musee-armee-dessin.json' }
];

const DELAY = 400;
const SAVE_INTERVAL = 25;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function scrapeDomain(browser, domain) {
  console.log('\n' + '='.repeat(60));
  console.log(`SCRAPING: ${domain.name.toUpperCase()} (expected: ${domain.expected})`);
  console.log('='.repeat(60));
  
  const outputPath = path.join(__dirname, '..', 'public', 'data', domain.file);
  
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
  
  const page = await browser.newPage();
  
  try {
    // Visit the search page first to establish session
    console.log('\n📡 Connecting...');
    await page.goto(`${BASE_URL}/query?q=domain_s:${encodeURIComponent('"' + domain.query + '"')}&sf=*`, {
      waitUntil: 'networkidle',
      timeout: 60000
    });
    await sleep(3000);
    
    // Collect all results via scrolling and API interception
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
            for (const r of json.resultSet) {
              const id = r.ark?.[0]?.value || r.id?.[0]?.value;
              if (id && !allResults.find(x => (x.ark?.[0]?.value || x.id?.[0]?.value) === id)) {
                allResults.push(r);
              }
            }
          }
        } catch (e) {}
      }
    });
    
    // Reload to capture initial results
    await page.goto(`${BASE_URL}/query?q=domain_s:${encodeURIComponent('"' + domain.query + '"')}&sf=*`, {
      waitUntil: 'networkidle',
      timeout: 60000
    });
    await sleep(3000);
    
    console.log(`📊 Total hits: ${totalHits}`);
    console.log(`📋 Initial results: ${allResults.length}`);
    
    // Scroll to load more - with longer waits
    let lastCount = 0;
    let stuckCount = 0;
    
    while (allResults.length < totalHits && stuckCount < 15) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await sleep(2500);
      
      if (allResults.length > lastCount) {
        console.log(`   Loaded: ${allResults.length}/${totalHits}`);
        lastCount = allResults.length;
        stuckCount = 0;
      } else {
        stuckCount++;
        // Try clicking any "load more" button
        try {
          await page.click('button:has-text("Plus"), button:has-text("More")', { timeout: 500 });
          await sleep(1500);
        } catch (e) {}
      }
    }
    
    console.log(`\n✅ Collected ${allResults.length} items from API`);
    
    // Process each result that hasn't been processed yet
    const toProcess = allResults.filter(r => {
      const id = r.ark?.[0]?.value || r.id?.[0]?.value;
      return id && !processedIds.has(id);
    });
    
    console.log(`📝 Processing ${toProcess.length} new artworks...`);
    
    for (let i = 0; i < toProcess.length; i++) {
      const result = toProcess[i];
      const ark = result.ark?.[0]?.value || '';
      const fullId = result.id?.[0]?.value || '';
      
      try {
        // Set up listener for notice API
        let noticeData = null;
        const noticeListener = async response => {
          if (response.url().includes('/in/rest/api/notice') && response.url().includes('aspect=Meta')) {
            try { noticeData = await response.json(); } catch (e) {}
          }
        };
        page.on('response', noticeListener);
        
        const sourceUrl = `${BASE_URL}/notice?id=${encodeURIComponent(fullId)}`;
        await page.goto(sourceUrl, { waitUntil: 'networkidle', timeout: 45000 });
        await sleep(DELAY);
        
        page.off('response', noticeListener);
        
        // Extract data
        const getField = (name) => {
          if (!noticeData?.fields) return '';
          const field = noticeData.fields.find(f => f.name === name);
          if (!field?.values) return '';
          return field.values.map(v => v.qa?.Answer || '').filter(Boolean).join(', ');
        };
        
        const getValue = (field) => Array.isArray(field) ? field[0]?.value || '' : '';
        const imgSrc = getValue(result.imageSource_512) || getValue(result.imageSource_256);
        
        const artwork = {
          id: `musee-armee-${domain.name}-${artworks.length + 1}`,
          ark: ark,
          title: getField('title') || getValue(result.title) || 'Sans titre',
          artist: getField('creator') || 'Anonyme',
          year: getField('dateDescription') || '',
          medium: getField('descriptionTechnique') || '',
          dimensions: getField('descriptionDimension') || '',
          inventoryNumber: getField('identifierInventory') || '',
          place: getField('place') || '',
          subject: getField('subjectPerson') || '',
          theme: getField('subjectTheme') || '',
          imageUrl: imgSrc ? `${BASE_URL}${imgSrc}` : '',
          sourceUrl: sourceUrl
        };
        
        artworks.push(artwork);
        processedIds.add(ark || sourceUrl);
        
        console.log(`[${artworks.length}/${allResults.length + (artworks.length - toProcess.length)}] ✓ ${artwork.title.substring(0, 45)}`);
        
        if (artworks.length % SAVE_INTERVAL === 0) {
          saveProgress(outputPath, artworks, domain);
        }
        
      } catch (err) {
        console.log(`[${i + 1}] ✗ Error: ${err.message.substring(0, 40)}`);
      }
    }
    
  } finally {
    await page.close();
  }
  
  saveProgress(outputPath, artworks, domain);
  
  console.log('\n' + '='.repeat(60));
  console.log(`✅ ${domain.name}: ${artworks.length}/${domain.expected} artworks`);
  console.log('='.repeat(60));
  
  return artworks.length;
}

function saveProgress(outputPath, artworks, domain) {
  const data = {
    exhibitionId: `musee-armee-${domain.name}`,
    title: `Musée de l'Armée - ${domain.query}`,
    museum: 'Musée de l\'Armée - Invalides',
    location: 'Paris, France',
    type: 'permanent',
    description: `Collection ${domain.query}`,
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
  const domainArg = args.find(a => !a.startsWith('--'));
  
  const domainsToScrape = domainArg 
    ? DOMAINS.filter(d => d.name === domainArg)
    : DOMAINS;
  
  if (domainsToScrape.length === 0) {
    console.log('Usage: node scrape-musee-armee-full.cjs [photographie|dessin]');
    process.exit(1);
  }
  
  console.log('\n' + '#'.repeat(60));
  console.log('  MUSÉE DE L\'ARMÉE - FULL DOMAIN SCRAPER');
  console.log('#'.repeat(60));
  
  const browser = await chromium.launch({ headless: true });
  
  try {
    for (const domain of domainsToScrape) {
      await scrapeDomain(browser, domain);
    }
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
