const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    
    // Go to home first to set cookies
    console.log('Visiting home...');
    await page.goto('https://emuseum.mfah.org/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    console.log('Testing potential API endpoints...');
    const endpoints = [
        'https://emuseum.mfah.org/objects/json?filter=classifications%3APAINTING;mediaExistence%3Atrue',
        'https://emuseum.mfah.org/search/json?filter=classifications%3APAINTING;mediaExistence%3Atrue'
    ];
    
    for (const url of endpoints) {
        console.log('Fetching:', url);
        try {
            const resp = await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
            const text = await resp.text();
            if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
                 console.log('SUCCESS! Found JSON:', url);
                 console.log('Snippet:', text.slice(0, 300));
            } else {
                 console.log('Not JSON. Starts with:', text.slice(0, 50).replace(/\n/g, ' '));
            }
        } catch (e) {
            console.log('Error:', e.message);
        }
    }
    
    await browser.close();
})();
