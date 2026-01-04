/**
 * Capture SMB search API requests
 */
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  page.on('request', req => {
    const url = req.url();
    if (url.includes('api.smb.museum/search') && req.method() === 'POST') {
      console.log('=== SEARCH REQUEST ===');
      console.log('URL:', url);
      console.log('Body:', req.postData());
    }
  });
  
  page.on('response', async res => {
    const url = res.url();
    if (url.includes('api.smb.museum/search') && res.request().method() === 'POST' && !url.includes('facets')) {
      try {
        const json = await res.json();
        console.log('\n=== SEARCH RESPONSE ===');
        console.log('Total hits:', json.hits?.total?.value || json.total || 'unknown');
        if (json.hits?.hits?.[0]) {
          console.log('First result ID:', json.hits.hits[0]._id);
          console.log('First result source keys:', Object.keys(json.hits.hits[0]._source || {}));
        }
      } catch(e) {
        console.log('Response parse error:', e.message);
      }
    }
  });
  
  console.log('Loading page...');
  await page.goto('https://recherche.smb.museum/?language=de&limit=15&sort=relevance&controls=attachments&location=(Humboldt%20AND%20Forum)', { 
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });
  
  await page.waitForTimeout(3000);
  
  // Try to get count from page
  const countText = await page.evaluate(() => {
    // Look for count in various elements
    const allText = document.body.innerText;
    const match = allText.match(/(\d+)\s*Ergebnis/);
    return match ? match[1] : 'not found';
  });
  console.log('\nPage result count:', countText);
  
  await browser.close();
})();
