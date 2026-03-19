/**
 * Fix Ateneum Categories - Update existing 6922 items with correct categories
 * Uses targeted searches to update category metadata without adding new items
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const BACKUP_FILE = path.join(__dirname, '..', 'public', 'data', 'ateneum-collection-backup.json');
const OUTPUT_FILE = path.join(__dirname, '..', 'public', 'data', 'ateneum-collection.json');

// Category searches to determine proper classification
const CATEGORY_SEARCHES = [
    { name: 'Sculpture', url: 'https://www.kansallisgalleria.fi/en/search?classifications[]=sculpture&hasImage=true&museums[]=ateneum', category: 'Sculpture', type: '3D' },
    { name: 'Installation', url: 'https://www.kansallisgalleria.fi/en/search?classifications[]=installation&hasImage=true&museums[]=ateneum', category: 'Installation', type: '3D' },
    { name: 'Painting', url: 'https://www.kansallisgalleria.fi/en/search?classifications[]=painting&hasImage=true&museums[]=ateneum', category: 'Painting', type: '2D' },
    { name: 'Drawing', url: 'https://www.kansallisgalleria.fi/en/search?classifications[]=drawing&hasImage=true&museums[]=ateneum', category: 'Drawing', type: '2D' },
    { name: 'Photography', url: 'https://www.kansallisgalleria.fi/en/search?classifications[]=photograph&hasImage=true&museums[]=ateneum', category: 'Photography', type: '2D' }
];

async function fixCategories() {
    console.log("Starting Ateneum Category Fix...");

    // Load the ORIGINAL 6922 items (from backup or current if it's still correct size)
    let originalItems = [];

    // First check if current file is the right size
    if (fs.existsSync(OUTPUT_FILE)) {
        const current = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
        if (current.length <= 7500) {
            console.log(`Using current file with ${current.length} items as base.`);
            originalItems = current;
            // Create backup
            fs.writeFileSync(BACKUP_FILE, JSON.stringify(current, null, 2));
        }
    }

    if (originalItems.length === 0) {
        console.error("Could not find original collection. Please restore from backup.");
        return;
    }

    // Create ID map for quick lookup
    const itemsById = new Map(originalItems.map(item => [item.id, item]));
    console.log(`Loaded ${itemsById.size} items to update.`);

    const browser = await puppeteer.launch({
        headless: "new",
        defaultViewport: { width: 1280, height: 800 }
    });

    try {
        const page = await browser.newPage();

        // For each category, collect IDs and update the items
        for (const search of CATEGORY_SEARCHES) {
            console.log(`\n--- Searching for ${search.name} ---`);
            const categoryIds = new Set();

            page.on('response', async response => {
                if (response.url().includes('api/search') && response.request().method() === 'POST') {
                    try {
                        const contentType = response.headers()['content-type'];
                        if (!contentType || !contentType.includes('application/json')) return;
                        const data = await response.json();
                        const list = Array.isArray(data) ? data : (data.data || []);
                        list.forEach(item => categoryIds.add(String(item.id)));
                    } catch (e) { }
                }
            });

            await page.goto(search.url, { waitUntil: 'networkidle2' });

            // Cookie consent
            try {
                const btn = await page.waitForSelector('button ::-p-text("Allow all cookies")', { timeout: 2000 });
                if (btn) await btn.click();
            } catch (e) { }

            // Click loop
            let isClicking = true;
            let noChange = 0;
            let lastSize = 0;

            while (isClicking) {
                const btn = await page.$('xpath///button[contains(., "Show more")]');
                if (btn && await btn.boundingBox()) {
                    await btn.click();
                    try { await page.waitForNetworkIdle({ timeout: 4000, idleTime: 500 }); } catch (e) { }
                } else {
                    isClicking = false;
                }

                if (categoryIds.size === lastSize) {
                    noChange++;
                    if (noChange >= 3) isClicking = false;
                } else {
                    noChange = 0;
                    lastSize = categoryIds.size;
                    process.stdout.write(`\rFound ${categoryIds.size} ${search.name} items...`);
                }
            }

            console.log(`\nUpdating ${categoryIds.size} items to ${search.name}...`);

            // Update items that exist in our collection
            let updated = 0;
            for (const id of categoryIds) {
                const item = itemsById.get(id);
                if (item) {
                    item.category = search.category;
                    item.medium = search.category;
                    item.type = search.type;
                    updated++;
                }
            }
            console.log(`Updated ${updated} items in collection.`);
        }

        // Save the updated collection
        const finalItems = Array.from(itemsById.values());
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalItems, null, 2));
        console.log(`\n✅ Saved ${finalItems.length} items with updated categories.`);

    } catch (e) {
        console.error("Error:", e);
    } finally {
        await browser.close();
    }
}

fixCategories();
