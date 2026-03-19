/**
 * Fix FNG Mediums (Hybrid Version)
 * 1. Tries to wait for API response (fastest if works).
 * 2. If API fails/empty/304, FALLBACK to scraping the DOM text.
 *    The content seems to be rendered client-side, so we might need to wait for a specific selector.
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const FILES = [
    path.join(__dirname, '../public/data/ateneum-collection.json'),
    path.join(__dirname, '../public/data/kiasma-collection.json'),
    path.join(__dirname, '../public/data/sinebrychoff-collection.json')
];

async function main() {
    console.log("Starting FNG Medium Fixer (Hybrid)...");

    const browser = await puppeteer.launch({
        headless: "new"
    });

    const PAGE_POOL_SIZE = 5;
    const pages = [];
    console.log(`Launching ${PAGE_POOL_SIZE} pages...`);
    for (let i = 0; i < PAGE_POOL_SIZE; i++) {
        const p = await browser.newPage();
        // Set a realistic viewport
        await p.setViewport({ width: 1280, height: 800 });
        pages.push(p);
    }

    for (const file of FILES) {
        if (!fs.existsSync(file)) {
            console.log(`Skipping missing file: ${file}`);
            continue;
        }

        console.log(`\nProcessing ${path.basename(file)}...`);
        const items = JSON.parse(fs.readFileSync(file, 'utf8'));

        let processedCount = 0;
        let changedCount = 0;

        const chunks = [];
        const CHUNK_SIZE = PAGE_POOL_SIZE;
        for (let i = 0; i < items.length; i += CHUNK_SIZE) {
            chunks.push(items.slice(i, i + CHUNK_SIZE));
        }

        for (const chunk of chunks) {
            const promises = chunk.map((item, idx) => {
                // If medium is empty or generic, try to fix it
                const needsFix = !item.medium || item.medium === item.category ||
                    ['Painting', 'Sculpture', 'Drawing', 'Print', 'Photograph', 'Artwork', 'Installation'].includes(item.medium);

                if (needsFix) {
                    const p = pages[idx];
                    return processItem(p, item).then(changed => {
                        if (changed) changedCount++;
                    });
                } else {
                    return Promise.resolve();
                }
            });

            await Promise.all(promises);
            processedCount += chunk.length;
            process.stdout.write(`\r   Progress: ${processedCount}/${items.length} (Updated: ${changedCount})`);

            if (processedCount % 50 === 0) {
                fs.writeFileSync(file, JSON.stringify(items, null, 2));
            }
        }

        fs.writeFileSync(file, JSON.stringify(items, null, 2));
        console.log(`\n   Finished ${path.basename(file)}. Updated ${changedCount} items.`);
    }

    await browser.close();
    console.log("\nAll Done!");
}

async function processItem(page, item) {
    let newMedium = '';

    try {
        // 1. Try API capture first (fastest)
        const responsePromise = page.waitForResponse(res =>
            res.url().includes(`api/pagedata/en/object/${item.id}`) &&
            (res.status() === 200 || res.status() === 304)
            , { timeout: 6000 }).catch(() => null);

        // Navigate
        await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => { });

        try {
            const response = await responsePromise;
            if (response) {
                const capturedData = await response.json().catch(() => null);
                if (capturedData) {
                    if (capturedData.techniques && capturedData.techniques.length > 0) {
                        newMedium = capturedData.techniques.map(t => t.en).join(', ');
                    }
                    if (!newMedium && capturedData.materials && capturedData.materials.length > 0) {
                        newMedium = capturedData.materials.map(m => m.en).join(', ');
                    }
                }
                // If API returned valid info, we use it. 
                // We DON'T exit yet if it was empty, we can try DOM fallback.
            }
        } catch (e) { }

        // 2. Fallback: DOM Scraping if API failed or returned nothing
        if (!newMedium) {
            // Wait a bit for client side rendering
            await new Promise(r => setTimeout(r, 2000));

            newMedium = await page.evaluate(() => {
                // Heuristic: Look for list items or paragraphs that contain dimension-like strings
                // and grab the text *after* the dimensions, or just lines that "look like" materials.
                // The structure for Icarus was: "185 x 95 cm, tempera, canvas, oil"

                // Try finding the text by a common pattern: dimensions followed by comma
                const dimRegex = /(\d+(?:[.,]\d+)?\s*[x×]\s*\d+(?:[.,]\d+)?(?:\s*[x×]\s*\d+(?:[.,]\d+)?)?\s*cm)/i;

                const candidates = document.querySelectorAll('li, p, div');
                for (const el of candidates) {
                    const txt = el.innerText;
                    if (!txt) continue;

                    if (dimRegex.test(txt)) {
                        // Found dimensions. The material usually follows after a comma.
                        // "185 x 95 cm, tempera, canvas, oil"
                        // Or splits by newline
                        const parts = txt.split(/cm\s*,\s*/i);
                        if (parts.length > 1) {
                            // Part 1 is usually the material
                            let materialPart = parts[1].split('\n')[0].trim(); // take first line after comma
                            if (materialPart && materialPart.length < 150) { // sanity check length
                                return materialPart;
                            }
                        }

                        // Sometimes it's on a new line?
                        // "185 x 95 cm\ntempera"
                        const lines = txt.split('\n');
                        for (let i = 0; i < lines.length; i++) {
                            if (dimRegex.test(lines[i])) {
                                // Check next line?
                                if (lines[i + 1]) return lines[i + 1].trim();
                                // Or same line if not comma separated but space?
                                // Usually it is comma.
                            }
                        }
                    }

                    // Fallback: look for "Technique:" or "Material:" labels if present
                    // (Though debug showed none)
                }
                return '';
            });
        }

        if (newMedium) {
            // Clean up: removes dimensions if accidentally included
            newMedium = newMedium.replace(/^\d+.*cm,?\s*/i, '').trim();

            // Validate: check if it contains irrelevant info (purchase, owner, etc.)
            const lowerM = newMedium.toLowerCase();
            const invalidKeywords = ['purchase', 'owner', 'collection', 'gift', 'bequest', 'deposit', 'donated', 'funding'];
            const hasInvalidKeyword = invalidKeywords.some(k => lowerM.includes(k));
            const looksLikeId = /[A-Z]-\d{4}-\d+/.test(newMedium); // A-2025-266

            if (hasInvalidKeyword || looksLikeId) {
                // console.log(`Discarding invalid medium: ${newMedium}`);
                newMedium = "";
            }

            if (newMedium && item.medium !== newMedium) {
                // console.log(`Updated ${item.id}: "${newMedium}"`);
                item.medium = newMedium;
                return true;
            }
        } else {
            // If still nothing found, and we have a generic "Painting", clear it to be safe
            // as per user request to prefer empty over generic.
            const generic = ['Painting', 'Sculpture', 'Artwork', 'Drawing', 'Print', 'Photograph', 'Object', 'Installation'];
            if (item.medium === item.category || generic.includes(item.medium)) {
                item.medium = "";
                return true;
            }
        }

    } catch (e) {
        // console.error(`Failed ${item.id}`, e);
    }
    return false;
}

main();
