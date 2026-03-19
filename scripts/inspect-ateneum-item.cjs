const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    
    page.on('response', async response => {
        if (response.url().includes('api/search') && response.request().method() === 'POST') {
             try {
                 const data = await response.json();
                 const items = data.data || data;
                 // Loop to find item regardless of structure
                 if (Array.isArray(items)) {
                    const item = items.find(i => String(i.id) === '2878034');
                    if (item) {
                        console.log("ITEM_FOUND:");
                        console.log(JSON.stringify(item, null, 2));
                    }
                 }
             } catch(e) {}
        }
    });

    await page.goto('https://www.kansallisgalleria.fi/en/search?searchTerms[]=2878034&museums[]=ateneum', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 5000)); // Wait for logs
    await browser.close();
})();
