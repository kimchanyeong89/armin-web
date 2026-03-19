/**
 * Multi-Pass Scraper for Ateneum (Finnish National Gallery)
 * Runs multiple searches by classification to ensure correct categorization
 * (e.g. Sculpture vs Artwork)
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '..', 'public', 'data', 'ateneum-collection.json');

// Define passes with priority (later passes overwrite if they are more specific? No, specific first?)
// Actually, we'll store specific tags and then resolve.
// Or just scrape in order of specificity and overwrite 'Artwork'?
// Strategy: Scrape 'Artwork' first (Baseline). Then scrape Specifics and merge/overwrite category.
const PASSES = [
    { name: 'Sculpture', url: 'https://www.kansallisgalleria.fi/en/search?classifications[]=sculpture&hasImage=true&museums[]=ateneum', category: 'Sculpture', type: '3D' },
    { name: 'Installation', url: 'https://www.kansallisgalleria.fi/en/search?classifications[]=installation&hasImage=true&museums[]=ateneum', category: 'Installation', type: '3D' },
    { name: 'Painting', url: 'https://www.kansallisgalleria.fi/en/search?classifications[]=painting&hasImage=true&museums[]=ateneum', category: 'Painting', type: '2D' },
    { name: 'Drawing', url: 'https://www.kansallisgalleria.fi/en/search?classifications[]=drawing&hasImage=true&museums[]=ateneum', category: 'Drawing', type: '2D' },
    { name: 'Photography', url: 'https://www.kansallisgalleria.fi/en/search?classifications[]=photograph&hasImage=true&museums[]=ateneum', category: 'Photography', type: '2D' },
    { name: 'Graphics', url: 'https://www.kansallisgalleria.fi/en/search?classifications[]=graphics&hasImage=true&museums[]=ateneum', category: 'Drawing', type: '2D' },
    { name: 'Baseline', url: 'https://www.kansallisgalleria.fi/en/search?categories[]=artwork&hasImage=true&museums[]=ateneum', category: 'Artwork', type: '2D' }
];

async function scrape() {
    console.log("Starting Ateneum Multi-Pass Scraper...");
    const browser = await puppeteer.launch({
        headless: "new",
        defaultViewport: { width: 1280, height: 800 }
    });

    // Load existing items to preserve any manual fixes or older keys if desired?
    // Actually, fresh scrape is safer to ensure consistency, but we risk losing "On Display" status from the special link?
    // We should preserve "onDisplay" status from existing file if ID matches.
    let itemsMap = new Map();
    if (fs.existsSync(OUTPUT_FILE)) {
        try {
            const existing = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
            existing.forEach(i => itemsMap.set(String(i.id), i));
            console.log(`Loaded ${existing.length} existing items for preservation.`);
        } catch (e) { }
    }

    try {
        const page = await browser.newPage();

        // Shared response handler
        let capturedItems = new Map();

        page.on('response', async response => {
            if (response.url().includes('api/search') && response.request().method() === 'POST') {
                try {
                    const contentType = response.headers()['content-type'];
                    if (!contentType || !contentType.includes('application/json')) return;
                    const data = await response.json();
                    let list = Array.isArray(data) ? data : (data.data || []);
                    list.forEach(item => {
                        capturedItems.set(String(item.id), item);
                    });
                } catch (e) { }
            }
        });

        // Loop through passes
        for (const pass of PASSES) {
            console.log(`\n--- Running Pass: ${pass.name} ---`);
            capturedItems.clear(); // Clear capture buffer for this pass logic (though we merge into itemsMap)

            await page.goto(pass.url, { waitUntil: 'networkidle2' });

            // Cookie consent check (only needed once maybe, but check anyway)
            try {
                const cookieBtn = await page.waitForSelector('button ::-p-text("Allow all cookies")', { timeout: 2000 });
                if (cookieBtn) await cookieBtn.click();
            } catch (e) { }

            let isClicking = true;
            let noChangeCount = 0;
            let lastSize = 0;

            console.log("Clicking loop...");
            while (isClicking) {
                const btn = await page.$('xpath///button[contains(., "Show more")]');
                if (btn && await btn.boundingBox()) {
                    await btn.click();
                    try { await page.waitForNetworkIdle({ timeout: 4000, idleTime: 500 }); } catch (e) { await new Promise(r => setTimeout(r, 1000)); }
                } else {
                    isClicking = false;
                }

                if (capturedItems.size === lastSize) {
                    noChangeCount++;
                } else {
                    noChangeCount = 0;
                    lastSize = capturedItems.size;
                    process.stdout.write(`\rCaptured: ${capturedItems.size}...`);
                }
                if (noChangeCount >= 3) isClicking = false;
                if (capturedItems.size > 20000) isClicking = false;
            }

            console.log(`\nPass ${pass.name} finished. Processing ${capturedItems.size} items...`);

            // Merge into Master Map
            for (const item of capturedItems.values()) {
                const id = String(item.id);
                const existing = itemsMap.get(id);

                // Determine Metadata
                const title = item.title?.en || item.title?.fi || item.title?.sv || 'Untitled';
                let artist = 'Unknown';
                if (item.people && item.people.length > 0) {
                    const p = item.people.find(x => x.role?.en === 'Artist') || item.people[0];
                    artist = `${p.firstName || ''} ${p.familyName || ''}`.trim();
                }

                let image = '';
                let rights = '';
                let publicDomain = false;
                if (item.multimedia && item.multimedia.length > 0) {
                    const mm = item.multimedia[0];
                    image = `https://www.kansallisgalleria.fi/media-assets/${mm.image_version || 1}/jpg/1000/${mm.id}.jpg`;
                    rights = mm.license || '';
                    const r = rights.toLowerCase();
                    publicDomain = r.includes('cc0') || r.includes('public domain') || r.includes('no copyright');
                }

                let dimensions = '';
                if (item.dimensions && item.dimensions.length > 0) {
                    const d = item.dimensions[0];
                    if (d.measurements?.length >= 2) dimensions = `${d.measurements[0]} x ${d.measurements[1]} ${d.unit}`;
                    else if (d.measurements?.length === 1 && d.type === 'height') dimensions = `H ${d.measurements[0]} ${d.unit}`;
                }

                let onDisplay = !!item.currentLocation;
                // Preserve onDisplay from existing if true (since search might miss it)
                if (existing && existing.onDisplay) onDisplay = true;

                // Category Logic
                // If this is the Baseline 'Artwork' pass, we use existing category if it's better, or default to 'Artwork'.
                // If this is a Specific pass (e.g. Sculpture), we FORCE that category.
                let category = pass.category;
                let type = pass.type;

                if (pass.name === 'Baseline') {
                    // Verify if item has internal classification logic
                    const rawClass = (item.classifications || []).map(c => c.en ? c.en.toLowerCase() : '').join(' ');
                    if (rawClass.includes('sculpture')) { category = 'Sculpture'; type = '3D'; }
                    else if (rawClass.includes('painting')) { category = 'Painting'; type = '2D'; }
                    // ...
                    else {
                        // Fallback to existing if it's NOT 'Artwork'
                        if (existing && existing.category !== 'Artwork') {
                            category = existing.category;
                            type = existing.type;
                        }
                    }
                } else {
                    // Specific pass. Prioritize this category.
                    // But if existing category is ALSO specific (e.g. "Sculpture" vs "Installation"?), which wins?
                    // Usually Sculpture is better than Artwork.
                    // We trust the Pass specific category.
                }

                const newItem = {
                    id,
                    source: 'Ateneum',
                    url: `https://www.kansallisgalleria.fi/en/object/${item.id}`,
                    title,
                    artist,
                    image,
                    date: item.yearFrom ? String(item.yearFrom) : (item.year ? String(item.year) : ''),
                    year: item.yearFrom || item.year || 0,
                    medium: category,
                    dimensions,
                    category,
                    type,
                    onDisplay,
                    publicDomain,
                    rights,
                    department: 'Ateneum Art Museum'
                };

                // If existing, we merge. 
                // We overwrite unless it's Baseline pass and we want to keep specific info?
                // Logic: Always overwrite because we cycle Baseline FIRST. 
                // So Baseline sets "Artwork". 
                // Then "Painting" pass overwrites with "Painting".
                // Then "Sculpture" pass overwrites with "Sculpture".
                // This assumes an item is in ONLY ONE specific category list, or we want the LAST one (most specific?).
                // Usually items are primarily one thing. If in both, last wins.
                // We put 'Sculpture' / 'Installation' at the END of PASSES to prioritize 3D if overlap.

                itemsMap.set(id, newItem);
            }

            // Save after each pass for incremental updates
            const intermediateItems = Array.from(itemsMap.values()).filter(a => !!a.image);
            fs.writeFileSync(OUTPUT_FILE, JSON.stringify(intermediateItems, null, 2));
            console.log(`✅ [Pass ${pass.name}] Start Saving... Saved ${intermediateItems.length} total items.`);
        }

        const finalItems = Array.from(itemsMap.values()).filter(a => !!a.image);
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalItems, null, 2));
        console.log(`\n✅ Saved ${finalItems.length} items to ${OUTPUT_FILE}`);

    } catch (e) {
        console.error("Error:", e);
    } finally {
        await browser.close();
    }
}

scrape();
