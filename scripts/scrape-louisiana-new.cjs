const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

async function scrape() {
    console.log('Launching browser...');
    const browser = await puppeteer.launch({
        headless: true,
        defaultViewport: { width: 1440, height: 1200 } // Taller viewport
    });
    const page = await browser.newPage();
    const url = 'https://archive.louisiana.dk/main/thumbnailview/Categories=269';
    
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    const currentUrl = page.url();
    const uuidRegex = /(?:RecordItemCollection-|v=)(?:%7B|%7b|{)([a-f0-9-]{36})(?:%7D|%7d|})/;
    const match = currentUrl.match(uuidRegex);
    let viewUuid = match && match[1] ? match[1] : null;
    
    if (!viewUuid) {
        try {
            await page.waitForSelector('.rvs-thumbnailview-item-image', { timeout: 10000 });
            const src = await page.$eval('.rvs-thumbnailview-item-image', img => img.src);
            const matches = src.match(/v=(?:%7B|%7b|{)([a-f0-9-]{36})(?:%7D|%7d|})/);
            if (matches) viewUuid = matches[1];
        } catch(e) {}
    }

    if (!viewUuid) {
        console.error('No UUID found.');
        await browser.close();
        return;
    }
    console.log('Using View UUID:', viewUuid);

    const scrollSelectors = [
        '.maincollection__records',
        '.records__items',
        '.itemcollection__items',
        'body'
    ];

    const allItems = new Map();
    let noNewItemsCount = 0;
    
    // Aggressive scrolling loop
    for (let i = 0; i < 50; i++) { 
        console.log(`Scroll pass ${i+1}...`);
        
        const newItems = await page.evaluate((uuid) => {
            const items = [];
            document.querySelectorAll('.rvs-thumbnailview-item').forEach(el => {
                const id = el.getAttribute('data-itemid');
                const title = el.querySelector('.rvs-thumbnailview-assets_5farchive_2eheadline')?.innerText.trim() || '';
                const fileInfo = el.querySelector('.rvs-thumbnailview-_5fstandard_2e1_2etext')?.innerText.trim() || '';
                
                const imgUrl = `https://archive.louisiana.dk/I/?v=%7B${uuid}%7D&i=${id}&b=2000&f=asset&bm=1`;
                
                items.push({
                    id,
                    title,
                    metadata: fileInfo,
                    image: imgUrl
                });
            });
            return items;
        }, viewUuid);

        let added = 0;
        newItems.forEach(item => {
            if (!allItems.has(item.id)) {
                allItems.set(item.id, item);
                added++;
            }
        });

        console.log(`Found ${newItems.length} visible. Added ${added}. Total unique: ${allItems.size}`);

        if (added === 0) noNewItemsCount++;
        else noNewItemsCount = 0;

        // Stop if we have significantly enough items or stuck for too long
        if (allItems.size >= 1000) break;
        if (noNewItemsCount > 8) {
            console.log('No new items for 8 scrolls. Stopping.');
            break;
        }

        // Scroll
        await page.evaluate((selectors) => {
            selectors.forEach(sel => {
                const el = document.querySelector(sel);
                if (el) el.scrollTop += 800;
            });
            window.scrollBy(0, 800);
        }, scrollSelectors);

        await new Promise(r => setTimeout(r, 3000)); // Wait longer for load
    }

    const results = Array.from(allItems.values());
    console.log(`Saving ${results.length} items to public/data/louisiana-new.json`);
    fs.writeFileSync('public/data/louisiana-new.json', JSON.stringify(results, null, 2));
    
    await browser.close();
}
scrape();
