const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  page.on('response', async (res) => {
    const url = res.url();
    if (url.includes('ccConnector.asmx') || url.includes('api') || url.includes('json')) {
      console.log('Response:', url, res.headers()['content-type']);
      if (url.includes('GetRecord') || url.includes('search')) {
        try {
          const text = await res.text();
          console.log('Body snippet:', text.substring(0, 200));
        } catch (e) {}
      }
    }
  });
  await page.goto('https://collections.chateauversailles.fr/#/query/87f77419-b439-493d-a304-abdf30dd4e89', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 5000));
  await browser.close();
})();
