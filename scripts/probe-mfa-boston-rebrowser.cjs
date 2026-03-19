const puppeteer = require('rebrowser-puppeteer');
// Stealth plugin might conflict with rebrowser-puppeteer or be unnecessary, but let's try mostly native rebrowser
// Actually rebrowser-puppeteer is a drop-in that patches CDP to be less detectable.
// We can still use stealth plugin.

const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const puppeteerExtra = require('puppeteer-extra');

// rebrowser-puppeteer returns a puppeteer-compatible object.
// We need to inject it into puppeteer-extra if we want to use plugins
puppeteerExtra.use(StealthPlugin());

(async () => {
    const targetUrl = 'https://collections.mfa.org/search/Objects/classifications%3APaintings%3Bonview%3Atrue%3BimageExistence%3Atrue/*';
    console.log('Target:', targetUrl);

    // Launch using rebrowser-puppeteer's launch (via puppeteer-extra if possible, or direct)
    // To use rebrowser with puppeteer-extra:
    const browser = await puppeteerExtra.launch({
        headless: true,
        executablePath: puppeteer.executablePath(), // Use rebrowser's chrome
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    // OR just use rebrowser directly if stealth is not helping
    // const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    console.log('Navigating...');
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    await new Promise(r => setTimeout(r, 8000));

    let title = await page.title();
    console.log('Title:', title);

    if (title.includes('Human Verification')) {
        console.log('WAF detected. Clicking button if exists...');
         const clicked = await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button, a, div[role="button"]'));
                const beginBtn = buttons.find(b => b.innerText.includes('Begin') || b.innerText.includes('Verify'));
                if (beginBtn) {
                    beginBtn.click();
                    return true;
                }
                return false;
            });
         if (clicked) console.log('Clicked.');
         await new Promise(r => setTimeout(r, 10000));
         title = await page.title();
         console.log('Title after click:', title);
    }

    const count = await page.evaluate(() => {
        return document.innerText?.match(/\d+ Results/)?.[0] || 'No count';
    });
    console.log('Result Count:', count);
    
    const content = await page.content();
    if (content.includes('emuseum-objects-grid')) {
        console.log('Grid found!');
    } else {
        console.log('Grid NOT found.');
    }

    await browser.close();
})();
