const { chromium } = require('playwright');
const fs = require('fs');

async function inspectMatisse() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Log requests
    const requests = [];
    page.on('request', request => {
        if (request.resourceType() === 'fetch' || request.resourceType() === 'xhr') {
            requests.push({
                url: request.url(),
                method: request.method(),
                postData: request.postData(),
                headers: request.headers()
            });
        }
    });

    console.log('Navigating to Musée Matisse OPAC...');
    await page.goto('https://musee-matisse.opacweb.io/fr/search?onlyHasImage=true&o=1140127', { waitUntil: 'networkidle' });

    console.log(`Captured ${requests.length} XHR/Fetch requests.`);
    fs.writeFileSync('matisse-network.json', JSON.stringify(requests, null, 2));

    // Also get the HTML just in case it's SSR
    const html = await page.content();
    fs.writeFileSync('matisse-debug.html', html);

    await browser.close();
}

inspectMatisse();
