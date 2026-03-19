const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    const url = 'https://www.mmca.go.kr/collections/collectionsDetail.do?museumCd=00001&wrkInfoSeq=32218';
    console.log(`Navigating to ${url}`);
    await page.goto(url, { waitUntil: 'networkidle' }); // Wait for network idle

    const content = await page.content();
    fs.writeFileSync('debug-mmca.html', content);
    console.log('Saved debug-mmca.html');

    await browser.close();
})();
