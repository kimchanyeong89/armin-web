const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://fine-arts-museum.be/fr/la-collection';
const OUTPUT_FILE = 'public/data/fine-arts-be-complete.json';
const STATUS_FILE = 'public/data/fine-arts-be-status.json';

// Configuration
const CONCURRENCY_DETAILS = 10;
const MAX_RETRIES = 3;
const TIMEOUT = 15000;

// Keywords for categorization
const TYPE_KEYWORDS = {
  'Painting': ['huile', 'toile', 'peinture', 'painting', 'oil', 'canvas', 'panneau', 'polyptyque', 'triptyque', 'tempera', 'bois', 'cuivre', 'panel', 'aquarelle', 'gouache', 'acrylique'],
  'Sculpture': ['sculpture', 'bronze', 'marbre', 'statue', 'terre cuite', 'plâtre', 'clay', 'marble', 'stone', 'pierre', 'relief'],
  'Drawing': ['dessin', 'encre', 'papier', 'crayon', 'fusain', 'estampe', 'gravure', 'ink', 'paper', 'charcoal', 'drawing', 'print', 'eau-forte', 'lithographie']
};

function inferType(description) {
    if (!description) return 'Artwork';
    const descLower = description.toLowerCase();
    for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
        if (keywords.some(k => descLower.includes(k))) return type;
    }
    return 'Artwork'; 
}

// State
let stats = {
    itemsFound: 0,
    itemsScraped: 0,
    errors: 0
};

const updateStatus = (extra = {}) => {
    try {
        fs.writeFileSync(STATUS_FILE, JSON.stringify({
            timestamp: new Date().toISOString(),
            count: stats.itemsFound,
            scraped: stats.itemsScraped,
            errors: stats.errors,
            ...extra
        }, null, 2));
    } catch (e) {}
};

// Network Helper
async function fetchHtml(url, retries = 0) {
    try {
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            },
            timeout: TIMEOUT
        });
        return data;
    } catch (e) {
        if (retries < MAX_RETRIES) {
            await new Promise(r => setTimeout(r, 2000)); // Slower retry
            return fetchHtml(url, retries + 1);
        }
        throw e;
    }
}

async function scrape() {
    console.log("Starting reliable CURL/Cheerio scraper (Letter-based)...");
    const { default: limit } = await import('p-limit');

    const allUrls = new Set();
    const headers = { 'User-Agent': 'Mozilla/5.0' };
    
    // Load existing URLs if available (RESUME CAPABILITY)
    const TEMP_URLS_FILE = 'public/data/fine-arts-be-urls-temp.json';
    if (fs.existsSync(TEMP_URLS_FILE)) {
        try {
            const saved = JSON.parse(fs.readFileSync(TEMP_URLS_FILE));
            saved.forEach(u => allUrls.add(u));
            console.log(`[Resume] Loaded ${allUrls.size} URLs from disk.`);
        } catch(e) { console.error("Could not load temp file", e); }
    }

    const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
    let startLetter = 'a';
    
    // Determine start letter based on status if we have URLs
    if (fs.existsSync(STATUS_FILE)) {
        try {
             const stat = JSON.parse(fs.readFileSync(STATUS_FILE));
             if (stat.letter && allUrls.size > 0) {
                 // If we have data, we can possibly resume from current letter or next
                 // Let's safe-restart from the current letter
                 startLetter = stat.letter;
                 console.log(`[Resume] Resuming from letter '${startLetter}'`);
             }
        } catch(e) {}
    }
    
    // Phase 1: Letter-based Discovery
    console.log(`Phase 1: Discovery (Letter Iteration) - Starting at ${startLetter}`);
    
    let skipping = true;
    for (const letter of letters) {
        if (skipping) {
            if (letter === startLetter) {
                skipping = false;
            } else {
                continue; 
            }
        }

        let page = 1;
        let consecutiveEmpty = 0;
        console.log(`\nScanning Letter: ${letter.toUpperCase()}`);
        
        while (consecutiveEmpty < 3) {
            try {
                // e.g. https://fine-arts-museum.be/fr/la-collection/letter/a?page=1
                const pageUrl = `${BASE_URL}/letter/${letter}?page=${page}`;
                
                const html = await fetchHtml(pageUrl);
                const $ = cheerio.load(html);
                
                let countOnPage = 0;
                $('a.artwork').each((_, el) => {
                    let href = $(el).attr('href');
                    if (href) {
                        if (!href.startsWith('http')) href = `https://fine-arts-museum.be${href}`;
                        
                        try {
                            const u = new URL(href);
                            u.search = '';
                            const cleanHref = u.toString();
                            
                            // Exclude non-slugs
                            if (cleanHref.endsWith('/la-collection') || cleanHref.endsWith('/la-collection/')) return;
                            if (cleanHref.includes('/letter/')) return;

                            if (!allUrls.has(cleanHref)) {
                                allUrls.add(cleanHref);
                                countOnPage++;
                            }
                        } catch(e) {}
                    }
                });
                
                if (countOnPage === 0) {
                    consecutiveEmpty++;
                    process.stdout.write('x');
                } else {
                    consecutiveEmpty = 0;
                    process.stdout.write('.');
                    stats.itemsFound = allUrls.size;
                }
                
                // Keep the user informed & SAVE PROGRESS
                if (page % 5 === 0 || countOnPage === 0) {
                   updateStatus({ letter, page: `L:${letter} P:${page}`, count: allUrls.size });
                   // Save temp URLs rarely (every 5 pages) to avoid IO spam, but ensure safety
                   fs.writeFileSync(TEMP_URLS_FILE, JSON.stringify(Array.from(allUrls)));
                }
                
                page++;
                
                // Safety limit per letter (e.g. some letters might be huge, but unlikely infinite)
                // Assuming max 200 pages per letter (200 * 20 = 4000 items)
                if (page > 300) { 
                    console.log(`Warning: Letter ${letter} exceeded 300 pages. Moving on.`);
                    break;
                }
                
            } catch (e) {
                console.error(`\nError ${letter} p${page}: ${e.message}`);
                // If 404, it might mean end of pages
                if (e.response && e.response.status === 404) {
                    consecutiveEmpty = 10; // Force break
                } else {
                    consecutiveEmpty++;
                }
            }
        }
        // Save at end of letter
        fs.writeFileSync(TEMP_URLS_FILE, JSON.stringify(Array.from(allUrls)));
        console.log(` -> Done. Total so far: ${allUrls.size}`);
    }
    
    console.log(`\n\nDiscovery Complete. Found ${allUrls.size} unique artworks.`);
    
    // Phase 2: Concurrent Detail Scraping
    console.log("Phase 2: Details (Concurrent)");
    const urls = Array.from(allUrls);
    const detailLimit = limit(CONCURRENCY_DETAILS);
    const finalData = [];
    
    stats.itemsFound = urls.length;
    stats.itemsScraped = 0;
    
    // Shuffle array to prevent hammering same server partition?
    
    const tasks = urls.map((url, index) => detailLimit(async () => {
        try {
            const html = await fetchHtml(url);
            const $ = cheerio.load(html);
            
            // ... (Same extraction logic as before) ...
            const title = $('h1').text().trim() || $('meta[property="og:title"]').attr('content');
            const image = $('meta[property="og:image"]').attr('content');
            const description = $('meta[property="og:description"]').attr('content');
            
            const metadata = {};
            $('.artwork-meta tr').each((_, row) => {
                const key = $(row).find('th').text().trim();
                const val = $(row).find('td').text().trim();
                if (key) metadata[key] = val;
            });
            
            const item = {
                source: 'Fine Arts Belgium',
                url,
                title,
                image,
                artist: metadata['Artiste'] || metadata['Artist'] || '',
                date: metadata['Date'] || '',
                medium: metadata['Technique'] || '',
                dimensions: metadata['Dimensions'] || '',
                inv: metadata['Numéro d\'inventaire'] || '',
                description,
                type: inferType(metadata['Technique'] || title)
            };
            
            finalData.push(item);
            stats.itemsScraped++;
            
            if (stats.itemsScraped % 20 === 0) {
                process.stdout.write('+');
                updateStatus({ page: "Details", last_item: title, last_type: item.type });
            }
        } catch (e) {
            stats.errors++;
            process.stdout.write('E');
        }
    }));
    
    await Promise.all(tasks);
    
    console.log(`\nWriting output...`);
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalData, null, 2));
    console.log("Done.");
}

scrape();
