/**
 * Find all available collections from Musée de l'Armée
 */

const { chromium } = require('playwright');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    console.log('Searching for all collections...\n');
    
    await page.goto('https://basedescollections.musee-armee.fr/accueil', { 
      waitUntil: 'networkidle', 
      timeout: 60000 
    });
    await sleep(3000);
    
    // Get all collection/profile links
    const links = await page.evaluate(() => {
      const results = [];
      document.querySelectorAll('a[href*="/notice"], a[href*="/search"]').forEach(a => {
        const href = a.href;
        const text = a.innerText?.trim() || '';
        const img = a.querySelector('img')?.src || '';
        
        // Extract ID from URL
        const idMatch = href.match(/id=([^&]+)/);
        const searchMatch = href.match(/\/search\/([^?]+)/);
        
        results.push({
          text: text.substring(0, 100),
          href,
          id: idMatch?.[1] || searchMatch?.[1] || '',
          hasImage: !!img
        });
      });
      return results;
    });
    
    console.log('Links found:');
    links.forEach((l, i) => {
      console.log(`${i + 1}. ${l.text || '(no text)'}`);
      console.log(`   ID: ${l.id}`);
      console.log(`   URL: ${l.href}`);
      console.log('');
    });
    
    // Also check for any "parcours" or thematic collections
    const allText = await page.evaluate(() => document.body.innerText);
    console.log('\nPage text sample:\n', allText.substring(0, 2000));
    
  } finally {
    await browser.close();
  }
}

main();
