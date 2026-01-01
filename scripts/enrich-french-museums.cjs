/**
 * Enrichment Scraper for French Museums
 * 
 * This script enriches existing artwork data by visiting each artwork's detail page
 * and extracting missing information: year, dimensions, medium
 * 
 * Supports:
 * - Navigart (Grenoble) - uses .details > li structure
 * - Opacweb (Lyon, Bordeaux) - uses label-value pairs
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../public/data');

// Configuration
const CONFIG = {
    concurrentPages: 8,           // Number of parallel pages (increased for speed)
    delayBetweenRequests: 300,    // Base delay between requests (ms)
    maxRetries: 2,                // Retries for failed requests
    saveInterval: 50,             // Save progress every N artworks
    timeout: 20000,               // Page timeout (ms)
    navigartWait: 5000            // Extra wait for Navigart JS rendering
};

// Delay helper
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Parse Grenoble (Navigart) detail page - UPDATED SELECTORS
 */
async function parseNavigartDetail(page) {
    try {
        // Wait for the details list to appear (more reliable than container)
        await page.waitForSelector('.details', { timeout: CONFIG.timeout });
        await delay(CONFIG.navigartWait);  // Wait for full JS rendering

        const data = await page.evaluate(() => {
            const result = { year: null, dimensions: null, medium: null, artist: null, title: null, artworkType: null };

            // Get artist from the author section
            const artistEl = document.querySelector('.single-artwork-authors-ua p');
            if (artistEl) {
                result.artist = artistEl.innerText.trim();
            }

            // Get title
            const titleEl = document.querySelector('.single-artwork-title-ua');
            if (titleEl) {
                result.title = titleEl.innerText.trim();

                // Year is in the next sibling .trusted element
                const titleLi = titleEl.closest('li');
                if (titleLi) {
                    const trustedDivs = titleLi.querySelectorAll('.trusted');
                    if (trustedDivs.length >= 2) {
                        const yearText = trustedDivs[1].querySelector('p')?.innerText?.trim();
                        if (yearText) {
                            result.year = yearText;
                        }
                    }
                }
            }

            // Get artwork type, medium, and dimensions from the 5th li (index 4)
            const detailItems = document.querySelectorAll('.details > li');
            if (detailItems.length >= 5) {
                const infoLi = detailItems[4];
                const trustedParagraphs = infoLi.querySelectorAll('.trusted p');

                trustedParagraphs.forEach((p, idx) => {
                    const text = p.innerText.trim();

                    // First item is usually artwork type (Peinture, Dessin, etc.)
                    if (idx === 0 && !result.artworkType) {
                        const typePatterns = ['peinture', 'dessin', 'photographie', 'sculpture', 'estampe', 'gravure'];
                        if (typePatterns.some(t => text.toLowerCase().includes(t))) {
                            result.artworkType = text;
                        }
                    }

                    // Second item is usually medium
                    if (idx === 1 && !result.medium) {
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
        });

        return data;
    } catch (e) {
        console.error(`  Navigart parse error: ${e.message.substring(0, 50)}...`);
        return { year: null, dimensions: null, medium: null, artist: null };
    }
}

/**
 * Parse Lyon/Bordeaux (Opacweb) detail page
 */
async function parseOpacwebDetail(page) {
    try {
        await page.waitForSelector('.notice-detail', { timeout: CONFIG.timeout });
        await delay(2000);

        const data = await page.evaluate(() => {
            const result = { year: null, dimensions: null, medium: null, artist: null, title: null };

            // Get title from h1
            const h1 = document.querySelector('h1');
            if (h1) {
                result.title = h1.innerText.trim();
            }

            // Opacweb uses label-value pairs in .notice-detail-item
            const items = document.querySelectorAll('.notice-detail-item');

            items.forEach(item => {
                const labelEl = item.querySelector('.notice-detail-item-label');
                const valueEl = item.querySelector('.notice-detail-item-value');

                if (!labelEl || !valueEl) return;

                const label = labelEl.innerText.trim().toLowerCase();
                const value = valueEl.innerText.trim();

                // Author
                if (label.includes('auteur')) {
                    result.artist = value;
                }

                // Date/Year
                if (label.includes('date') || label.includes('époque')) {
                    // Extract just the year from strings like "1837 : Date estimée"
                    const yearMatch = value.match(/(\d{4})/);
                    if (yearMatch) {
                        result.year = yearMatch[1];
                    } else {
                        result.year = value;
                    }
                }

                // Dimensions
                if (label.includes('mesures') || label.includes('dimension')) {
                    // Parse "Hauteur en cm : 51 ; Largeur en cm : 61,7"
                    const hMatch = value.match(/hauteur\s*(?:en\s*cm\s*)?:\s*([\d,\.]+)/i);
                    const wMatch = value.match(/largeur\s*(?:en\s*cm\s*)?:\s*([\d,\.]+)/i);

                    if (hMatch && wMatch) {
                        result.dimensions = `${hMatch[1]} × ${wMatch[1]} cm`;
                    } else if (value) {
                        result.dimensions = value;
                    }
                }

                // Medium/Technique
                if (label.includes('matière') || label.includes('technique')) {
                    result.medium = value;
                }
            });

            return result;
        });

        return data;
    } catch (e) {
        console.error(`  Opacweb parse error: ${e.message.substring(0, 50)}...`);
        return { year: null, dimensions: null, medium: null, artist: null };
    }
}

/**
 * Enrich a single artwork with retry logic
 */
async function enrichArtwork(page, artwork, platform, retries = 0) {
    if (!artwork.sourceUrl) {
        return artwork;
    }

    try {
        await page.goto(artwork.sourceUrl, {
            waitUntil: 'domcontentloaded',
            timeout: CONFIG.timeout
        });

        let enrichedData;
        if (platform === 'navigart') {
            enrichedData = await parseNavigartDetail(page);
        } else {
            enrichedData = await parseOpacwebDetail(page);
        }

        // Merge enriched data (don't overwrite existing non-null values)
        return {
            ...artwork,
            year: artwork.year || enrichedData.year,
            dimensions: artwork.dimensions || enrichedData.dimensions,
            medium: enrichedData.medium || artwork.medium,
            artist: enrichedData.artist || artwork.artist,
            artworkType: enrichedData.artworkType || artwork.artworkType
        };
    } catch (e) {
        if (retries < CONFIG.maxRetries) {
            await delay(2000);
            return enrichArtwork(page, artwork, platform, retries + 1);
        }
        console.error(`  Failed after retries: ${artwork.id}`);
        return artwork;
    }
}

/**
 * Process a collection with concurrent pages
 */
async function processCollection(browser, collectionFile, platform) {
    const filePath = path.join(DATA_DIR, collectionFile);

    if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${collectionFile}`);
        return;
    }

    console.log(`\n📦 Processing: ${collectionFile}`);

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const artworks = data.artworks || [];
    const total = artworks.length;

    console.log(`   Total artworks: ${total}`);

    // Track progress and stats
    let processed = 0;
    let enrichedCount = 0;
    let yearCount = 0;
    let dimCount = 0;
    let mediumCount = 0;
    const enrichedArtworks = [];

    // Process in batches
    const batchSize = CONFIG.concurrentPages;

    for (let i = 0; i < total; i += batchSize) {
        const batch = artworks.slice(i, Math.min(i + batchSize, total));

        // Create contexts for this batch
        const contexts = await Promise.all(
            batch.map(async () => {
                const context = await browser.newContext({
                    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                });
                return context;
            })
        );

        // Process batch in parallel
        const results = await Promise.all(
            batch.map(async (artwork, idx) => {
                const context = contexts[idx];
                const page = await context.newPage();

                try {
                    const enrichedArtwork = await enrichArtwork(page, artwork, platform);

                    // Track stats
                    if (enrichedArtwork.year && !artwork.year) yearCount++;
                    if (enrichedArtwork.dimensions && !artwork.dimensions) dimCount++;
                    if (enrichedArtwork.medium && !artwork.medium) mediumCount++;
                    if (enrichedArtwork.year || enrichedArtwork.dimensions || enrichedArtwork.medium) {
                        enrichedCount++;
                    }

                    return enrichedArtwork;
                } finally {
                    await page.close();
                    await context.close();
                }
            })
        );

        enrichedArtworks.push(...results);
        processed += batch.length;

        // Progress update
        const percent = Math.round((processed / total) * 100);
        console.log(`   📊 ${processed}/${total} (${percent}%) | Year: +${yearCount} | Dim: +${dimCount} | Medium: +${mediumCount}`);

        // Save periodically
        if (processed % CONFIG.saveInterval === 0 || processed === total) {
            const outputData = {
                ...data,
                artworks: enrichedArtworks,
                enrichedAt: new Date().toISOString()
            };
            fs.writeFileSync(filePath, JSON.stringify(outputData, null, 2));
            console.log(`   💾 Saved progress`);
        }

        // Delay between batches
        await delay(CONFIG.delayBetweenRequests);
    }

    console.log(`✅ Completed: ${collectionFile}`);
    console.log(`   Enriched: ${enrichedCount}/${total} | Year: ${yearCount} | Dim: ${dimCount} | Medium: ${mediumCount}`);
}

/**
 * Main function
 */
async function main() {
    console.log('🎨 French Museum Data Enrichment');
    console.log('================================\n');
    console.log(`Config: ${CONFIG.concurrentPages} parallel pages, ${CONFIG.timeout / 1000}s timeout\n`);

    const collections = [
        // Grenoble (Navigart)
        { file: 'musee-grenoble-paintings-collection.json', platform: 'navigart' },
        { file: 'musee-grenoble-drawings-collection.json', platform: 'navigart' },
        { file: 'musee-grenoble-photography-collection.json', platform: 'navigart' },
        // Lyon (Opacweb)
        { file: 'mba-lyon-collection.json', platform: 'opacweb' },
        // Bordeaux (Opacweb)
        { file: 'musba-bordeaux-paintings-collection.json', platform: 'opacweb' },
        { file: 'musba-bordeaux-drawings-collection.json', platform: 'opacweb' }
    ];

    const browser = await chromium.launch({
        headless: true,
        args: ['--disable-dev-shm-usage', '--no-sandbox']
    });

    try {
        for (const { file, platform } of collections) {
            await processCollection(browser, file, platform);
        }
    } finally {
        await browser.close();
    }

    console.log('\n🎉 Enrichment complete!');
}

// Run
main().catch(console.error);
