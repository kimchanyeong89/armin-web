const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../public/data/guggenheim-venice-collection.json');
const BASE_URL = 'https://www.guggenheim-venice.it/en/art/works/';

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function scrapeMetadata(page) {
    return await page.evaluate(() => {
        const data = {};

        // Strategy 1: Table based metadata
        // <div class="Artwork-specs"> <table class="table"> <tr> <td>Label</td> <td>Value</td> ...
        const rows = document.querySelectorAll('.Artwork-specs .table tr, .table tr'); 
        rows.forEach(row => {
            const tds = row.querySelectorAll('td');
            if (tds.length === 2) {
                const key = tds[0].textContent.trim().replace(/:$/, '').toLowerCase();
                const value = tds[1].textContent.trim();
                data[key] = value;
            }
        });
        
        // Map Type to Category if Category missing
        if (data.type && !data.category) {
            data.category = data.type;
        }

        // Description / Bio
        const descEl = document.querySelector('.Artwork-description');
        if (descEl) {
            data.bio = descEl.textContent.trim();
        } else {
             // Fallback
             const oldBio = document.querySelector('.ArtworkDetail-bio');
             if (oldBio) data.bio = oldBio.textContent.trim();
        }

        // Get image from detail page
        // Strategy 1: noscript img inside .Artwork-figure
        const noScriptImg = document.querySelector('.Artwork-figure noscript img');
        if (noScriptImg) {
            data.image = noScriptImg.src;
        } 
        
        // Strategy 2: data-bgset on .Artwork-image
        if (!data.image) {
             const bgSpan = document.querySelector('.Artwork-figure .Artwork-image');
             if (bgSpan && bgSpan.dataset.bgset) {
                 const parts = bgSpan.dataset.bgset.split(',');
                 const lastPart = parts[parts.length - 1].trim();
                 const url = lastPart.split(' ')[0];
                 if (url) {
                    if (url.startsWith('http')) data.image = url;
                    else data.image = window.location.origin + url;
                 }
             }
        }
        
        // Fallback to old selector if structure differs
        if (!data.image) {
             const img = document.querySelector('.ArtworkDetail-figure img');
             if (img) data.image = img.src || img.getAttribute('data-src');
        }

        return data;
    });
}

async function safeGoto(page, url, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            return true;
        } catch (e) {
            console.log(`Error navigating to ${url} (attempt ${i + 1}/${retries}): ${e.message}`);
            await sleep(2000 * (i + 1));
        }
    }
    return false;
}

(async () => {
    let existingData = [];
    if (fs.existsSync(OUTPUT_FILE)) {
        try {
            existingData = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
            if (!Array.isArray(existingData)) existingData = []; 
            console.log(`Loaded ${existingData.length} existing items.`);
        } catch (e) {
            console.log('Could not parse existing data, starting fresh.');
        }
    }

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    let pageNum = 1;
    let hasMore = true;
    const finalItems = existingData.map(item => ({...item})); // Copy

    const findIndex = (url) => finalItems.findIndex(i => i.url === url);

    console.log('Starting scrape...');

    while (hasMore) {
        const url = pageNum === 1 ? BASE_URL : `${BASE_URL}page${pageNum}`;
        console.log(`Navigating to list page: ${url}`);

        if (!await safeGoto(page, url)) {
            console.error(`Failed to load list page ${pageNum} after retries. Aborting.`);
            break;
        }

        const listItems = await page.evaluate(() => {
            const items = [];
            document.querySelectorAll('.ArtworkCollection-item .ArtworkPreview').forEach(el => {
                const link = el.querySelector('.ArtworkPreview-title a');
                const artist = el.querySelector('.ArtworkPreview-artist');
                const title = el.querySelector('.ArtworkPreview-title');
                const date = el.querySelector('.ArtworkPreview-date');
                const statusEl = el.querySelector('.ArtworkPreview-status');
                
                let isView = false;
                if (statusEl) {
                     const text = statusEl.textContent.trim().toLowerCase();
                     isView = text.includes('on view') && !text.includes('not on view');
                }
                
                let listImgSrc = null;
                const nsImg = el.querySelector('noscript img');
                if (nsImg) {
                    listImgSrc = nsImg.src;
                } else {
                    const img = el.querySelector('img');
                    if (img) listImgSrc = img.src;
                }

                if (link) {
                    items.push({
                        url: link.href,
                        artist: artist ? artist.textContent.trim() : null,
                        title: title ? title.textContent.trim() : null,
                        date: date ? date.textContent.trim() : null,
                        onView: isView,
                        listImage: listImgSrc
                    });
                }
            });
            return items;
        });

        if (listItems.length === 0) {
            console.log('No items found on page. Ending.');
            hasMore = false;
            break;
        }

        console.log(`Found ${listItems.length} items on page ${pageNum}`);

        for (const item of listItems) {
            const existingIdx = findIndex(item.url);

            // Need valid image (no SVG) and valid category/type
            const hasValidImage = existingIdx >= 0 && 
                                  finalItems[existingIdx].image && 
                                  !finalItems[existingIdx].image.includes('data:image/svg');
            
            // Check essential metadata
            const hasMetadata = existingIdx >= 0 && (finalItems[existingIdx].type || finalItems[existingIdx].category || finalItems[existingIdx].medium);

            if (existingIdx >= 0 && finalItems[existingIdx].description && hasValidImage && hasMetadata) {
                // Update simple fields just in case
                finalItems[existingIdx].onView = item.onView; 
                continue;
            }

            console.log(`  Fetching details for: ${item.title} (${item.url}) ...`);
            if (!await safeGoto(page, item.url)) {
                console.error(`  Failed to load detail page for ${item.title}. Skipping.`);
                continue;
            }

            try {
                const details = await scrapeMetadata(page);
                
                let finalImage = details.image || item.listImage;
                if (finalImage && finalImage.includes('data:image/svg')) {
                    finalImage = null;
                }

                const newItem = {
                    id: item.url.split('/').filter(Boolean).pop(),
                    url: item.url,
                    title: item.title,
                    artist: item.artist,
                    date: item.date,
                    onView: item.onView,
                    image: finalImage,
                    description: details.bio,
                    dimensions: details.dimensions,
                    medium: details.medium,
                    classification: details.classification, 
                    category: details.category || details.type || null,
                    ...details 
                };

                if (existingIdx >= 0) {
                    finalItems[existingIdx] = newItem;
                } else {
                    finalItems.push(newItem);
                }

                fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalItems, null, 2));

            } catch (err) {
                console.error(`  Error processing details for ${item.title}:`, err);
            }

            await sleep(500); 
        }

        pageNum++;
        await sleep(1000);
    }

    console.log(`Scrape complete. Total items: ${finalItems.length}`);
    await browser.close();
})();
