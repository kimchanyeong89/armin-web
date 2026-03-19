const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  const baseId = '447644';
  const variants = [
    `https://emuseum.mfah.org/internal/media/dispatcher/${baseId}/thumbnail`,
    `https://emuseum.mfah.org/internal/media/dispatcher/${baseId}/resize:format=full`,
    `https://emuseum.mfah.org/internal/media/dispatcher/${baseId}/full`,
    `https://emuseum.mfah.org/internal/media/dispatcher/${baseId}/preview`
  ];

  for (const url of variants) {
    console.log(`Checking ${url}...`);
    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
      console.log(`Status: ${response.status()}`);
      if (response.status() === 200) {
        console.log(`Success! Content-Type: ${response.headers()['content-type']}`);
        const buffer = await response.buffer();
        console.log(`Size: ${buffer.length}`);
      }
    } catch (e) {
      console.log(`Error: ${e.message}`);
    }
  }

  await browser.close();
})();
