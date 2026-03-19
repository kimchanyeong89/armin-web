const { chromium } = require('playwright');
const fs = require('fs');

async function inspectNetwork() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    const requests = [];

    page.on('request', request => {
        if (request.resourceType() === 'fetch' || request.resourceType() === 'xhr') {
            requests.push({
                url: request.url(),
                method: request.method(),
                headers: request.headers()
            });
        }
    });

    console.log('Navigating to National Gallery Prague catalog...');
    await page.goto('https://sbirky.ngprague.cz/en/katalog', { waitUntil: 'networkidle' });

    console.log(`Captured ${requests.length} XHR/Fetch requests.`);

    // Save requests to analyze
    fs.writeFileSync('ngprague-network-log.json', JSON.stringify(requests, null, 2));

    await browser.close();
}

inspectNetwork();
