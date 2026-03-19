const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log('🔍 Checking network requests for Hermitage Museum...');

  // Capture all network requests
  page.on('request', request => {
    if (request.resourceType() === 'fetch' || request.resourceType() === 'xhr') {
      const url = request.url();
      if (url.includes('api') || url.includes('json') || url.includes('search') || url.includes('highlights')) {
        console.log('REQUEST:', url);
      }
    }
  });

  page.on('response', async response => {
    const url = response.url();
    if (url.includes('api') || url.includes('json') || url.includes('highlights')) {
      try {
        const contentType = response.headers()['content-type'];
        if (contentType && contentType.includes('application/json')) {
            console.log('✅ JSON RESPONSE FOUND:', url);
            // const json = await response.json();
            // console.log('Sample Data:', JSON.stringify(json).substring(0, 200));
        }
      } catch (e) {}
    }
  });

  try {
    await page.goto('https://www.hermitagemuseum.org/explore/highlights?lng=en&page=1&collection_categories=all', { waitUntil: 'networkidle' });
    
    // Check if there is a "Load More" button or pagination to trigger more requests
    // Wait a bit
    await new Promise(r => setTimeout(r, 5000));

  } catch (e) {
    console.error('Error loading page:', e);
  }

  await browser.close();
})();
