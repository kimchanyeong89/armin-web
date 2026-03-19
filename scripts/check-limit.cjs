const { chromium } = require('playwright');

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Try to get EVERYTHING in one request
    const url = 'https://onlinecollection.leopoldmuseum.org/en/search/?offset=0&limit=5000&layout=default';
    console.log(`Checking large limit: ${url}`);

    await page.goto(url, { waitUntil: 'load', timeout: 60000 });

    // Wait for a bit
    await page.waitForTimeout(5000);

    const count = await page.evaluate(() => document.querySelectorAll('a[href*="/en/object/"]').length);
    console.log(`Links found with limit=5000: ${count}`);

    await browser.close();
}

main().catch(console.error);
