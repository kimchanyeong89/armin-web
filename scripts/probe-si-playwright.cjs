const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true }); // Headless might fail CF, if so try headful
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  const url = 'https://www.si.edu/search/images?edan_fq[]=object_type:%22Paintings%22&edan_fq[]=data_source%3A%22Smithsonian+American+Art+Museum%22';
  
  console.log(`Navigating to ${url}...`);

  page.on('response', async (response) => {
    const u = response.url();
    if (u.includes('edan') || u.includes('api') || u.includes('search') || u.includes('json')) {
      if (response.request().method() === 'GET' && response.status() === 200) {
         try {
           const ct = response.headers()['content-type'] || '';
           if (ct.includes('application/json')) {
             console.log(`Captured JSON response from: ${u}`);
             const json = await response.json();
             const str = JSON.stringify(json, null, 2);
             if (str.length > 500) {
                const fname = `debug-si-resp-${Date.now()}.json`;
                fs.writeFileSync(fname, str);
                console.log(`Saved ${fname} (${str.length} bytes)`);
             }
           }
         } catch (e) {
           // ignore
         }
      }
    }
  });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log('Page DOM content loaded.');
    console.log('Title:', await page.title());
    await page.screenshot({ path: 'debug-si-screen.png' });
    
    // Attempt to extract item links or data from DOM
    const data = await page.evaluate(() => {
        // Look for EDAN object
        if (window.edan_search) return window.edan_search;
        
        // Look for grid items
        const items = Array.from(document.querySelectorAll('.media-object, .search-result'));
        return items.map(i => i.innerText.slice(0, 100));
    });
    console.log('Extracted Data:', data);
    
    await page.waitForTimeout(5000);
  } catch (e) {
    console.error('Navigation failed:', e.message);
  }

  await browser.close();
})();
