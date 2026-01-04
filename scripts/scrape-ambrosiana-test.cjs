/**
 * Test scraper for Pinacoteca Ambrosiana using Playwright
 * Scrapes first 3 pages of the JS-rendered catalog
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const CATALOG_URL = 'https://www.ambrosiana.it/en/pinacoteca-collections/#/category';
const OUTPUT_FILE = path.join(__dirname, '../public/data/ambrosiana-test.json');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
    console.log('🎨 Scraping Pinacoteca Ambrosiana (TEST with Playwright)...\n');

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        await page.goto(CATALOG_URL, { waitUntil: 'networkidle', timeout: 60000 });
        await sleep(3000);

        // Wait for catalog to load
        await page.waitForSelector('.artwork-item, .collection-item, [class*="item"], [class*="card"]', { timeout: 30000 }).catch(() => { });

        // Get all artwork items
        const artworks = await page.evaluate(() => {
            const items = [];
            // Try various selectors
            const cards = document.querySelectorAll('.artwork-item, .collection-item, [class*="artwork"], [class*="card"], .item');

            cards.forEach((card, idx) => {
                if (idx >= 15) return; // Test limit

                const artwork = {};

                // Title
                const titleEl = card.querySelector('h2, h3, .title, [class*="title"]');
                artwork.title = titleEl ? titleEl.textContent.trim() : '';

                // Artist
                const artistEl = card.querySelector('.artist, .author, [class*="artist"], [class*="author"]');
                artwork.artist = artistEl ? artistEl.textContent.trim() : '';

                // Image
                const imgEl = card.querySelector('img');
                artwork.image = imgEl ? (imgEl.src || imgEl.dataset.src) : '';

                // Link
                const linkEl = card.querySelector('a');
                artwork.sourceUrl = linkEl ? linkEl.href : '';

                if (artwork.title || artwork.image) {
                    items.push(artwork);
                }
            });

            return items;
        });

        console.log(`Found ${artworks.length} artworks on page`);

        // Try to get more details by visiting individual pages
        const detailedArtworks = [];
        for (let i = 0; i < Math.min(10, artworks.length); i++) {
            const art = artworks[i];
            if (art.sourceUrl && art.sourceUrl.startsWith('http')) {
                try {
                    console.log(`Fetching details ${i + 1}/10: ${art.title || art.sourceUrl}`);
                    await page.goto(art.sourceUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                    await sleep(1000);

                    const details = await page.evaluate(() => {
                        const data = {};

                        // Title
                        const h1 = document.querySelector('h1');
                        data.title = h1 ? h1.textContent.trim() : '';

                        // Artist
                        const artistEl = document.querySelector('.artist, .author, [class*="artist"]');
                        data.artist = artistEl ? artistEl.textContent.trim() : '';

                        // Year
                        const dateEl = document.querySelector('.date, .year, [class*="date"]');
                        data.year = dateEl ? dateEl.textContent.trim() : '';

                        // Medium
                        const techEl = document.querySelector('.technique, .medium, [class*="technique"]');
                        data.medium = techEl ? techEl.textContent.trim() : '';

                        // Dimensions
                        const dimEl = document.querySelector('.dimensions, .size, [class*="dimension"]');
                        data.dimension = dimEl ? dimEl.textContent.trim() : '';

                        // Image
                        const img = document.querySelector('img[src*="ambrosiana"], .artwork-image img, [class*="artwork"] img');
                        data.image = img ? img.src : '';

                        return data;
                    });

                    detailedArtworks.push({
                        ...art,
                        ...details,
                        sourceUrl: art.sourceUrl
                    });

                    console.log(`  → ${details.title} | ${details.artist} | ${details.year}`);
                } catch (err) {
                    console.error(`  Error: ${err.message}`);
                    detailedArtworks.push(art);
                }
            } else {
                detailedArtworks.push(art);
            }
        }

        const output = {
            museum: 'Pinacoteca Ambrosiana',
            museumId: 'ambrosiana-collection',
            location: 'Milan, Italy',
            type: 'permanent',
            totalArtworks: detailedArtworks.length,
            objects: detailedArtworks
        };

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
        console.log(`\n✅ Saved ${detailedArtworks.length} artworks to ${OUTPUT_FILE}`);

        console.log('\n📊 Stats:');
        console.log(`  With image: ${detailedArtworks.filter(a => a.image).length}`);
        console.log(`  With artist: ${detailedArtworks.filter(a => a.artist).length}`);
        console.log(`  With year: ${detailedArtworks.filter(a => a.year).length}`);

    } catch (err) {
        console.error('Fatal error:', err);
    } finally {
        await browser.close();
    }
}

main();
