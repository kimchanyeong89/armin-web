const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const OUTPUT_FILE = 'public/data/louisiana-test.json';
const TARGET_COUNT = 100;

(async () => {
    // Launch the browser
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });

    console.log('Navigating to guest session...');
    await page.goto('https://archive.louisiana.dk/login/guestsession.jspx?query=', {
        waitUntil: 'networkidle2',
        timeout: 60000
    });

    console.log('Waiting for content to load...');
    await page.waitForSelector('.js-itemsPerPageSelect', { timeout: 30000 });

    // Change items per page to 80 (value "20")
    console.log('Setting items per page to 80...');
    try {
        await page.select('.js-itemsPerPageSelect', '20');
        console.log('Select changed, waiting for update...');
        // Wait for reload - longer wait
        await new Promise(r => setTimeout(r, 8000));
        await page.waitForSelector('.rvs-thumbnailview-item');
    } catch (e) {
        console.error('Failed to change items per page, proceeding with default', e);
    }

    let allItems = [];
    let pageNum = 1;

    while (allItems.length < TARGET_COUNT) {
        console.log(`Scraping page ${pageNum}... (Current count: ${allItems.length})`);

        // Wait for items to be present
        await page.waitForSelector('.rvs-thumbnailview-item', { timeout: 10000 });

        // Extract items
        const newItems = await page.evaluate(() => {
            const items = [];
            const elements = document.querySelectorAll('.rvs-thumbnailview-item');
            
            elements.forEach(el => {
                const id = el.getAttribute('data-itemid');
                const titleEl = el.querySelector('.rvs-thumbnailview-assets_5farchive_2eheadline');
                const title = titleEl ? titleEl.innerText.trim() : '';
                
                const fileInfoEl = el.querySelector('.rvs-thumbnailview-_5fstandard_2e1_2etext');
                // parse file info often has format: "ID_ArtistName,Firstname.tif..."
                const fileInfo = fileInfoEl ? fileInfoEl.innerText.trim() : '';

                const imgEl = el.querySelector('img.rvs-thumbnailview-item-image');
                let imgUrl = imgEl ? imgEl.getAttribute('src') : '';
                
                // Fix relative URL
                if (imgUrl && !imgUrl.startsWith('http')) {
                    imgUrl = 'https://archive.louisiana.dk' + imgUrl;
                }

                if (id) {
                    items.push({
                        id,
                        title,
                        fileInfo,
                        image: imgUrl,
                        source: 'Louisiana Museum of Modern Art'
                    });
                }
            });
            return items;
        });

        console.log(`Found ${newItems.length} items on page ${pageNum}`);
        
        // Add new items (avoiding duplicates if any)
        for (const item of newItems) {
            if (!allItems.some(existing => existing.id === item.id)) {
                allItems.push(item);
            }
        }

        if (allItems.length >= TARGET_COUNT) break;

        // Click next page using evaluate to avoid "not clickable" errors
        console.log('Clicking next page via JS...');
        const hasNext = await page.evaluate(() => {
            const nextBtn = document.querySelector('.js-next-page');
            if (nextBtn) {
                nextBtn.click();
                return true;
            }
            return false;
        });

        if (hasNext) {
            await new Promise(r => setTimeout(r, 6000)); // Wait for content to load
            pageNum++;
        } else {
            console.log('No next page button found.');
            break;
        }
    }

    // Limit to target count
    const finalItems = allItems.slice(0, TARGET_COUNT);
    
    // Save to file
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalItems, null, 2));
    console.log(`Saved ${finalItems.length} items to ${OUTPUT_FILE}`);

    await browser.close();
})();
