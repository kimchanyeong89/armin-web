const { chromium } = require('playwright');

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto('https://onlinecollection.leopoldmuseum.org/en/search/', { waitUntil: 'domcontentloaded' });

    const filters = await page.evaluate(() => {
        // Try to find the filter sidebar
        // Look for "Category" or checkboxes
        const sections = Array.from(document.querySelectorAll('.filter-section, .facet'));

        const categories = [];

        // Strategy: find the section with "Object type" or "Category" header
        // Then get labels and counts

        // Just dump all labels for now
        const labels = Array.from(document.querySelectorAll('label'));
        return labels.map(l => l.innerText.trim()).filter(t => t.length > 0 && t.length < 50);
    });

    console.log('Filters found:', filters);

    await browser.close();
}

main().catch(console.error);
