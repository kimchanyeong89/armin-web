const { chromium } = require('playwright');
const fs = require('fs');

const path = 'public/data/huntington-collection.json';
const data = JSON.parse(fs.readFileSync(path, 'utf8'));

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();

    // Try to load one to see if there's an API or we just scrape DOM
    const page = await context.newPage();

    const toUpdate = data.filter(d => !d.year || d.year === 0 || d.year === '');
    console.log(`Need to fetch year for ${toUpdate.length} items`);

    // We'll process them in batches of 5 to not overwhelm Vercel or Playwright
    const batchSize = 10;
    for (let i = 0; i < toUpdate.length; i += batchSize) {
        const batch = toUpdate.slice(i, i + batchSize);
        console.log(`Processing batch ${i / batchSize + 1} / ${Math.ceil(toUpdate.length / batchSize)}`);

        await Promise.all(batch.map(async (item) => {
            const p = await context.newPage();
            try {
                await p.route('**/*', route => {
                    if (['image', 'media', 'font', 'stylesheet'].includes(route.request().resourceType())) {
                        route.abort();
                    } else {
                        route.continue();
                    }
                });

                await p.goto(`https://www.huntington.org/collections/${item.objectID}`, { waitUntil: 'domcontentloaded', timeout: 30000 });

                // Let's find the year. usually it's in a Definition list or specific text block
                // Wait a small bit
                await p.waitForTimeout(1000);

                // Look for text like "Date" or 4 digits
                // Typical structure might be a <dt>Date</dt> <dd>1770</dd>
                const dateText = await p.evaluate(() => {
                    // Search all elements for "Date" label
                    const els = Array.from(document.querySelectorAll('*'));
                    for (const el of els) {
                        if (el.textContent === 'Date' && el.nextElementSibling) {
                            return el.nextElementSibling.textContent.trim();
                        }
                    }
                    // fallback
                    const text = document.body.innerText;
                    const match = text.match(/Date[\s\n]*:?[\s\n]*([^\n]+)/i);
                    if (match) return match[1];
                    return null;
                });

                if (dateText) {
                    item.displayDate = dateText;
                    const yearMatch = dateText.match(/\b(1[0-9]{3}|20[0-2][0-9])\b/);
                    if (yearMatch) {
                        item.year = parseInt(yearMatch[1], 10);
                    }
                    console.log(`[${item.objectID}] Success: ${item.year} (${item.displayDate})`);
                } else {
                    // Look inside the JSON data if next.js prop is there
                    const nextData = await p.evaluate(() => {
                        const script = document.getElementById('__NEXT_DATA__');
                        return script ? JSON.parse(script.textContent) : null;
                    });

                    if (nextData) {
                        // Find deep date field
                        const str = JSON.stringify(nextData);
                        const yMatch = str.match(/"date":"([^"]+)"/i) || str.match(/"displayDate":"([^"]+)"/i);
                        if (yMatch) {
                            item.displayDate = yMatch[1];
                            const yM = yMatch[1].match(/\b(1[0-9]{3}|20[0-2][0-9])\b/);
                            if (yM) item.year = parseInt(yM[1], 10);
                        }
                        console.log(`[${item.objectID}] NextData: ${item.year} (${item.displayDate})`);
                    } else {
                        console.log(`[${item.objectID}] Not found`);
                    }
                }
            } catch (err) {
                console.log(`[${item.objectID}] Error: ${err.message}`);
            } finally {
                await p.close();
            }
        }));

        // Save partially
        fs.writeFileSync(path, JSON.stringify(data, null, 2));
    }

    await browser.close();
    console.log('Done!');
})();
