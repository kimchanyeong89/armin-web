/**
 * Scrape Pitti Palace artworks using Playwright
 * Collects all 429 artworks from https://www.uffizi.it/en/pitti-palace/artworks
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.uffizi.it';
const ARTWORKS_URL = 'https://www.uffizi.it/en/pitti-palace/artworks';
const OUTPUT_FILE = path.join(__dirname, '../public/data/pitti-palace-collection.json');
const DELAY_MS = 300;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function scrapeArtworkPage(page, url) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(500);

    const data = await page.evaluate(() => {
        const artwork = {};

        // Title
        const h1 = document.querySelector('h1');
        artwork.title = h1 ? h1.textContent.trim() : '';

        // Image - from picture source or img
        const picture = document.querySelector('picture source');
        if (picture) {
            const srcset = picture.getAttribute('srcset');
            if (srcset) {
                const urls = srcset.split(',').map(s => s.trim().split(' ')[0]);
                artwork.image = urls[urls.length - 1] || urls[0];
            }
        }
        if (!artwork.image) {
            const img = document.querySelector('img[src*="datocms"]');
            if (img) artwork.image = img.src;
        }

        // Get all dt/dd pairs
        const dts = document.querySelectorAll('dt');
        dts.forEach(dt => {
            const dd = dt.nextElementSibling;
            if (dd && dd.tagName === 'DD') {
                const label = dt.textContent.trim().toLowerCase();
                const value = dd.textContent.trim();

                if (label.includes('artist')) artwork.artist = value;
                if (label.includes('date')) artwork.date = value;
                if (label.includes('technique')) artwork.technique = value;
                if (label.includes('size') || label.includes('dimension')) artwork.size = value;
                if (label.includes('location') || label.includes('room')) artwork.location = value;
                if (label.includes('inventory')) artwork.inventory = value;
                if (label.includes('collection')) artwork.collection = value;
            }
        });

        // Description
        const descDiv = document.querySelector('[class*="Description"], [class*="description"]');
        if (descDiv) {
            artwork.description = descDiv.textContent.trim().substring(0, 500);
        }

        return artwork;
    });

    data.sourceUrl = url;
    data.id = url.split('/').pop();
    data.slug = url.split('/').pop();
    data.museum = 'Pitti Palace';

    return data;
}

async function getAllArtworkUrls(page) {
    await page.goto(ARTWORKS_URL, { waitUntil: 'domcontentloaded' });
    await sleep(2000);

    const allUrls = new Set();
    let pageNum = 1;
    const maxPages = 22;

    while (pageNum <= maxPages) {
        // Extract links from current page
        const links = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a'))
                .map(a => a.href)
                .filter(href => href.includes('/en/artworks/') && !href.includes('/search'));
        });

        links.forEach(url => allUrls.add(url));
        console.log(`Page ${pageNum}: Found ${links.length} links (total unique: ${allUrls.size})`);

        // Click next button
        const nextButton = await page.$('a[aria-label="Go to next page"]');
        if (!nextButton) break;

        const firstItem = await page.$eval('a[href*="/en/artworks/"]:not([href*="/search"])', a => a.href).catch(() => null);
        await nextButton.click();

        // Wait for content to change
        try {
            await page.waitForFunction(
                (oldFirst) => {
                    const newFirst = document.querySelector('a[href*="/en/artworks/"]:not([href*="/search"])');
                    return newFirst && newFirst.href !== oldFirst;
                },
                { timeout: 10000 },
                firstItem
            );
        } catch (e) {
            console.log('Page content did not change, trying next...');
        }

        await sleep(1000);
        pageNum++;
    }

    return Array.from(allUrls);
}

async function main() {
    console.log('🖼️ Scraping Pitti Palace artworks with Playwright...\n');

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        // Get all artwork URLs
        console.log('📋 Collecting artwork URLs...\n');
        const urls = await getAllArtworkUrls(page);
        console.log(`\n✅ Found ${urls.length} unique artwork URLs\n`);

        // Scrape each artwork
        const artworks = [];
        for (let i = 0; i < urls.length; i++) {
            try {
                const data = await scrapeArtworkPage(page, urls[i]);
                artworks.push(data);

                if ((i + 1) % 20 === 0 || i === urls.length - 1) {
                    console.log(`Progress: ${i + 1}/${urls.length} - ${data.title}`);
                }
            } catch (error) {
                console.error(`Error scraping ${urls[i]}:`, error.message);
            }

            await sleep(DELAY_MS);
        }

        // Save results
        const output = {
            museum: 'Pitti Palace',
            museumId: 'pitti-palace',
            location: 'Florence, Italy',
            type: 'permanent',
            scrapedAt: new Date().toISOString(),
            totalArtworks: artworks.length,
            objects: artworks
        };

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
        console.log(`\n✅ Saved ${artworks.length} artworks to ${OUTPUT_FILE}`);

    } finally {
        await browser.close();
    }
}

main().catch(console.error);
