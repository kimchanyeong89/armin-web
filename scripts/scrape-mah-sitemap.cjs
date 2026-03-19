const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TARGET_COUNT = 100;
const OUTPUT_FILE = path.resolve(__dirname, '../public/data/mah-collection.json');
const SITEMAP_URL = 'https://www.mahmah.ch/sitemap.xml?page=1';

async function scrape() {
    let collectedData = [];
    if (fs.existsSync(OUTPUT_FILE)) {
        try {
            collectedData = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
            console.log(`Loaded ${collectedData.length} existing items.`);
        } catch (e) {
            console.log('Error reading existing file, starting fresh.');
        }
    }

    const collectedUrls = new Set(collectedData.map(d => d.source));

    console.log('Fetching Sitemap...');
    try {
        const xml = execSync(`curl -L "${SITEMAP_URL}"`, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
        const matches = xml.match(/<loc>(https:\/\/www\.mahmah\.ch\/collection\/oeuvres\/[^<]+)<\/loc>/g);
        
        if (!matches || matches.length === 0) {
            console.error('No object URLs found in sitemap page 1.');
            return;
        }

        const links = matches.map(m => m.replace('<loc>', '').replace('</loc>', ''));
        console.log(`Found ${links.length} object URLs in sitemap.`);
        
        // Filter out existing
        const newLinks = links.filter(l => !collectedUrls.has(l));
        const targetLinks = newLinks.slice(0, TARGET_COUNT - collectedData.length);
        
        if (targetLinks.length === 0) {
            console.log('Target count reached with existing data.');
            return;
        }

        console.log(`Scraping ${targetLinks.length} new items...`);

        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        for (const [index, link] of targetLinks.entries()) {
            console.log(`[${index + 1}/${targetLinks.length}] Scraping: ${link}`);
            // Small delay to prevent browser overload
            await new Promise(r => setTimeout(r, 1000));

            let page;
            try {
                page = await browser.newPage();
                await page.setRequestInterception(true);
                page.on('request', (req) => {
                     // Allow scripts, sometimes needed for JSON hydration, but block media
                     if (['image', 'media', 'font'].includes(req.resourceType())) {
                         req.abort();
                     } else {
                         req.continue();
                     }
                });

                const response = await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 30000 });
                if (response.status() !== 200) {
                    console.log(`Skipping ${link} (Status ${response.status()})`);
                    await page.close();
                    continue;
                }

                const data = await page.evaluate(() => {
                    let iiifUrl = '';
                    const settings = document.querySelector('[data-drupal-selector="drupal-settings-json"]');
                    if (settings) {
                        try {
                            const json = JSON.parse(settings.textContent);
                            if (json.mahHdImage) {
                                const keys = Object.keys(json.mahHdImage);
                                const osdKey = keys.find(k => k.startsWith('openSeaDragon'));
                                if (osdKey && json.mahHdImage[osdKey]) {
                                    const id = json.mahHdImage[osdKey]['@id'];
                                    if (id) iiifUrl = `${id}/full/full/0/default.jpg`;
                                }
                            }
                        } catch(e) {}
                    }

                    const getText = (sel) => {
                        const el = document.querySelector(sel);
                        return el ? el.innerText.trim() : '';
                    };

                    const getArray = (sel) => {
                        return Array.from(document.querySelectorAll(sel)).map(e => e.innerText.trim()).filter(Boolean);
                    };

                    const title = getText('h1 span') || getText('h1.collections-page-title span') || getText('h1');
                    
                    let artist = getText('.field--name-field-n-author .mah-author a');
                    if (!artist) {
                        try {
                            const ld = JSON.parse(document.querySelector('script[type="application/ld+json"]')?.textContent || '{}');
                            const graph = ld['@graph'] || [];
                            const work = graph.find(x => x['@type'] === 'CreativeWork');
                            if (work && work.author && work.author[0]) artist = work.author[0].name;
                        } catch(e){}
                    }

                    const date = getText('.field--name-field-n-main-dates .field--name-field-ph-date-display');
                    const medium = getText('.field--name-field-n-materials .field--item');
                    const dimensions = getArray('.field--name-field-n-dimensions .field--item').join('; ');
                    const inventoryNumber = getText('.field--name-field-n-inventory-number .field--item');
                    const objectType = getText('.field--name-field-n-artwork-domain .field--item');

                    const getFieldLabel = (labelPart) => {
                        const labels = Array.from(document.querySelectorAll('.field__label, .field--label'));
                        const found = labels.find(el => el.innerText.toLowerCase().includes(labelPart.toLowerCase()));
                        if (found) {
                            if (found.parentElement) {
                                const items = found.parentElement.querySelector('.field--items, .field--item');
                                if (items) return items.innerText.trim();
                            }
                            if (found.nextElementSibling) return found.nextElementSibling.innerText.trim();
                        }
                        return '';
                    };

                    return {
                        title,
                        artist: artist || getFieldLabel('Auteur') || getFieldLabel('Artist'),
                        date: date || getFieldLabel('Datation') || getFieldLabel('Date'),
                        medium: medium || getFieldLabel('Matériau') || getFieldLabel('Technique'),
                        dimensions: dimensions || getFieldLabel('Dimension'),
                        inventoryNumber: inventoryNumber || getFieldLabel('Inventaire'),
                        objectType: objectType,
                        image: iiifUrl,
                        source: window.location.href
                    };
                });
                
                if (data.image) console.log(`  -> Found IIIF`);
                
                collectedData.push(data);
                
                // Incremental Save
                if (collectedData.length % 5 === 0) {
                    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collectedData, null, 2));
                    console.log('  (Saved progress)');
                }

            } catch (err) {
                console.error(`  -> Error: ${err.message}`);
            } finally {
                if (page) await page.close().catch(() => {});
            }
        }

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collectedData, null, 2));
        console.log(`Done. Total ${collectedData.length} items.`);
        await browser.close();

    } catch (e) {
        console.error('Fatal Error:', e);
    }
}

scrape();
