const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
    const targetUrl = 'https://collections.mfa.org/search/Objects/classifications%3APaintings%3Bonview%3Atrue%3BimageExistence%3Atrue/*';
    console.log('Target:', targetUrl);

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    console.log('Navigating...');
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    await new Promise(r => setTimeout(r, 8000));

    let title = await page.title();
    console.log('Title:', title);

    if (title.includes('Human Verification') || title.includes('Just a moment')) {
        console.log('Handling WAF...');
        await new Promise(r => setTimeout(r, 15000)); // Wait for reload
        title = await page.title();
        console.log('Title after wait:', title);
    }

    const count = await page.evaluate(() => {
        const el = document.querySelector('.emuseum-pagenav1-results'); // eMuseum standard
        if (el) return el.innerText;
        return document.body.innerText.match(/(\d+) Result/)?.[0] || 'Count not found';
    });
    console.log('Result Count:', count);

    const firstItem = await page.evaluate(() => {
        const item = document.querySelector('.emuseum-objects-grid-item-link, .title a, .object-title a');
        return item ? { text: item.innerText, href: item.href } : null;
    });
    console.log('First Item:', firstItem);
    
    // Dump visible text to check
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500));
    console.log('Body Text:', bodyText);

    await browser.close();
})();
