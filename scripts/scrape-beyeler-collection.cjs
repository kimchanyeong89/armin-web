const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function scrapeBeyeler() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    let linksArray = [];

    // Load existing links if available to save time
    if (fs.existsSync('beyeler-links.json')) {
        console.log('Loading links from beyeler-links.json...');
        linksArray = JSON.parse(fs.readFileSync('beyeler-links.json', 'utf8'));
    } else {
        console.log('Navigating to collection page...');
        await page.goto('https://www.fondationbeyeler.ch/en/beyeler-collection', {
            waitUntil: 'networkidle',
            timeout: 60000
        });

        // Accept cookies
        try {
            // Updated selector based on debug html
            const cookieBtn = await page.waitForSelector('.ccm--save-settings[data-full-consent="true"]', { timeout: 5000 });
            if (cookieBtn) {
                await cookieBtn.click();
                console.log('Accepted cookies via selector');
                await page.waitForTimeout(2000);
            }
        } catch (e) {
            console.log('Cookie banner not found or interaction failed:', e.message);
        }

        const artworkLinks = new Set();
        let previousCount = 0;
        let noChangeCount = 0;

        console.log('Scrolling to load all artworks...');

        // Scroll until no new items are loaded
        while (true) {
            const links = await page.$$eval('a.artwork-list-link', els => els.map(el => el.href));
            links.forEach(link => artworkLinks.add(link));

            console.log(`Found ${artworkLinks.size} artworks so far...`);

            if (artworkLinks.size === previousCount) {
                noChangeCount++;
                if (noChangeCount > 5) break;
            } else {
                noChangeCount = 0;
            }
            previousCount = artworkLinks.size;

            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await page.waitForTimeout(2000);
        }

        console.log(`Total unique artwork links found: ${artworkLinks.size}`);
        linksArray = Array.from(artworkLinks);
        fs.writeFileSync('beyeler-links.json', JSON.stringify(linksArray, null, 2));
    }

    const artworks = [];

    // We need to ensure cookies are accepted in the session before visiting pages
    // Visit the main page once to accept cookies if we skipped the scrolling part
    if (fs.existsSync('beyeler-links.json')) {
        console.log('Visiting main page to establish session/cookies...');
        await page.goto('https://www.fondationbeyeler.ch/en/beyeler-collection', { waitUntil: 'domcontentloaded' });
        try {
            const cookieBtn = await page.waitForSelector('.ccm--save-settings[data-full-consent="true"]', { timeout: 5000 });
            if (cookieBtn) {
                await cookieBtn.click();
                console.log('Accepted cookies');
                await page.waitForTimeout(2000);
            }
        } catch (e) {
            console.log('Cookie banner not handled (might be already accepted):', e.message);
        }
    }

    for (let i = 0; i < linksArray.length; i++) {
        const url = linksArray[i];
        console.log(`Scraping [${i + 1}/${linksArray.length}]: ${url}`);

        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

            // Wait a bit for dynamic content replacing ccm-blocked
            // Check if body still has ccm-blocked?
            await page.waitForFunction(() => !document.body.classList.contains('ccm-blocked'), { timeout: 5000 }).catch(() => { });

            const data = await page.evaluate(() => {
                // Try multiple selectors
                const container = document.querySelector('.fbey-artwork-detail') ||
                    document.querySelector('.tx-wmdbbasefbey') ||
                    document.querySelector('.container-fluid'); // Fallback

                if (!container) return null;

                const artist = document.querySelector('.fbey-artist-name')?.innerText?.trim() ||
                    document.querySelector('.artwork-headline')?.innerText?.trim() ||
                    document.querySelector('h1')?.innerText?.trim() || '';

                const subline = document.querySelector('.artwork-subline')?.innerText?.trim() || '';

                const imgEl = document.querySelector('a.fbey-js-gallery-image');
                const image = imgEl ? imgEl.href : (document.querySelector('.artwork-image img')?.src || '');

                // Metadata is directly in .artwork-detail but NOT in .artwork-description (which is often empty)
                // We clone the container and remove headlines to get just the metadata text
                let textContent = '';
                const detailContainer = document.querySelector('.artwork-detail');
                if (detailContainer) {
                    const clone = detailContainer.cloneNode(true);
                    // Remove title/artist headers which we already extracted
                    clone.querySelectorAll('.artwork-headline, .artwork-subline').forEach(el => el.remove());
                    textContent = clone.innerText.trim();
                } else {
                    // Fallback to old selector just in case individual page structure differs
                    const textDesc = document.querySelector('.artwork-description') ||
                        document.querySelector('.col-md-5.col-md-push-1.artwork-description');
                    if (textDesc) textContent = textDesc.innerText.trim();
                }

                // If content is blocked, we might get nothing.
                if (!artist && !image) return null;

                return {
                    artist,
                    subline,
                    image,
                    textContent
                };
            });

            if (data) {
                let title = data.subline;
                let date = '';
                // Clean up title/date
                // Often subline is "Title, Date"
                if (data.subline) {
                    const dateMatch = data.subline.match(/,\s*(\d{4}(?:[-–]\d{4})?)$/);
                    if (dateMatch) {
                        date = dateMatch[1];
                        title = data.subline.replace(dateMatch[0], '').trim();
                    }
                }

                // If title is empty but artist is present, maybe swap? 
                // Sometimes scraping is messy.
                if (!title && data.artist) {
                    // Some pages might have different structure
                }

                artworks.push({
                    id: `beyeler-${i}`,
                    url,
                    artist: data.artist,
                    title: title || 'Untitled',
                    date,
                    image: data.image,
                    description: data.textContent,
                    source: 'Fondation Beyeler'
                });
            } else {
                console.log('No data found - possible content block or layout change');
            }

        } catch (e) {
            console.error(`Failed to scrape ${url}: ${e.message}`);
        }
    }

    fs.writeFileSync('public/data/beyeler-collection.json', JSON.stringify(artworks, null, 2));
    console.log(`Done! Saved ${artworks.length} items to public/data/beyeler-collection.json`);

    await browser.close();
}

scrapeBeyeler();
