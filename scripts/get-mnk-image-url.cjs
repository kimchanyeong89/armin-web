const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  try {
    const url = 'https://zbiory.mnk.pl/en/catalog/157417';
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle0' });
    
    // Find the main image
    const imgSrc = await page.evaluate(() => {
        const img = document.querySelector('.object-view-image img'); // Guess selector
        return img ? img.src : null;
    });
    
    console.log('Main Image Src:', imgSrc);
    
    // Dump all images just in case
    const allImgs = await page.evaluate(() => Array.from(document.images).map(i => i.src));
    console.log('All Images:', allImgs);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
})();
