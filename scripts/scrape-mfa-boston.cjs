const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const OUTPUT_FILE = path.join(__dirname, '../public/data/mfa-boston.json');
const TARGET_URL = 'https://collections.mfa.org/search/Objects/classifications%3APaintings%3Bonview%3Atrue%3BimageExistence%3Atrue/*';

async function main() {
    console.log(`Starting scraper for MFA Boston...`);
    console.log(`Target: ${TARGET_URL}`);

    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--window-size=1600,1000'
        ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1000 });

    const results = [];
    let currentPage = 1;
    let hasNext = true;

    try {
        console.log(`Navigating to page ${currentPage}...`);
        await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });

        // WAF Check
        await handleWAF(page);

        // Scrape loop
        while (hasNext) {
            console.log(`Scraping page ${currentPage}...`);

            // Wait for grid
            try {
                await page.waitForSelector('.emuseum-objects-grid-item, .item-container, .em-result-item, .grid-item', { timeout: 10000 });
            } catch (e) {
                console.log('Grid selector not found immediately. Checking content...');
                const content = await page.content();
                if (content.includes('No results')) {
                    console.log('No results found.');
                    break;
                }
                // Dump content for debug
                const debugPath = path.join(__dirname, 'debug-mfa-fail.html');
                fs.writeFileSync(debugPath, content);
                console.log(`Saved debug HTML to ${debugPath}`);
                
                // If WAF detected inside here
                if (content.includes('Verification') || content.includes('challenge')) {
                    console.error('Blocked by WAF. Please solve CAPTCHA in non-headless mode or check IP reputation.');
                    // In a real run, we might want to pause here
                    if (process.env.PAUSE_ON_BLOCK) {
                        console.log('PAUSE_ON_BLOCK is set. Pausing for manual intervention...');
                        await new Promise(r => setTimeout(r, 60000 * 5)); 
                    }
                    break;
                }
            }

            // Extract items
            const newItems = await page.evaluate(() => {
                const items = [];
                // Selectors need to be broad as eMuseum versions vary, but typically:
                const nodes = document.querySelectorAll('.emuseum-objects-grid-item, .result-item, .grid-item, a.emuseum-objects-grid-item-link');
                
                nodes.forEach(node => {
                    // Try to finding link
                    // Sometimes the node itself is the link, or it contains an anchor
                    const linkEl = node.tagName === 'A' ? node : node.querySelector('a');
                    if (!linkEl) return;
                    
                    const sourceUrl = linkEl.href;
                    // internal ID from URL usually: /objects/12345/...
                    const idMatch = sourceUrl.match(/\/objects\/(\d+)/);
                    const id = idMatch ? idMatch[1] : null;

                    // Image
                    const imgEl = node.querySelector('img');
                    let imageUrl = imgEl ? imgEl.src : null;
                    if (imageUrl && imageUrl.includes('/deriv/')) {
                        // Try to get higher res if possible, usually by replacing path params
                        // e.g. .../deriv/web/ -> .../deriv/generic/ or just keep as is
                    }

                    // Text content parsing
                    // Usually: Artist\nTitle, Date
                    const text = node.innerText.trim();
                    
                    // Naive parsing (improve if structure is known)
                    // eMuseum grid often has separate spans
                    const titleEl = node.querySelector('.title, .emuseum-object-title, span[class*="title"]');
                    const title = titleEl ? titleEl.innerText.trim() : '';

                    const artistEl = node.querySelector('.artist, .people, .emuseum-object-people, span[class*="people"]');
                    const artist = artistEl ? artistEl.innerText.trim() : '';

                    const dateEl = node.querySelector('.date, .displayDate, span[class*="date"]');
                    const date = dateEl ? dateEl.innerText.trim() : '';

                    let medium = '';
                    // Attempt to find medium in text if not explicit
                    // It's often hard without detail page. 
                    
                    items.push({
                        id,
                        title,
                        artist,
                        date,
                        medium, 
                        imageUrl,
                        sourceUrl,
                        _raw: text
                    });
                });
                return items;
            });

            console.log(`Found ${newItems.length} items on page ${currentPage}`);
            if (newItems.length === 0) {
                // If we found nothing but there was no error, maybe we reached end
                break;
            }

            results.push(...newItems);

            // Pagination
            // Look for "Next" button
            const nextLink = await page.evaluate(() => {
                const anchors = Array.from(document.querySelectorAll('.emuseum-pager a, .pager a, .pagination a'));
                const next = anchors.find(a => a.innerText.toLowerCase().includes('next') || a.classList.contains('next'));
                return next ? next.href : null;
            });

            if (nextLink) {
                console.log(`Navigating to next page: ${nextLink}`);
                currentPage++;
                await page.goto(nextLink, { waitUntil: 'networkidle2', timeout: 30000 });
                await handleWAF(page);
            } else {
                console.log('No next page link found. Finished.');
                hasNext = false;
            }
        }

    } catch (err) {
        console.error('Error during scraping:', err);
    } finally {
        await browser.close();
    }

    // Post-process to clean up
    console.log(`Total collected: ${results.length}`);
    
    // Save
    fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
    console.log(`Saved to ${OUTPUT_FILE}`);
}

async function handleWAF(page) {
    let title = await page.title();
    if (title.includes('Verification') || title.includes('Human') || title.includes('Just a moment')) {
        console.log('Waiting for WAF...');
        // Wait up to 30s
        await new Promise(r => setTimeout(r, 10000));
        
        // Check again
        title = await page.title();
        if (title.includes('Verification')) {
            console.log('Still stuck on WAF. In a real environment, you would solve the CAPTCHA now.');
            // Attempt to click "Begin" if simple button
             await page.evaluate(() => {
                const b = Array.from(document.querySelectorAll('button')).find(btn => btn.innerText.includes('Begin'));
                if (b) b.click();
            });
            await new Promise(r => setTimeout(r, 5000));
        }
    }
}

main();
