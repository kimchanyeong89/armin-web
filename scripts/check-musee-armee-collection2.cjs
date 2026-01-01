/**
 * Check the second collection
 */

const { chromium } = require('playwright');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  let totalHits = 0;
  let title = '';
  
  page.on('response', async response => {
    const url = response.url();
    if (url.includes('/in/rest/api/search') && response.request().method() === 'POST') {
      try {
        const json = await response.json();
        totalHits = json.numHits || 0;
      } catch (e) {}
    }
    if (url.includes('/in/rest/api/notice') && url.includes('aspect=Meta')) {
      try {
        const json = await response.json();
        const titleField = json.summary?.find(s => s.name === 'title');
        title = titleField?.value || '';
      } catch (e) {}
    }
  });
  
  try {
    console.log('Checking "Fêtes de fin d\'année" collection...\n');
    
    await page.goto('https://basedescollections.musee-armee.fr/notice?id=affe25d5-be7a-40a8-bbc8-67989a8afca6', { 
      waitUntil: 'networkidle', 
      timeout: 60000 
    });
    await sleep(3000);
    
    console.log('Title:', title);
    console.log('Total hits:', totalHits);
    
    // Get the page content
    const pageInfo = await page.evaluate(() => {
      const body = document.body.innerText;
      const countMatch = body.match(/(\d+)\s*résultats?/i);
      
      // Get links
      const links = [];
      document.querySelectorAll('a[href*="/notice?id="]').forEach(a => {
        const href = a.href;
        const text = a.innerText?.trim();
        if (!href.includes('affe25d5') && text) {
          links.push({ text: text.substring(0, 60), href });
        }
      });
      
      return {
        count: countMatch?.[1] || 'not found',
        links: links.slice(0, 10),
        bodySnippet: body.substring(0, 1000)
      };
    });
    
    console.log('Result count from page:', pageInfo.count);
    console.log('\nSample artworks:');
    pageInfo.links.forEach((l, i) => {
      console.log(`  ${i + 1}. ${l.text}`);
    });
    
  } finally {
    await browser.close();
  }
}

main();
