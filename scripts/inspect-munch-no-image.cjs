const { chromium } = require('playwright');

async function inspectMunchNoImage() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const url = 'https://www.munch.no/en/object/MM.M.00750';
    console.log(`Navigating to ${url}...`);

    await page.goto(url, { waitUntil: 'domcontentloaded' }); // munch is slow/react

    const html = await page.content();

    // Check for React Hydration
    const match = html.match(/ReactDOM\.hydrate\(React\.createElement\(CollectionItemPage,\s*(\{.*?\})\),/s);

    if (match && match[1]) {
        try {
            const json = JSON.parse(match[1]);
            const obj = json.collectionObject;
            console.log('--- Hydration Data ---');
            console.log('Title:', obj.titleEn);
            console.log('mediaId:', obj.mediaId);
            console.log('primaryMedia:', obj.primaryMedia);
            console.log('Has Image?:', !!obj.mediaId);
        } catch (e) {
            console.error('JSON Parse Error:', e);
        }
    } else {
        console.log('No Hydration Data found.');
    }

    await browser.close();
}

inspectMunchNoImage();
