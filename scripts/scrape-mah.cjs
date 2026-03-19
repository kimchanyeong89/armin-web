const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const TARGET_COUNT = 100; // User Request
const OUTPUT_FILE = path.resolve(__dirname, '../public/data/mah-collection.json');
const START_URL = 'https://www.mahmah.ch/collection/recherche?f%5B0%5D=collections%3A57484';

async function scrape() {
    console.log('Launching browser for MAH...');
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000 });

    try {
        console.log('Navigating to Homepage first to set cookies...');
        await page.goto('https://www.mahmah.ch/', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await new Promise(r => setTimeout(r, 2000));

        console.log('Navigating to search page...');
        await page.goto(START_URL, { waitUntil: 'networkidle2', timeout: 60000 });
        
        // Wait for Masonry layout
        await page.waitForSelector('.masonry-item', { timeout: 10000 });

        let itemLinks = [];
        let previousHeight = 0;

        while (itemLinks.length < TARGET_COUNT) {
            // Extract links
            const newLinks = await page.evaluate(() => {
                const anchors = Array.from(document.querySelectorAll('.masonry-item h3 a, article h2 a'));
                return anchors.map(a => a.href);
            });
            
            // Deduplicate
            const uniqueLinks = [...new Set(newLinks)];
            console.log(`Found ${uniqueLinks.length} items so far.`);
            itemLinks = uniqueLinks;

            if (itemLinks.length >= TARGET_COUNT) break;

            // Load More
            const loadMoreButton = await page.$('.mah-button--load-more');
            if (loadMoreButton) {
                console.log('Clicking "Load More"...');
                try {
                    await loadMoreButton.click();
                    // Wait for new items - check count or network
                    await new Promise(r => setTimeout(r, 3000)); // Simple wait for AJAX
                    // verify if more items loaded?
                } catch (e) {
                    console.log('Error clicking load more:', e.message);
                    break;
                }
            } else {
                console.log('No "Load More" button found.');
                break;
            }
        }

        // Limit to target
        const targetLinks = itemLinks.slice(0, TARGET_COUNT);
        console.log(`Scraping details for ${targetLinks.length} items...`);

        const collectedData = [];

        // Process sequentially to avoid heavy load if site is fragile
        for (const [index, link] of targetLinks.entries()) {
            console.log(`Processing ${index + 1}/${targetLinks.length}: ${link}`);
            const itemPage = await browser.newPage();
            
            // Block images/fonts on detail page for speed
            await itemPage.setRequestInterception(true);
            itemPage.on('request', (req) => {
                 if (['image', 'media', 'font'].includes(req.resourceType())) {
                     req.abort();
                 } else {
                     req.continue();
                 }
            });

            try {
                await itemPage.goto(link, { waitUntil: 'domcontentloaded' });
                
                const data = await itemPage.evaluate(() => {
                    // Extract from JSON
                    let iiifUrl = '';
                    let imgTitle = '';
                    let imgCopyright = '';
                    
                    const settings = document.querySelector('[data-drupal-selector="drupal-settings-json"]');
                    if (settings) {
                        try {
                            const json = JSON.parse(settings.textContent);
                            if (json.updatedMahHdImage && json.updatedMahHdImage.imageUrl) {
                                // New format seen in some recent drupal sites?
                                // CHECK PREVIOUS CURL: mahHdImage -> openSeaDragon_ID -> @id
                                // We need to handle dynamic keys
                            }
                            if (json.mahHdImage) {
                                const keys = Object.keys(json.mahHdImage);
                                const osdKey = keys.find(k => k.startsWith('openSeaDragon'));
                                if (osdKey && json.mahHdImage[osdKey]) {
                                    const id = json.mahHdImage[osdKey]['@id'];
                                    // Construct High Res URL
                                    // @id is like .../iipsrv.fcgi?IIIF=...
                                    // We append /full/full/0/default.jpg
                                    if (id) iiifUrl = `${id}/full/full/0/default.jpg`;
                                }
                            }
                        } catch(e) {}
                    }

                    // Metadata from HTML
                    const title = document.querySelector('h1 span')?.innerText.trim() || document.querySelector('h1')?.innerText.trim();
                    // Description list
                    const getMeta = (label) => {
                        // This logic heavily depends on DOM structure
                        // MAH uses <div class="field ..."><div class="field__label">...</div><div class="field__item">...</div></div>
                        const labels = Array.from(document.querySelectorAll('.field__label'));
                        const found = labels.find(el => el.innerText.includes(label));
                        if (found && found.nextElementSibling) {
                            return found.nextElementSibling.innerText.trim();
                        }
                        return '';
                    };

                    const artist = getMeta('Auteur') || getMeta('Artiste'); // check exact label later
                    const date = getMeta('Date');
                    const dimensions = getMeta('Dimensions') || getMeta('Mesures');
                    const medium = getMeta('Matériaux') || getMeta('Technique');
                    const inventoryNumber = getMeta('Numéro d\'inventaire');

                    return {
                        title: title || '',
                        artist,
                        date,
                        medium,
                        dimensions,
                        inventoryNumber,
                        image: iiifUrl,
                        url: window.location.href
                    };
                });

                collectedData.push(data);

            } catch (err) {
                console.error(`Failed to scrape ${link}:`, err.message);
            } finally {
                await itemPage.close();
            }
        }

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collectedData, null, 2));
        console.log('Done. Saved to', OUTPUT_FILE);

    } catch (e) {
        console.error('Fatal Error:', e);
    } finally {
        await browser.close();
    }
}

scrape();
