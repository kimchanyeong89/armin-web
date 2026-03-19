const { chromium } = require('playwright');

async function testScrapeLogic() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const url = 'https://www.fondationbeyeler.ch/en/beyeler-collection/work?tx_wmdbbasefbey_pi5%5Bartwork%5D=4&cHash=65548e7577e82cd8ef83e4ca7b45bbb6'; // Francis Bacon

    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // Accept cookies logic
    try {
        const cookieBtn = await page.waitForSelector('.ccm--save-settings[data-full-consent="true"]', { timeout: 5000 });
        if (cookieBtn) await cookieBtn.click();
    } catch (e) { }

    // Wait for unblock
    try {
        await page.waitForFunction(() => !document.body.classList.contains('ccm-blocked'), { timeout: 5000 });
    } catch (e) { }

    const data = await page.evaluate(() => {
        let textContent = '';
        const detailContainer = document.querySelector('.artwork-detail');
        if (detailContainer) {
            const clone = detailContainer.cloneNode(true);
            clone.querySelectorAll('.artwork-headline, .artwork-subline').forEach(el => el.remove());
            textContent = clone.innerText.trim();
        } else {
            const textDesc = document.querySelector('.artwork-description') ||
                document.querySelector('.col-md-5.col-md-push-1.artwork-description');
            if (textDesc) textContent = textDesc.innerText.trim();
        }
        return textContent;
    });

    console.log('Extracted Description:\n', data);
    await browser.close();
}

testScrapeLogic();
