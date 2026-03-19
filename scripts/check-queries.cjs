const { chromium } = require('playwright');

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Check various queries
    const queries = ['painting', 'drawing', 'print', 'schiele', 'klimt'];

    for (const q of queries) {
        const url = `https://onlinecollection.leopoldmuseum.org/en/search/?q=${q}&limit=1`;
        await page.goto(url, { waitUntil: 'domcontentloaded' });

        const countText = await page.evaluate(() => document.body.innerText.match(/(\d+)\s+Results/i)?.[0]);
        console.log(`Query "${q}": ${countText}`);
    }

    await browser.close();
}

main().catch(console.error);
