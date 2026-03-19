const { chromium } = require('playwright');

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Check offset 3000 (should be items 3001-3100 if simple pagination)
    // Check offset 3100 (should be items 3101-3167)

    // Check valid and invalid offsets
    const offsets = [100, 1000, 2000, 2500, 3000];

    for (const off of offsets) {
        const url = `https://onlinecollection.leopoldmuseum.org/en/search/?offset=${off}&limit=100&layout=default`;
        console.log(`Checking ${url}...`);
        await page.goto(url, { waitUntil: 'domcontentloaded' });

        try {
            await page.waitForSelector('a[href*="/en/object/"]', { timeout: 10000 });
        } catch (e) { console.log('Timeout waiting for selector'); }

        const data = await page.evaluate(() => {
            const anchors = Array.from(document.querySelectorAll('a[href*="/en/object/"]'));
            const hrefs = anchors.map(a => a.getAttribute('href'));
            // Unique only
            return [...new Set(hrefs)];
        });

        console.log(`Offset ${off}: Found ${data.length} items.`);
        if (data.length > 0) console.log(`First item: ${data[0]}`);
    }

    await browser.close();
}

main().catch(console.error);
