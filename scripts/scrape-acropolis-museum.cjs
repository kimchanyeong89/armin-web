const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const OUTPUT_FILE = path.join(__dirname, '../public/data/acropolis-museum-collection.json');
const BASE_URL = 'https://www.theacropolismuseum.gr';
const START_URL = 'https://www.theacropolismuseum.gr/en/exhibit-highlights';

async function main() {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // Set viewport to a reasonable size
    await page.setViewport({ width: 1280, height: 800 });

    // List of URLs to scrape for listing
    const listingUrls = [
        'https://www.theacropolismuseum.gr/en/exhibit-highlights?items_per_page=90',
        'https://www.theacropolismuseum.gr/en/exhibit-highlights?page=0',
        'https://www.theacropolismuseum.gr/en/exhibit-highlights?page=1',
        'https://www.theacropolismuseum.gr/en/exhibit-highlights?page=2'
    ];

    const exhibitLinks = new Set();

    // Attempt 1: Try the "Show 90" URL parameter first
    console.log('Trying to load 90 items via query param...');
    await page.goto(listingUrls[0], { waitUntil: 'domcontentloaded' });
    const links90 = await page.evaluate(() => Array.from(document.querySelectorAll('a.erevna')).map(a => a.getAttribute('href')));
    console.log(`Found ${links90.length} items on 90-view.`);

    if (links90.length >= 80) {
        links90.forEach(l => exhibitLinks.add(l));
    } else {
        // Fallback: iterate pages
        console.log('Fewer than 90 items found. iterating pages...');
        for (let p = 0; p <= 3; p++) {
            const pUrl = `https://www.theacropolismuseum.gr/en/exhibit-highlights?page=${p}`;
            console.log(`Navigating to ${pUrl}`);
            await page.goto(pUrl, { waitUntil: 'domcontentloaded' });
            const links = await page.evaluate(() => Array.from(document.querySelectorAll('a.erevna')).map(a => a.getAttribute('href')));
            console.log(`Found ${links.length} items on page ${p}`);
            if (links.length === 0) break;
            links.forEach(l => exhibitLinks.add(l));
        }
    }

    const uniqueLinks = Array.from(exhibitLinks);
    console.log(`Total unique exhibits found: ${uniqueLinks.length}`);

    const exhibits = [];

    for (let i = 0; i < uniqueLinks.length; i++) {
        const link = uniqueLinks[i];
        const fullUrl = link.startsWith('http') ? link : BASE_URL + link;

        console.log(`[${i + 1}/${uniqueLinks.length}] Scraping ${fullUrl}...`);

        try {
            // Use networkidle2 to ensure content is fully loaded
            await page.goto(fullUrl, { waitUntil: 'networkidle2', timeout: 45000 });

            const data = await page.evaluate((url) => {
                const getText = (selector) => {
                    const el = document.querySelector(selector);
                    return el ? el.innerText.trim() : null;
                };

                const title = getText('h2.title.semibold') || getText('.node__title') || getText('h1');

                let description = getText('.field--name-field-description .field__item') ||
                    getText('.node__content .field--type-text-with-summary') ||
                    getText('.field--name-body') ||
                    getText('#menu1');

                // Image
                let imageUrl = null;
                const mainImg = document.querySelector('.field--name-field-image img') ||
                    document.querySelector('.main-image img') ||
                    document.querySelector('.exhibit-image img');

                if (mainImg) imageUrl = mainImg.src;
                else {
                    // Fallback to lightgallery thumbnail if main image missing
                    const thumb = document.querySelector('.lg-thumb-item img');
                    if (thumb) imageUrl = thumb.src;
                }

                // Metadata via col-lg structures
                const metadata = {};
                // Look for bold labels in col-lg-5
                const labelContainers = document.querySelectorAll('.col-lg-5 .bold, .col-lg-2 .bold');

                labelContainers.forEach(container => {
                    const labelText = container.innerText.trim();
                    const col5 = container.closest('.col-lg-5') || container.closest('.col-lg-2');
                    if (col5) {
                        const colNext = col5.nextElementSibling;
                        if (colNext && (colNext.classList.contains('col-lg-7') || colNext.classList.contains('col-lg-10'))) {
                            metadata[labelText] = colNext.innerText.trim();
                        }
                    }
                });

                return {
                    title,
                    description,
                    imageUrl,
                    metadata,
                    source: url
                };
            }, fullUrl);

            // Post-processing
            if (data.title) {
                // Better ID generation handling non-ASCII
                let inv = (data.metadata['Inventory number'] || '').replace(/[^0-9]/g, '');
                if (!inv) inv = Math.random().toString(36).substr(2, 9);

                exhibits.push({
                    id: `acropolis-${inv}`,
                    title: data.title,
                    artist: data.metadata['Artist'] || 'Unknown',
                    year: data.metadata['Date'] || data.metadata['Period'] || data.metadata['Creation Date'] || '',
                    description: data.description || '',
                    image: data.imageUrl || '',
                    source: data.source,
                    museum: "Acropolis Museum",
                    metadata: data.metadata
                });
            }

        } catch (e) {
            console.error(`Failed to scrape ${fullUrl}:`, e.message);
        }

        // Politeness delay
        await new Promise(r => setTimeout(r, 1000));
    }

    // Save to file
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(exhibits, null, 2));
    console.log(`Saved ${exhibits.length} items to ${OUTPUT_FILE}`);

    await browser.close();
}

main();
