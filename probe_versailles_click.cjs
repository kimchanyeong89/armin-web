const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  page.on('request', req => {
    if (req.url().includes('ccConnector.asmx')) {
      console.log('Request:', req.url(), req.postData());
    }
  });
  await page.goto('https://collections.chateauversailles.fr/#/query/87f77419-b439-493d-a304-abdf30dd4e89', { waitUntil: 'networkidle2' });
  
  // Click the first item
  await page.evaluate(() => {
    const firstItem = document.querySelector('.img-item-wrapper');
    if (firstItem) firstItem.click();
  });
  
  await new Promise(r => setTimeout(r, 5000));
  await browser.close();
})();
