const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const cheerio = require('cheerio');

const OUTPUT_FILE = path.resolve(__dirname, '../public/data/mah-collection.json');
const CONCURRENCY = 2; // Low concurrency to avoid bot detection
const TARGET_URL_TEMPLATE = "https://www.mahmah.ch/collection/recherche?f%5B0%5D=artwork_property%3A%C5%92uvres%20avec%20images&f%5B1%5D=collections%3A57484&page=";

// Mapping for Object Types
const TYPE_MAP = {
    'Peinture': 'Painting',
    'Dessin': 'Drawing',
    'Sculpture': 'Sculpture',
    'Arts appliqués': 'Applied Arts',
    'Archéologie': 'Archaeology',
    'Auxiliaire': 'Auxiliary',
    'Imprimé': 'Print',
    'Manuscrit': 'Manuscript',
    'Photographie': 'Photography'
};

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchHtml(url) {
    try {
        // Use -L for redirects, -s for silent
        // Use a realistic user agent
        const cmd = `curl -s -L -H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8" -H "Accept-Language: en-US,en;q=0.5" -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0" '${url}'`;
        // Increase buffer for large pages
        return execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    } catch (e) {
        // console.error(`Failed to fetch ${url}`, e.message);
        return null;
    }
}

async function downloadImage(url, filepath) {
    try {
        const cmd = `curl -s -L -A "Mozilla/5.0" -o "${filepath}" '${url}'`;
        execSync(cmd, { stdio: 'ignore' });
    } catch (e) {
        // ignore
    }
}

function extractDetails(html, url) {
    if (!html) return null;
    const $ = cheerio.load(html);

    let title = $('h1.collections-page-title span').text().trim() || $('h1').text().trim();
    
    let artist = $('.collections-page-meta .author').text().trim() || 
                 $('.field--name-field-n-main-author').text().trim();
                 
    let date = $('.collections-page-meta .date .field--name-field-ph-date-display').text().trim() || 
               $('.field--name-field-n-main-dates').text().trim();
               
    let medium = $('.field--name-field-n-main-material-techniques').text().trim();
    
    let dimensions = $('.field--name-field-n-main-dimensions').text().trim() || 
                     $('.field--name-field-n-dimensions').text().trim();

    // Inventory ID Cleaning
    let rawInv = $('.field--name-field-n-main-inventory-number').text().trim() || 
                 $('.field--name-field-n-inventory-number').text().trim();
    const id = rawInv.replace(/^NUMÉRO D'INVENTAIRE\s*/i, '').trim() || `mah-${Math.random().toString(36).substr(2, 9)}`;

    // Object Type Extraction & Mapping
    let rawType = $('.field--name-field-n-artwork-domain').text().trim();
    let objType = 'Painting'; // Fallback
    if (rawType) {
        const typeText = rawType.replace(/^Collection\(s\)\s*/i, '').trim();
        objType = TYPE_MAP[typeText] || typeText;
    }

    // High-Res Image Extraction via IIIF
    let imageUrl = '';
    const settingsJson = $('script[data-drupal-selector="drupal-settings-json"]').html();
    
    if (settingsJson) {
        try {
            const json = JSON.parse(settingsJson);
            if (json.mahHdImage) {
                // Find key starting with openSeaDragon
                const keys = Object.keys(json.mahHdImage);
                const osdKey = keys.find(k => k.startsWith('openSeaDragon'));
                if (osdKey && json.mahHdImage[osdKey]) {
                    const iiifId = json.mahHdImage[osdKey]['@id']; // e.g. .../info.json
                    if (iiifId) {
                        // Transform IIIF info URL to image download URL
                        // Usually: remove '/info.json' and append '/full/full/0/default.jpg'
                        // Check if it ends in info.json
                         imageUrl = iiifId.replace('/info.json', '') + '/full/full/0/default.jpg';
                    }
                }
            }
        } catch (e) {}
    }
    
    // Fallback Image
    if (!imageUrl) {
        const imgSrc = $('.field--name-field-n-main-hd-picture img').attr('src');
        if (imgSrc) {
            imageUrl = imgSrc.startsWith('/') ? `https://www.mahmah.ch${imgSrc}` : imgSrc;
        }
    }

    if (!title || !imageUrl) return null;

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

// Simple async pool
async function mapLimit(items, limit, fn) {
    const results = [];
    const executing = [];
    let count = 0;
    for (const item of items) {
        const p = Promise.resolve().then(() => fn(item, count++));
        results.push(p);
        const e = p.then(() => executing.splice(executing.indexOf(e), 1));
        executing.push(e);
        if (executing.length >= limit) await Promise.race(executing);
    }
    return Promise.all(results);
}

async function scrape() {
    console.log('Starting Optimized MAH Scraper (Specific Collection)...');

    // --- PHASE 1: COLLECT URLs ---
    console.log('--- Phase 1: Collecting URLs ---');
    const allUrls = new Set();
    let page = 0;
    let keepGoing = true;

    while (keepGoing) {
        const searchUrl = `${TARGET_URL_TEMPLATE}${page}`;
        process.stdout.write(`Fetching Search Page ${page}... `);
        
        // Random delay 1-3s
        await sleep(1000 + Math.random() * 2000);

        const html = await fetchHtml(searchUrl);
        if (!html) {
            console.log('Failed to fetch page. Stopping.');
            break;
        }

        // Extract JSON from script tag
        const match = html.match(/data-drupal-selector="drupal-settings-json">([^<]+)<\/script>/);
        if (match) {
            try {
                const json = JSON.parse(match[1]);
                const results = json.artwork_navigator?.search_results || [];
                
                if (results.length === 0) {
                    console.log('No more results.');
                    keepGoing = false;
                } else {
                    console.log(`Found ${results.length} items.`);
                    results.forEach(r => {
                        if (r.url) {
                            // URL in JSON is usually absolute or relative?
                            // Checked debug: "https:\/\/www.mahmah.ch\/..."
                            // It is absolute and escaped. JSON.parse handles escaping.
                            // But just in case, ensure valid URL.
                            allUrls.add(r.url); 
                        }
                    });
                    page++;
                }

                if (results.length < 20) {
                    // Typical page size is 20, if less, it's the last page
                    keepGoing = false;
                }
                
            } catch (e) {
                console.log('JSON parse error:', e.message);
                keepGoing = false;
            }
        } else {
            console.log('No drupal-settings-json found. Layout might have changed or bot detection.');
            // Fallback: Use cheerio to find links
            const $ = cheerio.load(html);
            const links = $('a[href*="/collection/oeuvres/"]').map((i, el) => $(el).attr('href')).get();
            if (links.length > 0) {
                 console.log(`Found ${links.length} links via DOM.`);
                 links.forEach(l => {
                    const full = l.startsWith('http') ? l : `https://www.mahmah.ch${l}`;
                    allUrls.add(full);
                 });
                 page++;
            } else {
                console.log('No links found.');
                keepGoing = false;
            }
        }
    }

    const uniqueUrls = Array.from(allUrls);
    console.log(`\nTotal Unique URLs found: ${uniqueUrls.length}`);
    
    // Convert to JSON friendly format initial
    // Don't save URL list, we'll process them directly.

    // --- PHASE 2: SCRAPE DETAILS ---
    console.log('\n--- Phase 2: Scraping Details ---');
    
    // Load existing if any (Resume capability)
    let collectedData = [];
    if (fs.existsSync(OUTPUT_FILE)) {
        try {
            collectedData = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
            console.log(`Loaded ${collectedData.length} existing items.`);
        } catch (e) {
            console.log('Could not load existing data, starting fresh.');
        }
    }
    const processedUrls = new Set(collectedData.map(d => d.source));
    const pendingUrls = uniqueUrls.filter(u => !processedUrls.has(u));

    console.log(`Resuming... ${pendingUrls.length} items left to process.`);
    const errors = [];

    await mapLimit(pendingUrls, CONCURRENCY, async (url, idx) => {
        const percent = ((idx + 1) / pendingUrls.length * 100).toFixed(1);
        process.stdout.write(`[${idx + 1}/${pendingUrls.length}] ${percent}% `);
        
        await sleep(500 + Math.random() * 1000); // Delay between details

        try {
            const detailHtml = await fetchHtml(url);
            const data = extractDetails(detailHtml, url);
            
            if (data) {
                // Download Image
                if (data.imageUrl) {
                    const ext = data.imageUrl.includes('jpg') ? 'jpg' : 'png';
                    // Sanitize filename
                    const safeId = data.id.replace(/[^a-z0-9]/gi, '_');
                    const localFilename = `mah-${safeId}.${ext}`;
                    const localPath = path.join(__dirname, '../public/images/mah', localFilename);
                    
                    // Create dir
                    const dir = path.dirname(localPath);
                    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                    
                    if (!fs.existsSync(localPath)) {
                        await downloadImage(data.imageUrl, localPath);
                    }
                    data.image = `/images/mah/${localFilename}`; // Public path
                }
                
                collectedData.push(data);
                console.log(`Saved: ${data.title.substring(0, 30)}...`);
            } else {
                console.log(`Skipped (Missing Metadata): ${url}`);
            }
        } catch (e) {
            console.log(`Error: ${e.message}`);
            errors.push(url);
        }

        // Periodic Save
        if (collectedData.length % 50 === 0) {
            fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collectedData, null, 2));
        }
    });

    console.log('--- DONE ---');
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collectedData, null, 2));
    console.log(`Saved ${collectedData.length} items to ${OUTPUT_FILE}`);
}

scrape();
