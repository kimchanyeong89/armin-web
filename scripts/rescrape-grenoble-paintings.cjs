/**
 * Re-scrape Grenoble Paintings Collection
 * 
 * This script re-scrapes the Grenoble paintings collection from scratch,
 * extracting all required fields including year, dimensions, and medium
 * directly from detail pages.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../public/data/musee-grenoble-paintings-collection.json');
const LIST_URL = 'https://www.navigart.fr/grenoble/#/artworks?layout=grid&page=0&categories=Peinture';

const CONFIG = {
    maxPages: 100,
    pageSize: 60,
    scrollDelay: 2000,
    detailDelay: 3000,
    concurrentDetails: 5
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Global deduplication
const seenIds = new Set();
const allArtworks = [];

/**
 * Extract artwork URLs from grid page
 */
async function extractArtworkUrls(page) {
    await delay(CONFIG.scrollDelay);

    // Scroll down multiple times to load all items
    for (let i = 0; i < 10; i++) {
        await page.evaluate(() => window.scrollBy(0, 1000));
        await delay(600);
    }

    const urls = await page.evaluate(() => {
        const links = document.querySelectorAll('a.art-item.step7');
        return Array.from(links).map(a => ({
            url: a.href,
            id: a.href.split('/').pop()
        }));
    });

    return urls.filter(u => !seenIds.has(u.id));
}

/**
 * Extract full artwork details from detail page
 */
async function extractArtworkDetails(page, url) {
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForSelector('.details', { timeout: 15000 });
        await delay(CONFIG.detailDelay);

        const artwork = await page.evaluate((sourceUrl) => {
            const result = {
                id: sourceUrl.split('/').pop(),
                sourceUrl: sourceUrl,
                museum: 'Musée de Grenoble',
                city: 'Grenoble',
                country: 'France'
            };

            // Artist
            const artistEl = document.querySelector('.single-artwork-authors-ua p');
            if (artistEl) {
                result.artist = artistEl.innerText.trim();
            }

            // Title
            const titleEl = document.querySelector('.single-artwork-title-ua');
            if (titleEl) {
                result.title = titleEl.innerText.trim();

                // Year is in the sibling .trusted element
                const titleLi = titleEl.closest('li');
                if (titleLi) {
                    const trustedDivs = titleLi.querySelectorAll('.trusted');
                    if (trustedDivs.length >= 2) {
                        const yearText = trustedDivs[1].querySelector('p')?.innerText?.trim();
                        if (yearText && /\d{4}/.test(yearText)) {
                            result.year = yearText;
                        }
                    }
                }
            }

            // Image URL - from the main image
            const mainImg = document.querySelector('.art-image img');
            if (mainImg) {
                const src = mainImg.src || mainImg.getAttribute('src');
                if (src) {
                    // Convert to 1000 size for reliability
                    result.imageUrl = src.replace('/1200/', '/1000/').replace('/1500/', '/1000/');
                }
            }

            // Fallback: try og:image meta tag
            if (!result.imageUrl) {
                const ogImage = document.querySelector('meta[property="og:image"]');
                if (ogImage && ogImage.content) {
                    result.imageUrl = ogImage.content.replace('/1200/', '/1000/');
                }
            }

            // Artwork type, medium, dimensions from 5th li
            const detailItems = document.querySelectorAll('.details > li');
            if (detailItems.length >= 5) {
                const infoLi = detailItems[4];
                const trustedParagraphs = infoLi.querySelectorAll('.trusted p');

                trustedParagraphs.forEach((p, idx) => {
                    const text = p.innerText.trim();

                    // First item is artwork type
                    if (idx === 0) {
                        const typePatterns = ['peinture', 'dessin', 'photographie', 'sculpture', 'estampe'];
                        if (typePatterns.some(t => text.toLowerCase().includes(t))) {
                            result.artworkType = text;
                        }
                    }

                    // Second item is usually medium
                    if (idx === 1 && text.length > 3) {
                        result.medium = text;
                    }

                    // Items with "cm" are dimensions
                    if (text.toLowerCase().includes('cm')) {
                        if (!result.dimensions) {
                            result.dimensions = text;
                        } else {
                            result.dimensions += ' ; ' + text;
                        }
                    }
                });
            }

            return result;
        }, url);

        return artwork;
    } catch (e) {
        console.error(`  Error extracting ${url}: ${e.message.substring(0, 50)}`);
        return null;
    }
}

/**
 * Process artwork URLs in parallel batches
 */
async function processArtworkBatch(browser, urls) {
    const results = [];

    for (let i = 0; i < urls.length; i += CONFIG.concurrentDetails) {
        const batch = urls.slice(i, i + CONFIG.concurrentDetails);

        const pages = await Promise.all(
            batch.map(async () => {
                const context = await browser.newContext({
                    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
                });
                return { context, page: await context.newPage() };
            })
        );

        const batchResults = await Promise.all(
            batch.map(async (urlInfo, idx) => {
                const { context, page } = pages[idx];
                try {
                    return await extractArtworkDetails(page, urlInfo.url);
                } finally {
                    await page.close();
                    await context.close();
                }
            })
        );

        results.push(...batchResults.filter(r => r && r.title && r.imageUrl));
        console.log(`   Processed ${i + batch.length}/${urls.length} detail pages`);
    }

    return results;
}

/**
 * Main scraping function
 */
async function main() {
    console.log('🎨 Re-scraping Grenoble Paintings Collection\n');

    const browser = await chromium.launch({
        headless: true,
        args: ['--disable-dev-shm-usage', '--no-sandbox']
    });

    try {
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        });
        const page = await context.newPage();

        let currentPage = 0;
        let hasMore = true;

        while (hasMore && currentPage < CONFIG.maxPages) {
            const pageUrl = `https://www.navigart.fr/grenoble/#/artworks?layout=grid&page=${currentPage}&categories=Peinture`;
            console.log(`\n📄 Page ${currentPage + 1}`);

            await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await delay(5000);

            const urls = await extractArtworkUrls(page);

            if (urls.length === 0) {
                console.log('   No more artworks found');
                hasMore = false;
                break;
            }

            console.log(`   Found ${urls.length} new artwork URLs`);

            // Mark as seen
            urls.forEach(u => seenIds.add(u.id));

            // Process detail pages
            const artworks = await processArtworkBatch(browser, urls);
            allArtworks.push(...artworks);

            console.log(`   ✅ Collected ${artworks.length} artworks (Total: ${allArtworks.length})`);

            // Save progress
            saveData();

            currentPage++;

            // Stop only if we get very few new artworks (less than 5)
            if (urls.length < 5) {
                console.log('   Few items found, checking one more page...');
            }
        }

        await context.close();
    } finally {
        await browser.close();
    }

    // Final save
    saveData();
    console.log(`\n🎉 Complete! Total artworks: ${allArtworks.length}`);
}

function saveData() {
    const data = {
        museum: 'Musée de Grenoble',
        collection: 'Paintings',
        artworks: allArtworks,
        scrapedAt: new Date().toISOString(),
        total: allArtworks.length
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));
    console.log(`   💾 Saved ${allArtworks.length} artworks`);
}

main().catch(console.error);
