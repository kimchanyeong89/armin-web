/**
 * Carnavalet Museum Essential Artworks Scraper
 * Scrapes the curated "essential works" collection from Musée Carnavalet
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.carnavalet.paris.fr';
const COLLECTIONS_URL = 'https://www.carnavalet.paris.fr/en/collections/les-oeuvres-incontournables';
const OUTPUT_FILE = path.join(__dirname, '../public/data/carnavalet-collection.json');

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function loadAllArtworks(page) {
    console.log('📜 Loading all artworks by clicking "More" button...');

    let clicks = 0;
    while (clicks < 30) {
        const moreButton = await page.$('.use-ajax.button.btn.btn-link');
        if (!moreButton) break;

        const isVisible = await moreButton.isVisible();
        if (!isVisible) break;

        await moreButton.scrollIntoViewIfNeeded();
        await moreButton.click();
        await sleep(2000);
        clicks++;
        console.log(`   Clicked ${clicks} times...`);
    }

    console.log(`   ✅ Finished loading (${clicks} clicks)`);
    return clicks;
}

async function extractArtworkLinks(page) {
    return await page.evaluate(() => {
        const artworks = [];
        const links = document.querySelectorAll('a[href*="/collections/"]');
        const excludeTexts = ['Collections', 'The essential artworks', 'Publications', 'Visit', 'The museum', 'Exhibitions', 'Support', 'Home', 'Online collections'];

        links.forEach(link => {
            const text = link.innerText.trim();
            const href = link.href;

            // Skip navigation links and empty texts
            if (!text || excludeTexts.some(e => text === e)) return;
            // Skip links that are just the collections landing page
            if (href.endsWith('/collections') || href.endsWith('/les-oeuvres-incontournables')) return;

            // Find associated image
            let image = null;
            let parent = link.parentElement;
            for (let i = 0; i < 5; i++) {
                if (!parent) break;
                const img = parent.querySelector('img');
                if (img) {
                    image = img.src;
                    break;
                }
                parent = parent.parentElement;
            }

            // Avoid duplicates
            if (!artworks.find(a => a.url === href)) {
                artworks.push({
                    titleArtist: text,
                    url: href,
                    image: image
                });
            }
        });

        return artworks;
    });
}

async function scrapeArtworkDetail(page, url, index) {
    try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        await sleep(1500);

        const data = await page.evaluate(() => {
            // Get title from h1 or og:title
            const h1 = document.querySelector('h1');
            const ogTitle = document.querySelector('meta[property="og:title"]')?.content || '';
            const title = h1?.innerText?.trim() || ogTitle.split('|')[0].trim() || '';

            // Get image from og:image or main image
            const ogImage = document.querySelector('meta[property="og:image"]')?.content || '';
            const mainImg = document.querySelector('.work-image img, article img, .field--name-field-image img');
            const image = ogImage || mainImg?.src || '';

            // Extract artist from title if present (format: "Title, Artist Name (dates)")
            let artist = 'Unknown';
            let cleanTitle = title;

            // Try to find artist in the page content
            const artistEl = document.querySelector('.field--name-field-auteur, .artist-name, .author');
            if (artistEl) {
                artist = artistEl.innerText.trim();
            }

            // If title contains comma and parentheses with dates, parse it
            // Format: "Portrait of Louis XIV, Antoine Coysevox (1640-1720)"
            const titleParts = title.split(',');
            if (titleParts.length >= 2) {
                const possibleArtist = titleParts[titleParts.length - 1].trim();
                // Check if it matches artist pattern (name with optional dates)
                if (possibleArtist.match(/\([0-9-]+\)/) || possibleArtist.match(/^[A-Z][a-z]+(\s+[A-Z][a-z]+)+/)) {
                    artist = possibleArtist.replace(/\([0-9-]+\)/g, '').trim();
                    cleanTitle = titleParts.slice(0, -1).join(',').trim();
                }
            }

            // Try to get date/year
            let year = null;
            let date = '';
            const dateEl = document.querySelector('.field--name-field-date-creation, .date, .field--name-field-datation');
            if (dateEl) {
                date = dateEl.innerText.trim();
                const yearMatch = date.match(/(\d{4})/);
                if (yearMatch) year = parseInt(yearMatch[1]);
            }

            // Get medium/technique
            let medium = '';
            const mediumEl = document.querySelector('.field--name-field-technique, .technique, .field--name-body');
            if (mediumEl) {
                medium = mediumEl.innerText.trim().substring(0, 200);
            }

            return {
                title: cleanTitle || title,
                artist,
                year,
                date,
                image,
                medium
            };
        });

        return {
            id: `carnavalet-${index + 1}`,
            title: data.title || 'Untitled',
            artist: data.artist || 'Unknown',
            year: data.year,
            date: data.date,
            image: data.image,
            medium: data.medium,
            sourceUrl: url
        };
    } catch (err) {
        console.error(`   ❌ Failed to scrape ${url}: ${err.message}`);
        return null;
    }
}

async function main() {
    console.log('='.repeat(60));
    console.log('🏛️  Carnavalet Museum Essential Artworks Scraper');
    console.log('='.repeat(60));

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    // 1. Go to the essential artworks page
    console.log('\n📍 Navigating to essential artworks page...');
    await page.goto(COLLECTIONS_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await sleep(3000);

    // 2. Load all artworks by clicking "More" button
    await loadAllArtworks(page);

    // 3. Extract all artwork links
    console.log('\n🔗 Extracting artwork links...');
    const artworkLinks = await extractArtworkLinks(page);
    console.log(`   Found ${artworkLinks.length} artworks`);

    if (artworkLinks.length === 0) {
        console.log('❌ No artworks found! Check the page structure.');
        await browser.close();
        return;
    }

    // 4. Scrape each artwork detail page
    console.log('\n🖼️  Scraping artwork details...\n');
    const artworks = [];
    let success = 0;
    let failed = 0;

    for (let i = 0; i < artworkLinks.length; i++) {
        const link = artworkLinks[i];

        // Parse title and artist from the link text
        let title = link.titleArtist;
        let artist = 'Unknown';

        // Try to parse artist from text: "Title, Artist Name (dates)"
        const parts = link.titleArtist.split(',');
        if (parts.length >= 2) {
            const lastPart = parts[parts.length - 1].trim();
            // Check if it looks like an artist name (has parentheses with dates or is a proper name)
            if (lastPart.match(/\(\d+[-–]\d+\)/) || lastPart.match(/^[A-Z][a-zé]+\s+[A-Z]/)) {
                artist = lastPart.replace(/\s*\(\d+[-–]?\d*\)/g, '').trim();
                title = parts.slice(0, -1).join(',').trim();
            }
        }

        // Get higher resolution image if available
        let image = link.image;
        if (image) {
            // Try to get a higher res version
            image = image.replace('/styles/640_x/', '/styles/1200_x/').replace('/styles/thumbnail/', '/styles/1200_x/');
        }

        // For now, use the data from the list, but try to get more from detail page
        const detailData = await scrapeArtworkDetail(page, link.url, i);

        const artwork = {
            id: `carnavalet-${i + 1}`,
            title: detailData?.title || title,
            artist: detailData?.artist !== 'Unknown' ? detailData.artist : artist,
            year: detailData?.year || null,
            date: detailData?.date || '',
            image: detailData?.image || image,
            medium: detailData?.medium || '',
            sourceUrl: link.url
        };

        if (artwork.image) {
            artworks.push(artwork);
            success++;
        } else {
            failed++;
        }

        if ((i + 1) % 5 === 0 || i === artworkLinks.length - 1) {
            console.log(`   Progress: ${i + 1}/${artworkLinks.length} | Success: ${success} | Failed: ${failed}`);
        }
    }

    await browser.close();

    // 5. Save results
    const result = {
        museum: 'Musée Carnavalet - Histoire de Paris',
        museumId: 'carnavalet',
        location: 'Paris, France',
        collectionName: 'The Essential Artworks',
        scrapedAt: new Date().toISOString(),
        totalObjects: artworks.length,
        objects: artworks
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
    console.log(`\n💾 Saved to ${OUTPUT_FILE}`);
    console.log(`   Total artworks: ${artworks.length}`);
    console.log(`   Success: ${success} | Failed: ${failed}`);

    // Show sample
    console.log('\n📋 Sample artworks:');
    artworks.slice(0, 3).forEach(a => {
        console.log(`   - ${a.title} by ${a.artist}`);
    });
}

main().catch(console.error);
