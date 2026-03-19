const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'public', 'data', 'ateneum-collection.json');

async function enrich() {
    console.log("Starting Enrichment for On-Display items...");

    // Load data
    const items = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    let onDisplayItems = items.filter(i => i.onDisplay);

    // Prioritize ID 2878034 (Head of a Boy)
    onDisplayItems.sort((a, b) => {
        if (a.id === '2878034') return -1;
        if (b.id === '2878034') return 1;
        return 0;
    });

    console.log(`Found ${onDisplayItems.length} On Display items to enrich.`);

    const browser = await puppeteer.launch({
        headless: "new",
        defaultViewport: { width: 1280, height: 800 }
    });

    const BATCH_SIZE = 5;
    let updatedCount = 0;

    for (let i = 0; i < onDisplayItems.length; i += BATCH_SIZE) {
        const batch = onDisplayItems.slice(i, i + BATCH_SIZE);
        console.log(`Processing batch ${i + 1} - ${i + batch.length} / ${onDisplayItems.length}...`);

        await Promise.all(batch.map(async (item) => {
            const page = await browser.newPage();
            try {
                // Determine 3D/2D
                // item.url is like https://www.kansallisgalleria.fi/en/object/xxxx
                await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

                // Extract Category
                // Look for text "Category"
                const metadata = await page.evaluate(() => {
                    const clean = (txt) => txt.replace(/\n/g, '').trim();
                    const results = { category: '', medium: '', dimensions: '' };

                    // Helper to find label
                    const findValue = (label) => {
                        const els = Array.from(document.querySelectorAll('*'));
                        const labelEl = els.find(e => e.innerText && e.innerText.trim().toUpperCase() === label.toUpperCase());
                        if (labelEl) {
                            // Try sibling
                            // The structure often is: <div> <dt>Label</dt> <dd>Value</dd> </div> or similar
                            // Or in a listing
                            // Let's try to find the container
                            // Sometimes it's just nearby text.
                            // Let's try to traverse up and find formatted value
                            let parent = labelEl.parentElement;
                            if (parent) return parent.innerText.replace(label, '').trim();
                        }
                        return '';
                    };

                    // Targeted extraction for FNG site
                    // They use Description Lists <dl> often or divs
                    const dts = Array.from(document.querySelectorAll('dt'));
                    for (const dt of dts) {
                        const label = dt.innerText.trim().toLowerCase();
                        const dd = dt.nextElementSibling;
                        if (dd && dd.tagName === 'DD') {
                            const val = dd.innerText.trim();
                            if (label.includes('category')) results.category = val;
                            if (label.includes('material') || label.includes('medium') || label.includes('technique')) results.medium = val;
                            if (label.includes('measurements') || label.includes('dimensions')) results.dimensions = val;
                        }
                    }

                    // Fallback to searching text nodes if no DL
                    if (!results.category) {
                        // Try searching purely by text content in divs
                        // This is risky but "Category" is unique enough
                    }

                    return results;
                });

                if (metadata.category) {
                    item.category = metadata.category;
                    // Infer 2D/3D
                    const catLower = item.category.toLowerCase();
                    if (catLower.includes('sculpture') || catLower.includes('installation') || catLower.includes('relief')) {
                        item.type = '3D';
                    } else {
                        item.type = '2D';
                        if (catLower.includes('painting')) item.medium = 'Painting'; // Ensure consistency
                    }
                }

                if (metadata.medium && item.medium === 'Artwork') {
                    item.medium = metadata.medium;
                }

                // Update dimensions if better? Sticking to scraper's usually safer unless empty

                updatedCount++;
            } catch (e) {
                console.error(`Failed ${item.id}:`, e.message);
            } finally {
                await page.close();
            }
        }));

        // Incremental save just in case
        if (i % 20 === 0) {
            fs.writeFileSync(FILE, JSON.stringify(items, null, 2));
        }
    }

    fs.writeFileSync(FILE, JSON.stringify(items, null, 2));
    console.log(`✅ Enrichment complete. Updated ${updatedCount} items.`);

    await browser.close();
}

enrich();
