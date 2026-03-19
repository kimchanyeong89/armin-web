const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  const url = 'https://emuseum.mfah.org/objects/166287/the-watering-hole';
  
  console.log('Navigating to detail page...');
  await page.goto(url, { waitUntil: 'networkidle2' });
  
  const content = await page.content();
  fs.writeFileSync('mfah_detail_dump.html', content);
  console.log('Saved mfah_detail_dump.html');
  
  await browser.close();
})();
