const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  // Log all network requests
  page.on('request', request => {
    if (request.resourceType() === 'xhr' || request.resourceType() === 'fetch') {
        if (request.url().includes('api') || request.url().includes('search')) {
            console.log('REQ:', request.url());
            console.log('METHOD:', request.method());
            console.log('POST DATA:', request.postData());
        }
    }
  });

    page.on('response', async response => {
      if ((response.request().resourceType() === 'xhr' || response.request().resourceType() === 'fetch') && 
          (response.url().includes('api') || response.url().includes('search'))) {
          try {
              const text = await response.text();
              if (text.length < 1000) {
                 console.log('RESP:', text);
              } else {
                 console.log('RESP LENGTH:', text.length);
                 console.log('RESP START:', text.substring(0, 200));
              }
          } catch (e) {}
      }
    });

  // Navigate to catalog
  console.log('Navigating...');
  await page.goto('https://zbiory.mnk.pl/en/search-result?q=painting', { waitUntil: 'networkidle0' });

  await browser.close();
})();
