const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    console.log('Navigating to NPM Selection...');
    await page.goto('https://theme.npm.edu.tw/selection/Category.aspx?sNo=03000117&lang=2', { waitUntil: 'networkidle' });

    // Wait for items to load
    try {
        await page.waitForSelector('.item', { timeout: 10000 });
    } catch (e) {
        console.log('Timeout waiting for .item');
    }

    const items = await page.$$('.item');
    console.log(`Found ${items.length} items initially.`);

    // Scroll to bottom a few times to test infinite scroll
    for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(2000);
    }

    const itemsAfter = await page.$$('.item');
    console.log(`Found ${itemsAfter.length} items after scrolling.`);

    await browser.close();
})();
