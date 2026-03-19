const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const cheerio = require('cheerio');

const OUTPUT_FILE = path.resolve(__dirname, '../public/data/mah-collection.json');
const CONCURRENCY_DETAIL = 20;

// Mapping for Object Types
const TYPE_MAP = {
    'Peinture': 'Painting',
    'Dessin': 'Drawing',
    'Sculpture': 'Sculpture',
    'Arts appliqués': 'Applied Arts',
    'Archéologie': 'Archaeology'
};

/* SITEMAP STRATEGY
   The search page returns 500 errors to automated tools.
   However, sitemap.xml and detail pages are accessible (200 OK).
   We fetch all URLs from sitemaps, then scrape details in parallel.
*/

async function fetchSitemap(page) {
    const url = `https://www.mahmah.ch/sitemap.xml?page=${page}`;
    try {
        const cmd = `curl -s -L '${url}'`;
        return execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    } catch (e) {
        return null; // 404 or fails
    }
}

async function fetchHtml(url) {
    try {
        const cmd = `curl -s -L -A "Mozilla/5.0" '${url}'`;
        return execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    } catch (e) {
        return null;
    }
}

// Intentionally skip downloads. We only store source image URLs.

function extractDetails(html, url) {
    const $ = cheerio.load(html);

    let title = $('h1.collections-page-title span').text().trim() || $('h1').text().trim();
    let artist = $('.collections-page-meta .author').text().trim() || $('.field--name-field-n-main-author').text().trim();
    let date = $('.collections-page-meta .date .field--name-field-ph-date-display').text().trim() || 
               $('.field--name-field-n-main-dates').text().trim();
    let medium = $('.field--name-field-n-main-material-techniques').text().trim();
    let dimensions = $('.field--name-field-n-main-dimensions').text().trim();
    let rawInv = $('.field--name-field-n-main-inventory-number').text().trim() || 
                 $('.field--name-field-n-inventory-number').text().trim();
    const id = rawInv.replace(/^NUMÉRO D'INVENTAIRE\s*/i, '').trim() || `mah-${Math.random().toString(36).substr(2, 9)}`;

    let rawType = $('.field--name-field-n-artwork-domain').text().trim();
    let objType = 'Painting'; 
    if (rawType) {
        const typeText = rawType.replace(/^Collection\(s\)\s*/i, '').trim();
        objType = TYPE_MAP[typeText] || typeText;
    }

    let imageUrl = '';
    const settingsJson = $('script[data-drupal-selector="drupal-settings-json"]').html();
    if (settingsJson) {
        try {
            const json = JSON.parse(settingsJson);
            if (json.mahHdImage) {
                const keys = Object.keys(json.mahHdImage);
                const osdKey = keys.find(k => k.startsWith('openSeaDragon'));
                if (osdKey && json.mahHdImage[osdKey]) {
                    const iiifId = json.mahHdImage[osdKey]['@id'];
                    if (iiifId) imageUrl = `${iiifId}/full/full/0/default.jpg`;
                }
            }
        } catch (e) {}
    }
    if (!imageUrl) {
        const imgSrc = $('.field--name-field-n-main-hd-picture img').attr('src');
        if (imgSrc) imageUrl = imgSrc;
    }

    return {
        id,
        title,
        artist,
        date,
        medium,
        dimensions,
        classification: objType,
        objType,
        imageUrl,
        source: url,
        collection: "Musée d'Art et d'Histoire, Genève"
    };
}

async function scrape() {
    console.log('Starting Optimized MAH Scraper (SITEMAP Strategy)...');
    
    let pLimitFn;
    try {
        const pLimitModule = await import('p-limit');
        pLimitFn = pLimitModule.default;
    } catch (e) {
        process.exit(1);
    }
    const detailLimit = pLimitFn(CONCURRENCY_DETAIL);

    const collectedItems = [];
    const allDetailUrls = [];
    const visitedUrls = new Set();

    // --- PHASE 1: HARVEST URLS FROM SITEMAP ---
    console.log('Phase 1: Harvesting URLs from Sitemap...');
    
    // We try many pages until it seems we are done
    let pageNum = 1;

    while (true) {
        console.log(`Checking Sitemap Page ${pageNum}...`);
        const xml = await fetchSitemap(pageNum);
        
        // If curl returns empty or html error page, stop
        if (!xml || xml.trim().length === 0 || xml.includes('Erreur 500')) {
             console.log('End of sitemaps or error.');
             break;
        }

        const urls = xml.match(/<loc>(.*?)<\/loc>/g);
        if (!urls || urls.length === 0) {
            console.log('No URLs in this sitemap. Stopping.');
            break;
        }

        let added = 0;
        urls.forEach(tag => {
            const url = tag.replace(/<\/?loc>/g, '');
            if (url.includes('/collection/oeuvres/') && !visitedUrls.has(url)) {
                visitedUrls.add(url);
                allDetailUrls.push(url);
                added++;
            }
        });

        console.log(`  > Found ${added} artwork URLs.`);
        
        // If we found 0 artwork urls but sitemap had other urls, maybe keep going?
        // But usually sitemaps are filled sequentially.
        // We'll limit to 50 pages just in case.
        
        pageNum++;
        if (pageNum > 50) break; 
    }
    
    console.log(`\nTotal URLs found in Sitemap: ${allDetailUrls.length}`);
    if (allDetailUrls.length === 0) {
        console.log('No URLs found. Exiting.');
        process.exit(1);
    }

    // --- PHASE 2: DETAILS ---
    console.log('\nPhase 2: Scraping details and images (Concurrent)...');
    
    let completed = 0;
    
    const tasks = allDetailUrls.map(url => detailLimit(async () => {
        try {
            const html = await fetchHtml(url);
            if (!html || html.includes('Erreur 500')) return;

            const item = extractDetails(html, url);

            // Filter for Painting to match "Collect all paintings" request
            // We use inclusive filtering: Painting or undefined (default is Painting in extraction)
            
            if (item.objType === 'Painting' && item.title && item.imageUrl) {
                item.image = item.imageUrl;
                collectedItems.push(item);
            }
        } catch (err) {
             // ignore
        } finally {
            completed++;
            if (completed % 20 === 0) {
                process.stdout.write(`\rProgress: ${completed}/${allDetailUrls.length} | Collected: ${collectedItems.length}`);
            }
        }
    }));

    await Promise.all(tasks);
    
    console.log('\nWriting JSON file...');
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collectedItems, null, 2));
    console.log(`Done. Saved ${collectedItems.length} items to ${OUTPUT_FILE}`);
}

scrape();