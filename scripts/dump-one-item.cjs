const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    let found = false;

    page.on('response', async response => {
        if (found) return;
        if (response.url().includes('api/search') && response.request().method() === 'POST') {
            try {
                const data = await response.json();
                const items = data.data || data;
                if (Array.isArray(items) && items.length > 0) {
                    console.log(JSON.stringify(items[0], null, 2));
                    found = true;
                    process.exit(0);
                }
            } catch (e) { }
        }
    });

    await page.goto('https://www.kansallisgalleria.fi/en/search?categories[]=artwork&hasImage=true&museums[]=ateneum', { waitUntil: 'networkidle2' });
    await browser.close();
})();
