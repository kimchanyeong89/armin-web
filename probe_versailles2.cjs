const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  page.on('request', req => {
    if (req.url().includes('search')) {
      console.log('Search Request:', req.postData());
    }
  });
  await page.goto('https://collections.chateauversailles.fr/#/query/87f77419-b439-493d-a304-abdf30dd4e89', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 5000));
  await browser.close();
})();
