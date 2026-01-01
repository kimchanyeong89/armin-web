/**
 * Enrichment Scraper for French Museums (Excluding Grenoble Paintings)
 * 
 * Enriches: Grenoble Drawings, Grenoble Photography, Lyon, Bordeaux
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../public/data');

const CONFIG = {
    concurrentPages: 6,
    delayBetweenRequests: 400,
    timeout: 20000,
    navigartWait: 4000,
    saveInterval: 100
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Parse Navigart detail page
 */
async function parseNavigartDetail(page) {
    try {
        await page.waitForSelector('.details', { timeout: CONFIG.timeout });
        await delay(CONFIG.navigartWait);

        return await page.evaluate(() => {
            const result = { year: null, dimensions: null, medium: null, artist: null, artworkType: null };

            const artistEl = document.querySelector('.single-artwork-authors-ua p');
            if (artistEl) result.artist = artistEl.innerText.trim();

            const titleEl = document.querySelector('.single-artwork-title-ua');
            if (titleEl) {
                const titleLi = titleEl.closest('li');
                if (titleLi) {
                    const trustedDivs = titleLi.querySelectorAll('.trusted');
                    if (trustedDivs.length >= 2) {
                        const yearText = trustedDivs[1].querySelector('p')?.innerText?.trim();
                        if (yearText && /\d{4}/.test(yearText)) result.year = yearText;
                    }
                }
            }

            const detailItems = document.querySelectorAll('.details > li');
            if (detailItems.length >= 5) {
                const infoLi = detailItems[4];
                const trustedParagraphs = infoLi.querySelectorAll('.trusted p');

                trustedParagraphs.forEach((p, idx) => {
                    const text = p.innerText.trim();
                    if (idx === 0 && ['peinture', 'dessin', 'photographie', 'sculpture'].some(t => text.toLowerCase().includes(t))) {
                        result.artworkType = text;
                    }
                    if (idx === 1 && text.length > 3) result.medium = text;
                    if (text.toLowerCase().includes('cm')) {
                        result.dimensions = result.dimensions ? result.dimensions + ' ; ' + text : text;
                    }
                });
            }

            return result;
        });
    } catch (e) {
        return { year: null, dimensions: null, medium: null, artist: null };
    }
}

/**
 * Parse Opacweb detail page
 */
async function parseOpacwebDetail(page) {
    try {
        await page.waitForSelector('.notice-detail', { timeout: CONFIG.timeout });
        await delay(2000);

        return await page.evaluate(() => {
            const result = { year: null, dimensions: null, medium: null, artist: null };

            const items = document.querySelectorAll('.notice-detail-item');
            items.forEach(item => {
                const labelEl = item.querySelector('.notice-detail-item-label');
                const valueEl = item.querySelector('.notice-detail-item-value');
                if (!labelEl || !valueEl) return;

                const label = labelEl.innerText.trim().toLowerCase();
                const value = valueEl.innerText.trim();

                if (label.includes('auteur')) result.artist = value;
                if (label.includes('date') || label.includes('époque')) {
                    const yearMatch = value.match(/(\d{4})/);
                    result.year = yearMatch ? yearMatch[1] : value;
                }
                if (label.includes('mesures') || label.includes('dimension')) {
                    const hMatch = value.match(/hauteur\s*(?:en\s*cm\s*)?:\s*([\d,\.]+)/i);
                    const wMatch = value.match(/largeur\s*(?:en\s*cm\s*)?:\s*([\d,\.]+)/i);
                    result.dimensions = (hMatch && wMatch) ? `${hMatch[1]} × ${wMatch[1]} cm` : value;
                }
                if (label.includes('matière') || label.includes('technique')) result.medium = value;
            });

            return result;
        });
    } catch (e) {
        return { year: null, dimensions: null, medium: null, artist: null };
    }
}

async function enrichArtwork(page, artwork, platform) {
    if (!artwork.sourceUrl) return artwork;

    try {
        await page.goto(artwork.sourceUrl, { waitUntil: 'domcontentloaded', timeout: CONFIG.timeout });
        const enrichedData = platform === 'navigart' ? await parseNavigartDetail(page) : await parseOpacwebDetail(page);

        return {
            ...artwork,
            year: artwork.year || enrichedData.year,
            dimensions: artwork.dimensions || enrichedData.dimensions,
            medium: enrichedData.medium || artwork.medium,
            artist: enrichedData.artist || artwork.artist,
            artworkType: enrichedData.artworkType || artwork.artworkType
        };
    } catch (e) {
        return artwork;
    }
}

async function processCollection(browser, collectionFile, platform) {
    const filePath = path.join(DATA_DIR, collectionFile);
    if (!fs.existsSync(filePath)) return;

    console.log(`\n📦 ${collectionFile}`);

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const artworks = data.artworks || [];
    console.log(`   Total: ${artworks.length}`);

    let processed = 0, yearCount = 0, dimCount = 0;
    const enrichedArtworks = [];

    const batchSize = CONFIG.concurrentPages;

    for (let i = 0; i < artworks.length; i += batchSize) {
        const batch = artworks.slice(i, i + batchSize);

        const contexts = await Promise.all(batch.map(() => browser.newContext({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        })));

        const results = await Promise.all(batch.map(async (artwork, idx) => {
            const context = contexts[idx];
            const page = await context.newPage();
            try {
                const enriched = await enrichArtwork(page, artwork, platform);
                if (enriched.year && !artwork.year) yearCount++;
                if (enriched.dimensions && !artwork.dimensions) dimCount++;
                return enriched;
            } finally {
                await page.close();
                await context.close();
            }
        }));

        enrichedArtworks.push(...results);
        processed += batch.length;

        const pct = Math.round((processed / artworks.length) * 100);
        console.log(`   ${processed}/${artworks.length} (${pct}%) | Year: +${yearCount} | Dim: +${dimCount}`);

        if (processed % CONFIG.saveInterval === 0 || processed === artworks.length) {
            fs.writeFileSync(filePath, JSON.stringify({ ...data, artworks: enrichedArtworks, enrichedAt: new Date().toISOString() }, null, 2));
        }

        await delay(CONFIG.delayBetweenRequests);
    }

    console.log(`✅ Done: ${collectionFile}`);
}

async function main() {
    console.log('🎨 Enriching French Museum Collections\n');

    const collections = [
        { file: 'musee-grenoble-drawings-collection.json', platform: 'navigart' },
        { file: 'musee-grenoble-photography-collection.json', platform: 'navigart' },
        { file: 'mba-lyon-collection.json', platform: 'opacweb' },
        { file: 'musba-bordeaux-paintings-collection.json', platform: 'opacweb' },
        { file: 'musba-bordeaux-drawings-collection.json', platform: 'opacweb' }
    ];

    const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage', '--no-sandbox'] });

    try {
        for (const { file, platform } of collections) {
            await processCollection(browser, file, platform);
        }
    } finally {
        await browser.close();
    }

    console.log('\n🎉 All collections enriched!');
}

main().catch(console.error);
