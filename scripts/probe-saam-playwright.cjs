const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  // "Paintings" filter
  const url = 'https://americanart.si.edu/search/artworks?f[0]=object_type:Paintings';
  
  console.log(`Navigating to ${url}...`);

  page.on('response', async (response) => {
    const u = response.url();
    const type = response.request().resourceType();
    
    if (type === 'fetch' || type === 'xhr') {
        console.log(`XHR/Fetch: ${u} [${response.status()}]`);
        try {
            const json = await response.json();
            const len = JSON.stringify(json).length;
            console.log(`  JSON body length: ${len}`);
            // ... (existing save logic)
        } catch (e) {
            // not json, try properties
            const text = await response.text().catch(()=>'');
            const len = text.length;
            console.log(`  Text body length: ${len}`);
            if (len > 1000 && u.includes('search/results')) {
                fs.writeFileSync(`debug-saam-results.html`, text);
                console.log(`  Saved debug-saam-results.html`);
            }
        }
    }
  });

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    console.log('Page loaded.');
  } catch (e) {
    console.error('Navigation error:', e.message);
  }

  await browser.close();
})();
