/**
 * Multi-French Museums Scraper V2
 * 
 * Fixed selectors based on browser analysis:
 * - Grenoble (Navigart): a.art-item.step7
 * - Lyon/Bordeaux (opacweb): a.notice-item-wrapper, img srcset
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../public/data');

const delay = (ms) => new Promise(r => setTimeout(r, ms));
const timestamp = () => new Date().toLocaleTimeString('ko-KR', { hour12: false });
const log = (prefix, msg) => console.log(`[${timestamp()}] [${prefix}] ${msg}`);

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const globalSeenImages = new Set();

// ============= GRENOBLE (Navigart) =============

const GRENOBLE_CONFIG = {
    paintings: {
        name: 'Paintings',
        fileName: 'musee-grenoble-paintings-collection.json',
        url: 'https://www.navigart.fr/grenoble/artworks/checkbox:withimage/Avec%20image/collection_department/Peintures%20fran%C3%A7aises%7C%7CPeintures%2020e%7C%7CPeintures%2019e%7C%7CPeintures%20%C3%A9coles%20du%20Nord%7C%7CPeintures%20italiennes%7C%7CPeintures%2021e%7C%7CPeintures%20espagnoles'
    },
    photography: {
        name: 'Photography',
        fileName: 'musee-grenoble-photography-collection.json',
        url: 'https://www.navigart.fr/grenoble/artworks/checkbox:withimage/Avec%20image/collection_department/Photographies%2020e%7C%7CPhotographies%20%2021e%7C%7CPhotographies%2019e'
    },
    drawings: {
        name: 'Drawings',
        fileName: 'musee-grenoble-drawings-collection.json',
        url: 'https://www.navigart.fr/grenoble/artworks/checkbox:withimage/Avec%20image/collection_department/Dessins%2021e%7C%7CDessins%20fran%C3%A7ais%20anciens%7C%7CDessins%20%C3%A9coles%20du%20Nord%7C%7CDessins%2020e%7C%7CDessins%2019e'
    }
};

async function scrapeGrenobleCategory(browser, categoryKey) {
    const category = GRENOBLE_CONFIG[categoryKey];
    const artworks = [];
    const seenUrls = new Set();
    let page = 1;
    let consecutiveEmpty = 0;

    log(`Grenoble ${category.name}`, `🏛️ Starting scrape...`);

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    });

    while (consecutiveEmpty < 5) {
        const url = `${category.url}?page=${page}`;
        const browserPage = await context.newPage();

        try {
            await browserPage.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
            // Wait longer for JavaScript rendering
            await delay(8000);

            // Scroll to load all images
            for (let i = 0; i < 10; i++) {
                await browserPage.evaluate(() => window.scrollBy(0, 500));
                await delay(500);
            }
            await delay(2000);

            // Use correct selector: a.art-item.step7
            const pageData = await browserPage.evaluate(() => {
                const items = [];
                const artworkCards = document.querySelectorAll('a.art-item.step7');

                artworkCards.forEach(card => {
                    const href = card.href;
                    const img = card.querySelector('img');
                    const titleEl = card.querySelector('h3');
                    const artistEl = card.querySelector('h2 div');

                    let imageUrl = img?.src || '';
                    if (imageUrl.includes('/400/')) {
                        imageUrl = imageUrl.replace('/400/', '/1200/');
                    }

                    if (imageUrl && !imageUrl.startsWith('data:') && href) {
                        items.push({
                            sourceUrl: href,
                            imageUrl,
                            title: titleEl?.innerText?.trim() || '',
                            artist: artistEl?.innerText?.trim() || ''
                        });
                    }
                });

                return items;
            });

            if (pageData.length === 0) {
                consecutiveEmpty++;
                log(`Grenoble ${category.name}`, `   Page ${page}: 0 items (empty ${consecutiveEmpty}/5)`);
            } else {
                consecutiveEmpty = 0;
                let newCount = 0;

                for (const item of pageData) {
                    if (seenUrls.has(item.sourceUrl)) continue;
                    if (globalSeenImages.has(item.imageUrl)) continue;

                    seenUrls.add(item.sourceUrl);
                    globalSeenImages.add(item.imageUrl);

                    artworks.push({
                        id: `grenoble-${categoryKey}-${artworks.length}`,
                        title: item.title || 'Untitled',
                        artist: item.artist || 'Unknown',
                        year: null,
                        imageUrl: item.imageUrl,
                        medium: category.name,
                        artworkType: category.name,
                        sourceUrl: item.sourceUrl,
                        museum: 'Musée de Grenoble',
                        city: 'Grenoble',
                        country: 'France'
                    });
                    newCount++;
                }

                log(`Grenoble ${category.name}`, `📄 Page ${page}: +${newCount} (total ${artworks.length})`);

                if (page % 20 === 0) {
                    saveGrenoble(categoryKey, artworks);
                }
            }
        } catch (e) {
            log(`Grenoble ${category.name}`, `❌ Page ${page} error: ${e.message.slice(0, 50)}`);
            consecutiveEmpty++;
        } finally {
            await browserPage.close();
        }

        page++;
        await delay(500);
    }

    await context.close();
    log(`Grenoble ${category.name}`, `✅ Complete: ${artworks.length} items`);

    return { categoryKey, artworks };
}

function saveGrenoble(categoryKey, artworks) {
    const category = GRENOBLE_CONFIG[categoryKey];
    const output = {
        museum: {
            name: 'Musée de Grenoble',
            city: 'Grenoble',
            country: 'France',
            website: 'https://www.museedegrenoble.fr/'
        },
        collection: category.name,
        totalCount: artworks.length,
        scrapedAt: new Date().toISOString(),
        artworks: artworks
    };

    fs.writeFileSync(path.join(OUTPUT_DIR, category.fileName), JSON.stringify(output, null, 2));
    log(`Grenoble ${category.name}`, `💾 Saved: ${artworks.length} items`);
}

// ============= LYON (opacweb) =============

async function scrapeLyon(browser) {
    const artworks = [];
    const seenUrls = new Set();

    log('Lyon MBA', '🏛️ Starting scrape (Painting + Graphic Design)...');

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    });

    const urls = [
        { name: 'Painting', baseUrl: 'https://collections.mba-lyon.fr/en/search?query=&onlyHasImage=true&f=853143&o=852732%2C852808%2C852815' },
        { name: 'Graphic Design', baseUrl: 'https://collections.mba-lyon.fr/en/search?query=&onlyHasImage=true&f=852812%2C853966&o=852732%2C852808%2C852814%2C852815' }
    ];

    for (const urlConfig of urls) {
        let page = 1;
        let hasMore = true;

        log('Lyon MBA', `📂 Scraping ${urlConfig.name}...`);

        while (hasMore && page <= 50) { // Safety limit
            const url = urlConfig.baseUrl + `&p=${page}`;
            const browserPage = await context.newPage();

            try {
                await browserPage.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
                // Wait longer for Vue.js to render
                await delay(10000);

                // Scroll to load all
                for (let i = 0; i < 10; i++) {
                    await browserPage.evaluate(() => window.scrollBy(0, 500));
                    await delay(400);
                }
                await delay(2000);

                // Use correct selector: a.notice-item-wrapper
                // Get images from srcset attribute
                const pageData = await browserPage.evaluate(() => {
                    const items = [];
                    const cards = document.querySelectorAll('a.notice-item-wrapper');

                    cards.forEach(card => {
                        const href = card.href;
                        const img = card.querySelector('img');
                        const titleEl = card.querySelector('h2');
                        const artistEl = card.querySelector('p');

                        // Get image from srcset if src is empty
                        let imageUrl = img?.src || '';
                        if (!imageUrl || imageUrl === '') {
                            const srcset = img?.getAttribute('srcset');
                            if (srcset) {
                                // Take first URL from srcset
                                imageUrl = srcset.split(' ')[0];
                            }
                        }

                        if (imageUrl && !imageUrl.startsWith('data:') && href) {
                            items.push({
                                sourceUrl: href,
                                imageUrl,
                                title: titleEl?.innerText?.trim() || '',
                                artist: artistEl?.innerText?.trim() || ''
                            });
                        }
                    });

                    return items;
                });

                if (pageData.length === 0) {
                    hasMore = false;
                    log('Lyon MBA', `   ${urlConfig.name} Page ${page}: 0 items, stopping`);
                } else {
                    let newCount = 0;

                    for (const item of pageData) {
                        if (seenUrls.has(item.sourceUrl)) continue;
                        if (globalSeenImages.has(item.imageUrl)) continue;

                        seenUrls.add(item.sourceUrl);
                        globalSeenImages.add(item.imageUrl);

                        artworks.push({
                            id: `lyon-${artworks.length}`,
                            title: item.title || 'Untitled',
                            artist: item.artist || 'Unknown',
                            year: null,
                            imageUrl: item.imageUrl,
                            medium: urlConfig.name,
                            artworkType: urlConfig.name,
                            sourceUrl: item.sourceUrl,
                            museum: 'Musée des Beaux-Arts de Lyon',
                            city: 'Lyon',
                            country: 'France'
                        });
                        newCount++;
                    }

                    log('Lyon MBA', `📄 ${urlConfig.name} Page ${page}: +${newCount} (total ${artworks.length})`);
                    page++;
                }
            } catch (e) {
                log('Lyon MBA', `❌ ${urlConfig.name} Page ${page} error: ${e.message.slice(0, 50)}`);
                hasMore = false;
            } finally {
                await browserPage.close();
            }

            await delay(500);
        }
    }

    await context.close();

    const output = {
        museum: {
            name: 'Musée des Beaux-Arts de Lyon',
            city: 'Lyon',
            country: 'France',
            website: 'https://www.mba-lyon.fr/'
        },
        collection: 'Painting & Graphic Design',
        totalCount: artworks.length,
        scrapedAt: new Date().toISOString(),
        artworks: artworks
    };

    fs.writeFileSync(path.join(OUTPUT_DIR, 'mba-lyon-collection.json'), JSON.stringify(output, null, 2));
    log('Lyon MBA', `✅ Complete: ${artworks.length} items`);

    return artworks;
}

// ============= BORDEAUX (opacweb) =============

const BORDEAUX_CONFIG = {
    drawings: {
        name: 'Drawings',
        fileName: 'musba-bordeaux-drawings-collection.json',
        baseUrl: 'https://musba-bordeaux.opacweb.fr/fr/search?query=&f=182459&o=182435'
    },
    paintings: {
        name: 'Paintings',
        fileName: 'musba-bordeaux-paintings-collection.json',
        baseUrl: 'https://musba-bordeaux.opacweb.fr/fr/search?query=&f=182533&o=182435'
    }
};

async function scrapeBordeauxCategory(browser, categoryKey) {
    const category = BORDEAUX_CONFIG[categoryKey];
    const artworks = [];
    const seenUrls = new Set();
    let page = 1;
    let hasMore = true;
    let cookieHandled = false;

    log(`Bordeaux ${category.name}`, '🏛️ Starting scrape...');

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    });

    while (hasMore && page <= 200) { // Safety limit
        const url = `${category.baseUrl}&p=${page}`;
        const browserPage = await context.newPage();

        try {
            await browserPage.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
            await delay(10000);

            // Handle cookie consent
            if (!cookieHandled) {
                try {
                    const acceptBtn = await browserPage.$('button:has-text("ACCEPTER"), #cm-id-accept-all');
                    if (acceptBtn) {
                        await acceptBtn.click();
                        await delay(2000);
                    }
                    cookieHandled = true;
                } catch (e) {
                    // Ignore cookie handling errors
                }
            }

            // Scroll to load
            for (let i = 0; i < 10; i++) {
                await browserPage.evaluate(() => window.scrollBy(0, 500));
                await delay(400);
            }
            await delay(2000);

            // Extract using correct selector
            const pageData = await browserPage.evaluate(() => {
                const items = [];
                const cards = document.querySelectorAll('a.notice-item-wrapper');

                cards.forEach(card => {
                    const href = card.href;
                    const img = card.querySelector('img');
                    // Bordeaux: artist in h2, title in p
                    const artistEl = card.querySelector('h2');
                    const titleEl = card.querySelector('p');

                    let imageUrl = img?.src || '';
                    if (!imageUrl || imageUrl === '') {
                        const srcset = img?.getAttribute('srcset');
                        if (srcset) {
                            imageUrl = srcset.split(' ')[0];
                        }
                    }

                    if (imageUrl && !imageUrl.startsWith('data:') && href) {
                        items.push({
                            sourceUrl: href,
                            imageUrl,
                            title: titleEl?.innerText?.trim() || '',
                            artist: artistEl?.innerText?.trim() || ''
                        });
                    }
                });

                return items;
            });

            if (pageData.length === 0) {
                hasMore = false;
                log(`Bordeaux ${category.name}`, `   Page ${page}: 0 items, stopping`);
            } else {
                let newCount = 0;

                for (const item of pageData) {
                    if (seenUrls.has(item.sourceUrl)) continue;
                    if (globalSeenImages.has(item.imageUrl)) continue;

                    seenUrls.add(item.sourceUrl);
                    globalSeenImages.add(item.imageUrl);

                    artworks.push({
                        id: `bordeaux-${categoryKey}-${artworks.length}`,
                        title: item.title || 'Untitled',
                        artist: item.artist || 'Unknown',
                        year: null,
                        imageUrl: item.imageUrl,
                        medium: category.name,
                        artworkType: category.name,
                        sourceUrl: item.sourceUrl,
                        museum: 'Musée des Beaux-Arts de Bordeaux',
                        city: 'Bordeaux',
                        country: 'France'
                    });
                    newCount++;
                }

                log(`Bordeaux ${category.name}`, `📄 Page ${page}: +${newCount} (total ${artworks.length})`);

                // Save every 20 pages
                if (page % 20 === 0) {
                    saveBordeaux(categoryKey, artworks);
                }

                page++;
            }
        } catch (e) {
            log(`Bordeaux ${category.name}`, `❌ Page ${page} error: ${e.message.slice(0, 50)}`);
            hasMore = false;
        } finally {
            await browserPage.close();
        }

        await delay(500);
    }

    await context.close();
    saveBordeaux(categoryKey, artworks);
    log(`Bordeaux ${category.name}`, `✅ Complete: ${artworks.length} items`);

    return { categoryKey, artworks };
}

function saveBordeaux(categoryKey, artworks) {
    const category = BORDEAUX_CONFIG[categoryKey];
    const output = {
        museum: {
            name: 'Musée des Beaux-Arts de Bordeaux',
            city: 'Bordeaux',
            country: 'France',
            website: 'https://www.musba-bordeaux.fr/'
        },
        collection: category.name,
        totalCount: artworks.length,
        scrapedAt: new Date().toISOString(),
        artworks: artworks
    };

    fs.writeFileSync(path.join(OUTPUT_DIR, category.fileName), JSON.stringify(output, null, 2));
    log(`Bordeaux ${category.name}`, `💾 Saved: ${artworks.length} items`);
}

// ============= MAIN =============

async function main() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  🏛️  Multi-French Museums Scraper V2');
    console.log('  Lyon + Grenoble + Bordeaux (Fixed Selectors)');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  Started: ${new Date().toLocaleString()}`);
    console.log('───────────────────────────────────────────────────────────────\n');

    const browser = await chromium.launch({ headless: true });

    try {
        log('Main', '🚀 Starting parallel scraping of all 6 collections!');

        const [
            grenoblePaintings,
            grenoblePhotography,
            grenobleDrawings,
            lyonArtworks,
            bordeauxDrawings,
            bordeauxPaintings
        ] = await Promise.all([
            scrapeGrenobleCategory(browser, 'paintings'),
            scrapeGrenobleCategory(browser, 'photography'),
            scrapeGrenobleCategory(browser, 'drawings'),
            scrapeLyon(browser),
            scrapeBordeauxCategory(browser, 'drawings'),
            scrapeBordeauxCategory(browser, 'paintings')
        ]);

        saveGrenoble('paintings', grenoblePaintings.artworks);
        saveGrenoble('photography', grenoblePhotography.artworks);
        saveGrenoble('drawings', grenobleDrawings.artworks);

        console.log('\n═══════════════════════════════════════════════════════════════');
        console.log('  ✅ SCRAPING COMPLETE');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log(`  Grenoble Paintings: ${grenoblePaintings.artworks.length}`);
        console.log(`  Grenoble Photography: ${grenoblePhotography.artworks.length}`);
        console.log(`  Grenoble Drawings: ${grenobleDrawings.artworks.length}`);
        console.log(`  Lyon (Painting + Graphic): ${lyonArtworks.length}`);
        console.log(`  Bordeaux Drawings: ${bordeauxDrawings.artworks.length}`);
        console.log(`  Bordeaux Paintings: ${bordeauxPaintings.artworks.length}`);
        console.log('  ────────────────────────────────────');
        const total = grenoblePaintings.artworks.length +
            grenoblePhotography.artworks.length +
            grenobleDrawings.artworks.length +
            lyonArtworks.length +
            bordeauxDrawings.artworks.length +
            bordeauxPaintings.artworks.length;
        console.log(`  TOTAL: ${total} artworks`);
        console.log(`  Unique images tracked: ${globalSeenImages.size}`);
        console.log('═══════════════════════════════════════════════════════════════');

    } finally {
        await browser.close();
    }
}

main().catch(console.error);
