const { chromium } = require('playwright');

async function checkBrokenImage() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const url = 'https://www.munch.no/en/object/MM.M.00178'; // Eberhard Grisebach
    console.log(`Navigating to ${url}...`);

    await page.goto(url, { waitUntil: 'networkidle' });

    // Find image
    const imgInfo = await page.evaluate(() => {
        const img = document.querySelector('.collection-item__image-container img, .item-image img, img[alt*="Grisebach"]');
        return {
            src: img ? img.src : null,
            srcset: img ? img.srcset : null,
            naturalWidth: img ? img.naturalWidth : 0
        };
    });

    console.log('DOM Image Info:', imgInfo);

    // Also check Network for that mediaId
    // SzKztgo

    await browser.close();
}

checkBrokenImage();
