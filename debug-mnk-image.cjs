const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.goto('https://zbiory.mnk.pl/en/catalog/157417', { waitUntil: 'networkidle0' }); // Lady with Ermine
    
    // Get image src
    const imgSrc = await page.evaluate(() => {
        const img = document.querySelector('.element-image img'); // Guess selector
        return img ? img.src : null;
    });
    
    // Fallback: get all images
    const allImages = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('img')).map(i => i.src);
    });

    console.log('Main Image:', imgSrc);
    console.log('All Images:', allImages);
    
    await browser.close();
})();
