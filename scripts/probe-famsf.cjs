const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  page.on('request', request => {
    console.log('Request:', request.url());
  });

  page.on('response', async response => {
    const url = response.url();
    // Log content type
    const contentType = response.headers()['content-type'] || '';
    if (contentType.includes('json')) {
       console.log(`JSON Response: ${url}`);
       try {
           // const json = await response.json(); // Be careful with large bodies
           // console.log(Object.keys(json));
       } catch(e) {}
    }
  });

  await page.goto('https://www.famsf.org/art', { waitUntil: 'networkidle' });
  
  await browser.close();
})();
