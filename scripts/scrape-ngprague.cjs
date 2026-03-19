const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const OUTPUT_FILE = path.join(__dirname, '../public/data/ngprague-collection-test.json');
const BASE_URL = 'https://sbirky.ngprague.cz';
const START_URL = 'https://sbirky.ngprague.cz/en/katalog';

async function main() {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    console.log(`Navigating to ${START_URL}...`);
    await page.goto(START_URL, { waitUntil: 'domcontentloaded' });

    const allLinks = [];

    const seenLinks = new Set();

    // We need 100 items. Each page usually has 24 or so. We probably need 4-5 pages.
    let currentPage = 1;
    while (allLinks.length < 100) {
        console.log(`Scraping list page ${currentPage}...`);

        // Wait for items
        await page.waitForSelector('.item a');

        const links = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('.item a'))
                .map(a => a.getAttribute('href'))
                .filter(href => (href.includes('/dielo/') || href.includes('/dilo/')) && !href.includes('/zoom'));
        });

        console.log(`Found ${links.length} potential links on page ${currentPage}`);

        links.forEach(l => {
            if (allLinks.length < 100 && !seenLinks.has(l)) {
                seenLinks.add(l);
                allLinks.push(l);
            }
        });

        if (allLinks.length >= 100) break;

        // Next page
        currentPage++;
        const nextUrl = `${START_URL}?page=${currentPage}`;
        await page.goto(nextUrl, { waitUntil: 'domcontentloaded' });
    }

    console.log(`Collected ${allLinks.length} unique links. Starting detailed scrape...`);

    const exhibits = [];

    for (let i = 0; i < allLinks.length; i++) {
        let link = allLinks[i];
        if (!link.startsWith('http')) {
            // Check if link starts with /dielo/ or like
            // The site uses CZE:NG... sometimes relative, sometimes absolute?
            // Usually relative in href like /dielo/ID
            link = BASE_URL + (link.startsWith('/') ? link : '/' + link);
        }

        // Fix: Ensure we use the /en/ version for English metadata if possible
        // But the link might be /dielo/ID (Slovak base). We want /en/dielo/ID if supported 
        // Logic: if link is .../dielo/ID, make it .../en/dielo/ID
        if (link.includes('/dielo/') && !link.includes('/en/')) {
            link = link.replace('/dielo/', '/en/dielo/');
        }

        console.log(`[${i + 1}/${allLinks.length}] Scraping ${link}...`);

        try {
            await page.goto(link, { waitUntil: 'domcontentloaded' });

            const data = await page.evaluate((url) => {
                const getText = (selector) => {
                    const el = document.querySelector(selector);
                    return el ? el.innerText.trim() : null;
                };

                const title = getText('h1') || getText('h2.title'); // Title is usually h1 or h2

                // Artist is often in h2 or .author class if separate
                // Structure in Webumenia detail: 
                // <h2><a href="...">Artist Name</a></h2>
                const artistEl = document.querySelector('h2 a') || document.querySelector('.author a');
                const artist = artistEl ? artistEl.innerText.trim() : 'Unknown';

                // Image
                // Try deep zoom viewer first? No, simple image is easier for now.
                // .img-responsive or header image
                let imageUrl = '';
                const imgEl = document.querySelector('.img-responsive') || document.querySelector('.carousel-inner img');
                if (imgEl) imageUrl = imgEl.src;

                // If it uses deep zoom (OpenSeadragon), obtaining the full image is harder. 
                // Usually there is a preview image.

                // Metadata Table
                const metadata = {};
                const rows = document.querySelectorAll('table tr');
                rows.forEach(tr => {
                    const labelTd = tr.querySelector('td.atribut');
                    const valueTd = tr.querySelector('td:not(.atribut)');
                    if (labelTd && valueTd) {
                        let label = labelTd.innerText.replace(':', '').trim().toLowerCase();
                        let value = valueTd.innerText.trim();
                        metadata[label] = value;
                    }
                });

                // Description
                const desc = getText('.description') || ''; // hypothetical selector

                return {
                    title,
                    artist,
                    imageUrl,
                    metadata,
                    source: url,
                    desc
                };
            }, link);

            if (data.title) {
                // Map to standard fields
                exhibits.push({
                    id: `ngprague-${(data.metadata['inventory number'] || '').replace(/[^a-zA-Z0-9]/g, '-') || Math.random().toString(36).substr(2, 9)}`,
                    title: data.title,
                    artist: data.artist,
                    year: data.metadata['dating'] || '',
                    medium: data.metadata['material'] || '',
                    technique: data.metadata['technique'] || '',
                    dimensions: data.metadata['measurements'] || data.metadata['dimensions'] || '',
                    image: data.imageUrl,
                    source: data.source,
                    museum: "National Gallery Prague",
                    metadata: data.metadata
                });
            }

        } catch (e) {
            console.error(`Failed to scrape ${link}:`, e.message);
        }
    }

    // Save to file
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(exhibits, null, 2));
    console.log(`Saved ${exhibits.length} items to ${OUTPUT_FILE}`);

    await browser.close();
}

main();
