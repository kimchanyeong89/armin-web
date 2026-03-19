const puppeteer = require('puppeteer');

const URL = 'https://www.nasjonalmuseet.no/en/collection/search/?object-name=painting';

(async () => {
    console.log("Detecting API...");
    const browser = await puppeteer.launch({ 
        headless: "new",
        defaultViewport: { width: 1280, height: 800 } 
    });
    const page = await browser.newPage();
    
    // Listen for requests
    page.on('request', req => {
        if (req.url().includes('/search?object-name=painting')) {
            console.log(`REQ: ${req.method()} ${req.url()}`);
            if (req.method() === 'POST') {
                console.log("HEADERS:", JSON.stringify(req.headers(), null, 2));
                console.log("POST DATA:", req.postData());
            }
        }
    });

    page.on('response', async res => {
        if (res.url().includes('/search?object-name=painting')) {
            try {
                console.log(`RESP STATUS: ${res.status()}`);
                const text = await res.text();
                console.log(`RESP BODY START: ${text.substring(0, 500)}`);
            } catch(e) {}
        }
    });

    await page.goto(URL, { waitUntil: 'networkidle2' });
    console.log("Page loaded. Looking for 'Show more'...");

    // Click Show More
    try {
        await page.waitForSelector('button', { timeout: 5000 });
        const found = await page.evaluate(async () => {
             const buttons = Array.from(document.querySelectorAll('button'));
             const loadMoreBtn = buttons.find(b => {
                 const t = b.innerText.toLowerCase();
                 return t.includes('show more') || t.includes('load more') || t.includes('vis flere');
             });
             if (loadMoreBtn) {
                 loadMoreBtn.click();
                 return true;
             }
             return false;
        });

        if (found) {
            console.log("Clicked 'Show more'. Waiting for traffic...");
            await new Promise(r => setTimeout(r, 5000));
        } else {
            console.log("Button not found.");
        }

    } catch(e) {
        console.error(e);
    }

    await browser.close();
})();
