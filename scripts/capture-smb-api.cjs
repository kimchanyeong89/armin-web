const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  page.on('request', req => {
    const url = req.url();
    if (url.includes('api.smb.museum/search') && req.method() === 'POST' && !url.includes('facets')) {
      console.log('URL:', url);
      console.log('BODY:', req.postData());
      console.log('---');
    }
  });
  
  await page.goto('https://recherche.smb.museum/?language=de&limit=15&controls=attachments&location=(Humboldt%20AND%20Forum)', { 
    waitUntil: 'load',
    timeout: 60000
  });
  
  await page.waitForTimeout(8000);
  await browser.close();
  console.log('Done');
})();
