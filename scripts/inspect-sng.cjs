const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
    const browser = await chromium.launch({ headless: true }); // headless: true for speed, can be false for debugging
    const page = await browser.newPage();

    // Set a real user agent to avoid basic blocks
    await page.setExtraHTTPHeaders({
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    console.log('Navigating to National Galleries of Scotland search page...');

    try {
        const response = await page.goto('https://www.nationalgalleries.org/art-and-artists/search', {
            waitUntil: 'networkidle',
            timeout: 60000
        });

        console.log(`Status: ${response.status()}`);

        // Take a screenshot to see what we got (debug)
        // await page.screenshot({ path: 'sng_debug.png' });

        // Check for filters that might separate the museums
        // We'll dump the text content of labels or select options
        const filters = await page.evaluate(() => {
            const labels = Array.from(document.querySelectorAll('label, .filter-label, legend, option')).map(el => el.textContent.trim());
            return labels.filter(t => t.length > 0 && t.length < 50);
        });

        console.log('Potential Filters found:', filters.slice(0, 50));

        // Attempt to find specific filters for the 3 galleries
        // Often these are in a 'Venue' or 'Gallery' facet

        // Let's also check if there is an API call happening in the background
        // We can't easily capture past network requests here without event listeners set up before goto, 
        // but let's try to infer from the page structure if it's SPA or server-rendered.

        const isSPA = await page.evaluate(() => !!window.next || !!window.__NEXT_DATA__ || !!window.__NUXT__);
        console.log('Is Next/Nuxt SPA?', isSPA);

        // Dump the HTML to a file to inspect locally if needed
        const content = await page.content();
        fs.writeFileSync('sng_debug.html', content);
        console.log('Saved HTML to sng_debug.html');

    } catch (e) {
        console.error('Error loading page:', e);
    }

    await browser.close();
})();
