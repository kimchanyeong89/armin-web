const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const OUTPUT_FILE = path.resolve(__dirname, '../public/data/mah-collection.json');
const TARGET_URL_TEMPLATE = "https://www.mahmah.ch/collection/recherche?f%5B0%5D=artwork_property%3A%C5%92uvres%20avec%20images&f%5B1%5D=collections%3A57484&page=";

// Resume logic
let collectedData = [];
if (fs.existsSync(OUTPUT_FILE)) {
    try {
        collectedData = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
        console.log(`Loaded ${collectedData.length} existing items.`);
    } catch (e) {
        console.log('Error loading existing data, starting fresh.');
    }
}
const processedIds = new Set(collectedData.map(d => d.id));

async function scrape() {
    const browser = await puppeteer.launch({
        headless: true, // Set to false to debug visually
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    // Set a big viewport
    await page.setViewport({ width: 1366, height: 768 });

    let pageNum = 0;
    // Skip pages we likely completed? 
    // If we have 200 items, that's 10 pages (0-9). Start at 10.
    if (collectedData.length > 0) {
        pageNum = Math.floor(collectedData.length / 20); 
        console.log(`Resuming from Page ${pageNum}`);
    }

    let keepGoing = true;

    while (keepGoing) {
        const url = `${TARGET_URL_TEMPLATE}${pageNum}`;
        console.log(`Navigating to Page ${pageNum}...`);
        
        try {
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        } catch (e) {
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ... inside scrape ...
            console.log(`Error loading page ${pageNum}: ${e.message}. Retrying...`);
            await sleep(5000);
            try {
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
            } catch (e2) {
                console.log('Retry failed. Skipping page or stopping? Stopping.');
                // break; // Don't break, maybe skip?
            }
        }

        // Check for 500 error or empty
        const title = await page.title();
        if (title.includes('500') || title.includes('Erreur')) {
            console.log(`Page ${pageNum} returned 500 Error. Skipping to next page...`);
            pageNum++;
            continue;
        }

        // Extract Links from Search Page
        // Selectors for result items
        const links = await page.evaluate(() => {
            const anchors = Array.from(document.querySelectorAll('.view-content .views-row article a'));
            return anchors.map(a => a.href);
        });

        if (links.length === 0) {
            console.log('No items found on this page. Reached end?');
            // Check if there is a "next" pager to be sure
            const hasNext = await page.$('.pager__item--next');
            if (!hasNext && pageNum > 0) {
                keepGoing = false;
            } else {
                // maybe temporary glitch?
                 console.log('No links but might allow next? Checking...');
            }
            if (!keepGoing) break;
        }

        console.log(`Found ${links.length} items on page ${pageNum}. Processing details...`);

        // Process each detail page
        for (const link of links) {
            // Check if already scraped (need ID from URL? URL is unique enough)
            // But we used 'id' in data. content of link: /collection/oeuvres/mah-g-1234
            // Let's assume URL is the key
            
            // To be safe, we open the link
            // Optimization: Open in new tab? No, keep single tab to stay persistent?
            // Single browsing context is safer for anti-bot.
            
            // Wait a bit
            await sleep(500 + Math.random() * 1000); // 0.5 - 1.5s delay
            
            try {
                await page.goto(link, { waitUntil: 'domcontentloaded' });
                
                // Extract Data
                const item = await page.evaluate(() => {
                    const getText = (sel) => {
                        const el = document.querySelector(sel);
                        return el ? el.innerText.trim() : '';
                    };

                    const title = getText('h1.collections-page-title span') || getText('h1');
                    const artist = getText('.collections-page-meta .author') || getText('.field--name-field-n-main-author');
                    const date = getText('.collections-page-meta .date .field--name-field-ph-date-display') || getText('.field--name-field-n-main-dates');
                    const medium = getText('.field--name-field-n-main-material-techniques');
                    const dimensions = getText('.field--name-field-n-main-dimensions');
                    
                    let rawInv = getText('.field--name-field-n-main-inventory-number');
                    const id = rawInv.replace(/^NUMÉRO D'INVENTAIRE\s*/i, '').trim();

                    // IIIF Image extraction from settings
                    let imageUrl = '';
                    // Try simple image first
                    const img = document.querySelector('.field--name-field-n-main-hd-picture img');
                    if (img) {
                        imageUrl = img.src;
                    }
                    
                    // Try IIIF if available (better res)
                    // We can't easily access drupalSettings variable here without injection, 
                    // but we can look for the script tag
                    // Actually, simple image is usually fine for this usage.
                    
                    return {
                        id: id || 'unknown',
                        title,
                        artist,
                        date,
                        medium,
                        dimensions,
                        imageUrl,
                        source: window.location.href
                    };
                });

                if (item.title && item.imageUrl) {
                    // Check duplicate by ID
                    if (!processedIds.has(item.id)) {
                        collectedData.push({
                            ...item,
                            collection: "Musée d'Art et d'Histoire, Genève",
                            classification: "Painting" // Default/simplified
                        });
                        processedIds.add(item.id);
                        console.log(`Saved: ${item.title}`);
                    } else {
                        console.log(`Skipped (Duplicate): ${item.title}`);
                    }
                } else {
                    console.log(`Skipped (Missing Info): ${link}`);
                }

            } catch (err) {
                console.error(`Failed to scrape details for ${link}: ${err.message}`);
            }

            // Save periodically
            if (collectedData.length % 50 === 0) {
                 fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collectedData, null, 2));
            }
        }
        
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collectedData, null, 2));
        pageNum++;
    }

    console.log('Done.');
    await browser.close();
}

scrape();
