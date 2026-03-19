const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'public', 'data', 'ateneum-collection.json');

async function enrich() {
    console.log("Starting Targeted Enrichment...");

    const items = JSON.parse(fs.readFileSync(FILE, 'utf8'));

    // Target:
    // 1. Items labeled 'Artwork' (likely from OnDisplay list and untyped)
    // 2. Hugo Simberg (to fix Graphic Arts)
    // 3. OnDisplay items (to ensure high quality metadata)
    const targets = items.filter(i =>
        i.category === 'Artwork' ||
        i.artist.includes('Simberg') ||
        i.onDisplay
    );

    console.log(`Found ${targets.length} items to enrich.`);

    const browser = await puppeteer.launch({
        headless: "new",
        defaultViewport: { width: 1280, height: 800 }
    });

    const BATCH_SIZE = 5;
    let updatedCount = 0;

    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
        const batch = targets.slice(i, i + BATCH_SIZE);
        process.stdout.write(`\rProcessing ${i}/${targets.length}...`);

        await Promise.all(batch.map(async (item) => {
            const page = await browser.newPage();
            try {
                await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 20000 });

                const metadata = await page.evaluate(() => {
                    const results = { category: '', medium: '', dimensions: '' };
                    const dts = Array.from(document.querySelectorAll('dt'));
                    for (const dt of dts) {
                        const label = dt.innerText.trim().toLowerCase();
                        const dd = dt.nextElementSibling;
                        if (dd && dd.tagName === 'DD') {
                            const val = dd.innerText.trim();
                            if (label.includes('category')) results.category = val;
                            if (label.includes('material') || label.includes('medium') || label.includes('technique')) results.medium = val;
                        }
                    }
                    return results;
                });

                if (metadata.category) {
                    item.category = metadata.category;
                    // Infer Type
                    const c = item.category.toLowerCase();
                    if (c.includes('sculpture') || c.includes('installation')) item.type = '3D';
                    else item.type = '2D';

                    // If medium is same as category (e.g. "Graphic Arts"), try to keep existing medium if it's better?
                    // But if existing medium is 'Artwork', overwrite.
                    // If metadata.medium is present, use it.
                }

                if (metadata.medium) {
                    item.medium = metadata.medium;
                } else if (item.medium === 'Artwork' || item.medium === item.category) {
                    // If we failed to read medium, and it's redundant, maybe leave it?
                }

                updatedCount++;
            } catch (e) {
                // ignore
            } finally {
                await page.close();
            }
        }));

        // Save periodically
        if (i % 50 === 0) fs.writeFileSync(FILE, JSON.stringify(items, null, 2));
    }

    fs.writeFileSync(FILE, JSON.stringify(items, null, 2));
    console.log(`\n✅ Enriched ${updatedCount} items.`);

    await browser.close();
}

enrich();
