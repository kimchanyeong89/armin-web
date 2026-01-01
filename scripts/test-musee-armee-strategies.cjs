/**
 * Test multiple search strategies for Musée de l'Armée
 */

const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  let allIds = new Set();
  
  page.on('response', async response => {
    if (response.url().includes('/in/rest/api/search') && response.request().method() === 'POST') {
      try {
        const json = await response.json();
        if (json.resultSet) {
          for (const item of json.resultSet) {
            const id = item.id?.[0]?.value || '';
            if (id) allIds.add(id);
          }
        }
      } catch (e) {}
    }
  });
  
  // Try different date ranges
  const dateRanges = [
    '',  // no date filter
    'dateType_dt:[* TO 1850-01-01T00:00:00Z]',
    'dateType_dt:[1850-01-01T00:00:00Z TO 1900-01-01T00:00:00Z]',
    'dateType_dt:[1900-01-01T00:00:00Z TO 1920-01-01T00:00:00Z]',
    'dateType_dt:[1920-01-01T00:00:00Z TO 1945-01-01T00:00:00Z]',
    'dateType_dt:[1945-01-01T00:00:00Z TO *]'
  ];
  
  for (const dateFilter of dateRanges) {
    const query = dateFilter 
      ? `domain_s:"Photographie" AND ${dateFilter}`
      : `domain_s:"Photographie"`;
    
    console.log(`\nQuery: ${query.substring(0, 70)}...`);
    
    const url = `https://basedescollections.musee-armee.fr/query?q=${encodeURIComponent(query)}`;
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    
    const before = allIds.size;
    let lastSize = allIds.size;
    let noChangeCount = 0;
    
    for (let i = 0; i < 50; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1200);
      
      if (allIds.size === lastSize) {
        noChangeCount++;
        if (noChangeCount > 5) break;
      } else {
        noChangeCount = 0;
        lastSize = allIds.size;
      }
    }
    
    console.log(`  Added: ${allIds.size - before}, Total: ${allIds.size}`);
  }
  
  console.log(`\n=== Final total: ${allIds.size} ===`);
  await browser.close();
})();
