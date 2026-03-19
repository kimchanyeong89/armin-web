const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.goto('https://ntmofa-collections.ntmofa.gov.tw/en/Search.aspx', { waitUntil: 'networkidle2' });

    // Click search
    await page.evaluate(() => {
        document.getElementById('btnAdvSearch').click();
    });
    await new Promise(r => setTimeout(r, 4000));

    // Debug evaluate
    try {
        const debugInfo = await page.evaluate(() => {
            const items = document.querySelectorAll('.ArtWorkListItem');
            const infos = [];
            items.forEach((div, i) => {
                if (i > 2) return; // only first 3
                infos.push({
                    html: div.outerHTML.substring(0, 100),
                    hasName: !!div.querySelector('.name'),
                    hasLink: !!div.querySelector('a[href*="GalData"]'),
                    linkHref: div.querySelector('a[href*="GalData"]')?.href
                });
            });
            return {
                count: items.length,
                samples: infos
            };
        });
        console.log('Debug info:', JSON.stringify(debugInfo, null, 2));
    } catch (e) {
        console.error('Evaluate failed:', e);
    }

    await browser.close();
})();
