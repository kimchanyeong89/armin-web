const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
    console.log('Starting SNG Scraper Test...');
    const browser = await chromium.launch({
        headless: true,
        args: ['--disable-blink-features=AutomationControlled']
    });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    try {
        // Main search page
        // Based on typical NGS URLs
        const url = 'https://www.nationalgalleries.org/art-and-artists/search';
        console.log(`Navigating to ${url}...`);

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        console.log(`Page title: ${await page.title()}`);

        // Wait for potential Cloudflare challenge
        await page.waitForTimeout(5000);

        // Check for filters
        // Look for filter headers or checkboxes
        // "Venue" or "Gallery"
        // Inspecting typical structure
        const filters = await page.evaluate(() => {
            const items = [];
            // Try to find checkbox labels
            document.querySelectorAll('label').forEach(l => {
                if (l.innerText.includes('National') || l.innerText.includes('Gallery') || l.innerText.includes('Portrait')) {
                    items.push(l.innerText.trim());
                }
            });
            return items;
        });
        console.log('Detected potential venue filters:', filters);

        // Try to scrape first 5 artworks just to see structure
        const artworks = await page.evaluate(() => {
            const items = [];
            // Generic selectors for NGS (assumption based on common designs)
            // They often use article or li for result items
            // Look for images and titles
            const elements = document.querySelectorAll('article.teaser, .search-result, .search-results__item, li.grid__item');

            elements.forEach(el => {
                const titleEl = el.querySelector('h3, h2, .title');
                const imgEl = el.querySelector('img');
                const linkEl = el.querySelector('a');

                if (titleEl && imgEl) {
                    items.push({
                        title: titleEl.innerText.trim(),
                        image: imgEl.src,
                        link: linkEl ? linkEl.href : null
                    });
                }
            });
            return items;
        });

        console.log(`Found ${artworks.length} artworks on page 1.`);
        if (artworks.length > 0) {
            console.log('First item:', artworks[0]);
        } else {
            // Dump HTML to see what's wrong if no items
            const html = await page.content();
            fs.writeFileSync('sng_error_dump.html', html);
            console.log('Saved dump to sng_error_dump.html');
        }

    } catch (e) {
        console.error('Error:', e);
    }

    await browser.close();
})();
