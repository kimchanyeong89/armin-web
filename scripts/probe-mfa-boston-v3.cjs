const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
    const targetUrl = 'https://collections.mfa.org/search/Objects/classifications%3APaintings%3Bonview%3Atrue%3BimageExistence%3Atrue/*';
    console.log('Target:', targetUrl);

    const browser = await puppeteer.launch({
        headless: true, // "new" is default
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    console.log('Navigating...');
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(r => setTimeout(r, 5000));

    let title = await page.title();
    console.log('Title:', title);

    if (title.includes('Human Verification') || (await page.content()).includes('Begin')) {
        console.log('Attempting to solve captcha...');
        
        try {
            // Find "Begin" or button
            const clicked = await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button, a, div[role="button"]'));
                const beginBtn = buttons.find(b => b.innerText.includes('Begin') || b.innerText.includes('Verify'));
                if (beginBtn) {
                    beginBtn.click();
                    return true;
                }
                return false;
            });

            if (clicked) {
                console.log('Clicked a button, waiting...');
                await new Promise(r => setTimeout(r, 10000));
            } else {
                 console.log('Could not find Begin button.');
                 // Sometimes it's in a shadow DOM or iframe.
            }

        } catch (e) {
            console.error('Error clicking:', e);
        }
        
        title = await page.title();
        console.log('Title after click:', title);
    }
    
    // Screenshot to debug text
    const layout = await page.evaluate(() => document.body.innerText.slice(0, 500));
    console.log('Layout:', layout);

    // If we passed, check for items
    await page.waitForSelector('.emuseum-objects-grid-item', { timeout: 5000 }).catch(()=>console.log('Grid selector not found'));

    // Try to get JSON from API call if possible (intercepting future requests)
    // But for now just print title
    
    await browser.close();
})();
