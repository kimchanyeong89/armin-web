const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const TARGET_COUNT = 100;
const OUTPUT_FILE = path.resolve(__dirname, '../public/data/mah-collection.json');
const SEARCH_BASE_URL = 'https://www.mahmah.ch/collection/recherche?f%5B0%5D=collections%3A57484';

// Helper to download image
async function downloadImage(url, filepath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(filepath);
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download image: ${response.statusCode}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(filepath, () => {});
            reject(err);
        });
    });
}

async function scrape() {
    console.log('Starting MAH Paintings Scraper...');
    
    // Clear existing file if we want a fresh start, or read it to append?
    // User asked to "do 100 again", implies a fresh set or ensuring we have 100 good ones.
    // I'll start fresh to guarantee they are all paintings.
    let collectedData = [];
    
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    // Block images/fonts on the list page to speed it up
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        if (['image', 'media', 'font'].includes(req.resourceType())) {
            req.abort();
        } else {
            req.continue();
        }
    });

    try {
        const collectedUrls = [];
        let pageIndex = 0;

        // Step 1: Collect URLs from Search Results
        while (collectedUrls.length < TARGET_COUNT) {
            const listUrl = `${SEARCH_BASE_URL}&page=${pageIndex}`;
            console.log(`Fetching Search Page ${pageIndex}: ${listUrl}`);
            
            await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

            const newUrls = await page.evaluate(() => {
                const settings = document.querySelector('[data-drupal-selector="drupal-settings-json"]');
                if (!settings) return [];
                try {
                    const json = JSON.parse(settings.textContent);
                    if (json.artwork_navigator && json.artwork_navigator.search_results) {
                        // The search_results usually contain: { id, title, url }
                        // The url is absolute or relative? The JSON example showed absolute.
                        return json.artwork_navigator.search_results.map(item => item.url);
                    }
                } catch (e) {
                    return [];
                }
                return [];
            });

            console.log(`Found ${newUrls.length} items on page ${pageIndex}`);
            
            if (newUrls.length === 0) {
                console.log('No more items found. Create debug file and stop.');
                fs.writeFileSync('debug-mah-scraper.html', await page.content());
                break;
            }

            for (const url of newUrls) {
                // Ensure unique
                if (!collectedUrls.includes(url)) {
                    collectedUrls.push(url);
                }
                if (collectedUrls.length >= TARGET_COUNT) break;
            }

            pageIndex++;
        }

        console.log(`Collected ${collectedUrls.length} URLs to process.`);

        // Step 2: process details
        for (let i = 0; i < collectedUrls.length; i++) {
            const url = collectedUrls[i];
            console.log(`[${i + 1}/${collectedUrls.length}] Processing: ${url}`);
            
            try {
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                
                const itemData = await page.evaluate((currentUrl) => {
                    const getText = (sel) => {
                        const el = document.querySelector(sel);
                        return el ? el.innerText.trim() : '';
                    };
                    
                    const getMetaContent = (name) => {
                        const el = document.querySelector(`meta[name="${name}"]`);
                        return el ? el.getAttribute('content') : '';
                    };

                    // JSON-LD Extraction
                    let ldData = {};
                    try {
                        const ldScript = document.querySelector('script[type="application/ld+json"]');
                        if (ldScript) {
                            const json = JSON.parse(ldScript.textContent);
                            const graph = json['@graph'] || (Array.isArray(json) ? json : [json]);
                            const creativeWork = graph.find(i => i['@type'] === 'CreativeWork');
                            if (creativeWork) {
                                ldData = creativeWork;
                            }
                        }
                    } catch (e) {
                        console.log('JSON-LD parse error', e); 
                    }

                    const title = ldData.name || getText('h1.collections-page-title span') || getText('h1');
                    
                    // Metadata extraction based on common Drupal field classes
                    let artist = '';
                    if (ldData.author && ldData.author[0] && ldData.author[0].name) {
                        artist = ldData.author[0].name;
                    } else {
                        artist = getText('.collections-page-meta .author') || 
                                 getText('.field--name-field-n-main-author');
                    }
                    
                    const date = getText('.collections-page-meta .date .field--name-field-ph-date-display') || 
                                 getText('.field--name-field-n-main-dates');
                                 
                    const medium = ldData.material || getText('.field--name-field-n-main-material-techniques');
                    
                    let dimensions = '';
                    if (ldData.size) {
                        dimensions = Array.isArray(ldData.size) ? ldData.size.join('; ') : ldData.size;
                    } else {
                        dimensions = getText('.field--name-field-n-main-dimensions');
                    }

                    const inventoryNumber = getText('.field--name-field-n-main-inventory-number') || getText('.field--name-field-n-inventory-number');
                    // Clean up duplicate labels in inventory number if present "NUMÉRO D'INVENTAIRE\n1234"
                    const cleanId = inventoryNumber ? inventoryNumber.replace(/^NUMÉRO D'INVENTAIRE\s*/i, '').trim() : `mah-${Math.random().toString(36).substr(2, 9)}`;

                    const creditLine = getText('.field--name-field-acquisition');
                    
                    // Dynamic object type exctraction
                    let objType = 'Painting'; // Default fallback
                    let rawType = getText('.field--name-field-n-artwork-domain');
                    if (rawType) {
                        // Clean up "Collection(s) \n Peinture"
                        // Also some might be "Arts appliqués", "Dessin", etc.
                        const typeText = rawType.replace(/^Collection\(s\)\s*/i, '').trim();
                        // Map French to standard English types if needed, or keep original
                        const typeMap = {
                            'Peinture': 'Painting',
                            'Dessin': 'Drawing',
                            'Sculpture': 'Sculpture',
                            'Arts appliqués': 'Applied Arts',
                            'Archéologie': 'Archaeology'
                        };
                        objType = typeMap[typeText] || typeText;
                    }
                    
                    // Fallback to JSON-LD if needed, though usually not specific enough there
                    
                    // IIIF Image extraction
                    let imageUrl = '';
                    const settings = document.querySelector('[data-drupal-selector="drupal-settings-json"]');
                    if (settings) {
                        try {
                            const json = JSON.parse(settings.textContent);
                            if (json.mahHdImage) {
                                const keys = Object.keys(json.mahHdImage);
                                const osdKey = keys.find(k => k.startsWith('openSeaDragon'));
                                if (osdKey && json.mahHdImage[osdKey]) {
                                    const id = json.mahHdImage[osdKey]['@id'];
                                    if (id) imageUrl = `${id}/full/full/0/default.jpg`;
                                }
                            }
                        } catch(e) {}
                    }
                    
                    // Fallback image
                    if (!imageUrl) {
                        const imgEl = document.querySelector('.field--name-field-n-main-hd-picture img');
                        if (imgEl) imageUrl = imgEl.src;
                    }

                    return {
                        id: cleanId,
                        title,
                        artist,
                        date,
                        medium,
                        dimensions,
                        creditLine,
                        classification: objType,
                        imageUrl,
                        source: currentUrl,
                        objType: objType
                    };
                }, url);

                if (itemData.title && itemData.imageUrl) {
                    // Download image
                    const filename = `mah-${itemData.id.replace(/[^a-zA-Z0-9]/g, '_')}.jpg`;
                    const localImagePath = `/images/mah/${filename}`;
                    const absoluteImagePath = path.join(__dirname, '../public', localImagePath);
                    
                    // Ensure dir exists
                    const imageDir = path.dirname(absoluteImagePath);
                    if (!fs.existsSync(imageDir)) fs.mkdirSync(imageDir, { recursive: true });

                    try {
                        await downloadImage(itemData.imageUrl, absoluteImagePath);
                        itemData.image = localImagePath;
                        itemData.collection = "Musée d'Art et d'Histoire, Genève";
                        
                        collectedData.push(itemData);
                        console.log(`  > Saved: ${itemData.title}`);
                    } catch (err) {
                        console.error(`  > Error downloading image: ${err.message}`);
                    }
                } else {
                    console.log('  > Skipped: Missing title or image');
                }

            } catch (err) {
                console.error(`  > Error processing ${url}:`, err.message);
            }
            
            // Periodically save
            if (collectedData.length % 10 === 0) {
                fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collectedData, null, 2));
            }
        }

    } catch (error) {
        console.error('Scraping failed:', error);
    } finally {
        await browser.close();
        // Final save
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collectedData, null, 2));
        console.log(`Done. Saved ${collectedData.length} items to ${OUTPUT_FILE}`);
    }
}

scrape();
