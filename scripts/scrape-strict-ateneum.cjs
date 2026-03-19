/**
 * Strict Scraper for Ateneum
 * Scrapes ONLY the two requested lists:
 * 1. Paintings
 * 2. On Display
 * Merges them, resolving duplicates.
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '..', 'public', 'data', 'ateneum-collection.json');

const URLS = [
    { name: 'Painting', url: 'https://www.kansallisgalleria.fi/en/search?classifications[]=painting&hasImage=true&museums[]=ateneum', category: 'Painting', type: '2D' },
    { name: 'OnDisplay', url: 'https://www.kansallisgalleria.fi/en/search?categories[]=artwork&hasImage=true&onDisplay=ateneum', category: 'Artwork', type: '2D' } // Will enrich later
];

async function scrape() {
    console.log("Starting Ateneum Strict Scraper...");
    const browser = await puppeteer.launch({
        headless: "new",
        defaultViewport: { width: 1280, height: 800 }
    });

    const itemsMap = new Map();

    try {
        const page = await browser.newPage();

        let captured = new Map();
        page.on('response', async response => {
            if (response.url().includes('api/search') && response.request().method() === 'POST') {
                try {
                    const data = await response.json();
                    const list = Array.isArray(data) ? data : (data.data || []);
                    list.forEach(i => captured.set(String(i.id), i));
                } catch (e) { }
            }
        });

        for (const source of URLS) {
            console.log(`\n--- Scraping ${source.name} ---`);
            captured.clear();

            await page.goto(source.url, { waitUntil: 'networkidle2' });

            // Cookie
            try {
                const btn = await page.waitForSelector('button ::-p-text("Allow all cookies")', { timeout: 2000 });
                if (btn) await btn.click();
            } catch (e) { }

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

                if (captured.size === lastSize) {
                    noChange++;
                    if (noChange >= 3) isClicking = false;
                } else {
                    noChange = 0;
                    lastSize = captured.size;
                    process.stdout.write(`\rCaptured: ${captured.size}...`);
                }
            }
            console.log(`\nFinished ${source.name}. Processing ${captured.size} items...`);

            // Process
            for (const item of captured.values()) {
                const id = String(item.id);

                // If item already exists, we maintain it (Deduplication)
                // BUT if we are in 'OnDisplay' pass, we want to update the 'onDisplay' flag check?
                // Actually, logic: OnDisplay list implies onDisplay=true.
                // Painting list implies onDisplay=unknown (or false default).
                // So if item exists from Painting, and now found in OnDisplay, update onDisplay=true.
                // If item exists from OnDisplay, and now found in Painting, keep onDisplay=true.

                let newItem = itemsMap.get(id);
                if (!newItem) {
                    // Create new
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

                    newItem = {
                        id,
                        source: 'Ateneum',
                        url: `https://www.kansallisgalleria.fi/en/object/${item.id}`,
                        title,
                        artist,
                        image,
                        date: item.yearFrom ? String(item.yearFrom) : (item.year ? String(item.year) : ''),
                        year: item.yearFrom || item.year || 0,
                        medium: source.category, // Default to list category
                        dimensions,
                        category: source.category,
                        type: source.type,
                        onDisplay: false, // Default false, update below
                        publicDomain,
                        rights,
                        department: 'Ateneum Art Museum'
                    };
                }

                if (source.name === 'OnDisplay') {
                    newItem.onDisplay = true;
                    // Tag for Enrichment later?
                    newItem._needsEnrichment = true;
                } else if (source.name === 'Painting') {
                    // Force category if generic 'Artwork' (from OnDisplay prev pass)?
                    if (newItem.category === 'Artwork') {
                        newItem.category = 'Painting';
                        newItem.type = '2D';
                        if (newItem.medium === 'Artwork') newItem.medium = 'Painting';
                    }
                }

                itemsMap.set(id, newItem);
            }
        }

        // Finalize
        const finalItems = Array.from(itemsMap.values()).map(i => {
            const { _needsEnrichment, ...rest } = i;
            return { ...rest, _needsEnrichment }; // Keep internal flag for next script? Or just filter by onDisplay?
            // Actually, OnDisplay=true is enough to filter.
        });

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalItems, null, 2));
        console.log(`\n✅ Saved ${finalItems.length} unique items to ${OUTPUT_FILE}`);

    } catch (e) {
        console.error("Error:", e);
    } finally {
        await browser.close();
    }
}

scrape();
