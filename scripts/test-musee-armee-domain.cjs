/**
 * Test domain-based search for Musée de l'Armée
 * 
 * 찾으려는 도메인:
 * - Photographie (332)
 * - Dessin (1068)  
 * - Peinture (77)
 */

const { chromium } = require('playwright');
const fs = require('fs');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const searchResults = {};
  
  page.on('response', async response => {
    const url = response.url();
    if (url.includes('/in/rest/api/search') && response.request().method() === 'POST') {
      try {
        const json = await response.json();
        const postData = JSON.parse(response.request().postData() || '{}');
        const query = postData.query?.join(' ') || '';
        
        console.log(`\nSearch Query: ${query}`);
        console.log(`Total Hits: ${json.numHits}`);
        console.log(`Results: ${json.resultSet?.length || 0}`);
        
        // Check facets for domain counts
        if (json.facets) {
          const domainFacet = json.facets.find(f => f.code === 'domain_s');
          if (domainFacet) {
            console.log('\nDomain facets:');
            domainFacet.items.forEach(item => {
              console.log(`  ${item.caption}: ${item.count}`);
            });
          }
        }
        
        searchResults[query] = json;
      } catch (e) {}
    }
  });
  
  try {
    // 1. First visit the general search page to see all domains
    console.log('='.repeat(60));
    console.log('SEARCHING ALL COLLECTIONS');
    console.log('='.repeat(60));
    
    // Visit the main search with all results
    await page.goto('https://basedescollections.musee-armee.fr/query?q=*', { 
      waitUntil: 'networkidle', 
      timeout: 60000 
    });
    await sleep(3000);
    
    // Now try to filter by domain
    console.log('\n' + '='.repeat(60));
    console.log('TESTING DOMAIN FILTER: Peinture');
    console.log('='.repeat(60));
    
    await page.goto('https://basedescollections.musee-armee.fr/query?q=domain_s:"Peinture"', { 
      waitUntil: 'networkidle', 
      timeout: 60000 
    });
    await sleep(3000);
    
    // Get visible results
    const results = await page.evaluate(() => {
      const links = [];
      document.querySelectorAll('a[href*="/notice?id="]').forEach(a => {
        const text = a.innerText?.trim();
        if (text && text.length > 2) {
          links.push(text.substring(0, 60));
        }
      });
      
      const countMatch = document.body.innerText.match(/(\d+)\s*résultats?/i);
      
      return {
        count: countMatch?.[1] || 'not found',
        samples: links.slice(0, 5)
      };
    });
    
    console.log('\nVisible count:', results.count);
    console.log('Sample results:', results.samples);
    
    // Save the search response for analysis
    fs.writeFileSync('/Users/kietzsche/armin-web-main/downloads/musee-armee-domain-search.json',
      JSON.stringify(searchResults, null, 2));
    
  } finally {
    await browser.close();
  }
}

main();
