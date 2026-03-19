const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const OUTPUT_FILE = path.join(__dirname, '../public/data/ngprague-collection.json');
const BASE_URL = 'https://sbirky.ngprague.cz';
const START_URL = 'https://sbirky.ngprague.cz/en/katalog';

async function main() {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // Resume logic: Load existing links or scrape them
    let allLinks = [];
    const seenLinks = new Set(); // Keep seenLinks for efficient checking during initial scrape
    if (fs.existsSync('ngprague-links.json')) {
        console.log('Found existing ngprague-links.json. Loading...');
        allLinks = JSON.parse(fs.readFileSync('ngprague-links.json', 'utf8'));
        allLinks.forEach(link => seenLinks.add(link)); // Populate seenLinks from loaded links
    } else {
        console.log(`Navigating to ${START_URL}...`);
        // Initial navigation to setup
        await page.goto(START_URL, { waitUntil: 'domcontentloaded' });

        // Iterate pages likely up to ~220 based on previous checks
        let currentPage = 1;
        let hasNextPage = true;

        // Collect all links first
        while (hasNextPage) {
            const pageUrl = `${START_URL}?page=${currentPage}`;
            console.log(`Scraping listing page ${currentPage}...`);

            try {
                await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

                // Check if items exist
                const linkSelector = '.item a';
                try {
                    await page.waitForSelector(linkSelector, { timeout: 5000 });
                } catch (e) {
                    console.log(`No items found on page ${currentPage}. Ending listing scrape.`);
                    break;
                }

                const links = await page.evaluate(() => {
                    return Array.from(document.querySelectorAll('.item a'))
                        .map(a => a.getAttribute('href'))
                        .filter(href => (href.includes('/dielo/') || href.includes('/dilo/')) && !href.includes('/zoom'));
                });

                if (links.length === 0) {
                    console.log('No links found on this page.');
                    break;
                }

                let newLinks = 0;
                links.forEach(l => {
                    if (!seenLinks.has(l)) {
                        seenLinks.add(l);
                        allLinks.push(l);
                        newLinks++;
                    }
                });

                console.log(`Found ${newLinks} new links on page ${currentPage}. Total: ${allLinks.length}`);

                // Safety break or check for "Next" button? 
                // The pagination usually has a "next" link.
                const hasNext = await page.$('.pagination a[rel="next"]');
                if (!hasNext) {
                    console.log('No "Next" button found. Finished listing.');
                    break;
                }

                currentPage++;

            } catch (e) {
                console.error(`Error on page ${currentPage}: ${e.message}`);
                // Retry once?
                break;
            }
        }
        fs.writeFileSync('ngprague-links.json', JSON.stringify(allLinks, null, 2));
    }

    console.log(`Collected ${allLinks.length} unique links. Total items to process: ${allLinks.length}`);

    // Load existing collection to resume
    let exhibits = [];
    const scrapedSources = new Set();

    if (fs.existsSync(OUTPUT_FILE)) {
        try {
            exhibits = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
            exhibits.forEach(ex => {
                if (ex.source) scrapedSources.add(ex.source);
            });
            console.log(`Resuming: Loaded ${exhibits.length} existing items.`);
        } catch (e) {
            console.error('Error reading existing output file:', e);
        }
    }

    // Process details
    // We can use a simpler concurrency model or just sequential to be safe. 
    // Let's do batches for speed but safe politeness.

    for (let i = 0; i < allLinks.length; i++) {
        let link = allLinks[i];
        if (!link.startsWith('http')) {
            link = BASE_URL + (link.startsWith('/') ? link : '/' + link);
        }

        // Ensure /en/
        if (link.includes('/dielo/') && !link.includes('/en/')) {
            link = link.replace('/dielo/', '/en/dielo/');
        }

        // Check if already scraped
        if (scrapedSources.has(link)) {
            // console.log(`[${i + 1}/${allLinks.length}] Skipping ${link} (already scraped)`);
            continue;
        }

        console.log(`[${i + 1}/${allLinks.length}] Scraping ${link}...`);

        try {
            await page.goto(link, { waitUntil: 'domcontentloaded' });

            const data = await page.evaluate((url) => {
                const getText = (selector) => {
                    const el = document.querySelector(selector);
                    return el ? el.innerText.trim() : null;
                };

                const title = getText('h1') || getText('h2.title');
                const artistEl = document.querySelector('h2 a') || document.querySelector('.author a');
                const artist = artistEl ? artistEl.innerText.trim() : 'Unknown';

                let imageUrl = '';
                // Try to find the highest res preview image
                // The site uses data-src usually for lazy load.
                const imgEl = document.querySelector('.img-responsive') || document.querySelector('.carousel-inner img');
                if (imgEl) {
                    imageUrl = imgEl.src;
                    // Check if there is a bigger one in data attributes
                    if (imgEl.dataset.src) imageUrl = imgEl.dataset.src;
                }

                // Metadata
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

                const desc = getText('.description') || '';

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
                // User Request: Medium should be Technique.
                let medium = data.metadata['technique'] || data.metadata['material'] || '';

                // If technique exists, use it. (Do not combine with material)
                if (data.metadata['technique']) {
                    medium = data.metadata['technique'];
                }

                exhibits.push({
                    id: `ngprague-${(data.metadata['inventory number'] || '').replace(/[^a-zA-Z0-9]/g, '-') || Math.random().toString(36).substr(2, 9)}`,
                    title: data.title,
                    artist: data.artist,
                    year: data.metadata['dating'] || data.metadata['date'] || '',
                    medium: medium,
                    date: data.metadata['dating'] || data.metadata['date'] || '',
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

        // Save progress every 50 items
        if ((i + 1) % 50 === 0) {
            fs.writeFileSync(OUTPUT_FILE, JSON.stringify(exhibits, null, 2));
            console.log(`Checkpoint: Saved ${exhibits.length} items.`);
        }
    }

    // Final Save
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(exhibits, null, 2));
    console.log(`Done! Saved ${exhibits.length} items to ${OUTPUT_FILE}`);

    await browser.close();
}

main();
