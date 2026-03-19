const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

const URL = "https://www.mfab.hu/artworks/?per_page=20&offset=0&current_page=1&orderby=&order=asc&show_only=withimage&artwork_type=computer-print,film,painting,photograph,print,prints-and-drawings,video";
const OUTPUT_FILE = 'public/data/mfab-collection-test.json';

async function main() {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    // Intercept responses to check for API data
    page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('wp-json/mfab') || url.includes('artworks') && response.headers()['content-type']?.includes('json')) {
            console.log('Potential API response:', url);
            try {
                const data = await response.json();
                // console.log('Data keys:', Object.keys(data));
            } catch (e) {}
        }
    });

    console.log(`Navigating to ${URL}...`);
    await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });

    // Wait for something that looks like an artwork card
    // Searching for common elements or text
    
    // Let's dump the page content to a debug file if we fail to find items
    // fs.writeFileSync('mfab-debug.html', await page.content());

    // Try to find selectors dynamically by evaluating the page
    const scrapResult = await page.evaluate(() => {
        // Helper to get text safe
        const getText = (el, sel) => el.querySelector(sel)?.innerText?.trim() || '';
        const getSrc = (el, sel) => el.querySelector(sel)?.src || '';
        const getHref = (el, sel) => el.querySelector(sel)?.href || '';

        // Try to identify the grid container
        // Look for elements that repeat and contain images
        const allDivs = Array.from(document.querySelectorAll('div'));
        
        // Strategy: find a div that contains an <img> and an <a> and has a sibling with similar structure
        // Or just target generic "article" or "div" that looks like a card
        
        // Let's try looking for the artwork links specifically
        // They typically point to /artworks/something
        const links = Array.from(document.querySelectorAll('a[href*="/artworks/"]'));
        
        // Filter out nav links
        const itemLinks = links.filter(a => {
            // Check if it has an image child or parent has image sibling
            return a.querySelector('img') || a.parentElement.querySelector('img');
        });

        // Dedup links
        const uniqueLinks = [...new Set(itemLinks.map(a => a.href))];
        
        return {
            count: uniqueLinks.length,
            links: uniqueLinks
        };
    });

    console.log(`Found ${scrapResult.count} items via existing DOM.`);
    
    if (scrapResult.count === 0) {
        console.log('No items found. Saving HTML dump.');
        fs.writeFileSync('mfab-puppeteer-debug.html', await page.content());
    } else {
        console.log('First 5 links:', scrapResult.links.slice(0, 5));
    }

    // If we have links, we can scrape clean data from detail pages or from the grid cards if possible.
    // Let's see if we can get data from the grid first.
    
    if (scrapResult.count > 0) {
        const gridItems = await page.evaluate(() => {
            const data = [];
            const cards = document.querySelectorAll('.c-artwork-card__link'); // Guessing class from search result or standard naming, or finding common parent
            
            // If we can't guess the class, we iterate the links again and go up to find the container
            const links = Array.from(document.querySelectorAll('a[href*="/artworks/"]'));
            const processed = new Set();
            
            links.forEach(link => {
                if (processed.has(link.href)) return;
                
                // Find nearest container that seems to be the card
                // Usually has an image and some text
                const card = link.closest('div') || link;
                const img = card.querySelector('img');
                if (!img) return; // Skip text-only links likely

                const title = card.innerText.split('\n').filter(t => t.length > 3)[0] || '';
                
                data.push({
                    id: link.href.split('/').filter(Boolean).pop(),
                    url: link.href,
                    title: title,
                    image: img.src
                });
                processed.add(link.href);
            });
            return data;
        });
        
        console.log('Extracted grid data:', gridItems.length, 'items');
        console.log(gridItems[0]);
    }

    await browser.close();
}

main().catch(console.error);
