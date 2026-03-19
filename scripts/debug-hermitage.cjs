const { chromium } = require('playwright');

(async () => {
  console.log('🚀 Starting Hermitage Debug Scraper (Modified)...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Log detailed request info
  page.on('request', req => {
    const url = req.url();
    if (url.includes('api/collections/load/highlights')) {
      console.log('🎯 TARGET API FOUND:', url);
      console.log('   Method:', req.method());
      console.log('   Headers:', JSON.stringify(req.headers()));
      console.log('   Post Data:', req.postData());
    }
  });

  page.on('response', async res => {
    const url = res.url();
    if (url.includes('api/collections/load/highlights') && res.status() === 200) {
      try {
        const json = await res.json();
        console.log('✅ API RESPONSE RECEIVED');
        
        if (json.items) {
            console.log('   Items Count:', json.items.length);
            console.log('   First Item:', JSON.stringify(json.items[0]));
        } else if (Array.isArray(json)) {
            console.log('   Items Count:', json.length);
            console.log('   First Item:', JSON.stringify(json[0]));
        } else {
            console.log('   Structure:', Object.keys(json));
            console.log('   Data:', JSON.stringify(json).slice(0, 500));
        }
      } catch (e) {
        console.log('   Response is not JSON');
      }
    }
  });

  try {
    await page.goto('https://www.hermitagemuseum.org/explore/highlights?lng=en&page=1&collection_categories=all', {
      waitUntil: 'networkidle',
      timeout: 60000
    });
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
})();
