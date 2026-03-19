const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({ 
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  });
  const page = await browser.newPage();
  page.on('request', req => {
    if (req.url().includes('ccConnector.asmx')) {
      console.log('Request URL:', req.url());
      console.log('Request payload:', req.postData());
    }
  });
  await page.goto('https://collections.chateauversailles.fr/#/query/87f77419-b439-493d-a304-abdf30dd4e89', { waitUntil: 'networkidle2' });
  await page.evaluate(() => {
    const firstItem = document.querySelector('.img-item-wrapper');
    if (firstItem) firstItem.click();
  });
  await new Promise(r => setTimeout(r, 5000));
  await browser.close();
})();
