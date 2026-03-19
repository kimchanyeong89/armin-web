const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

puppeteer.use(StealthPlugin());

const BASE_URL = "https://www.mfab.hu/artworks/";
// Restoring user requested filters
const PARAMS = "?per_page=24&show_only=withimage&artwork_type=computer-print,film,painting,photograph,print,prints-and-drawings,video"; 
const OUTPUT_FILE = 'public/data/mfab-collection-full.json';
const TEMP_URLS_FILE = 'scripts/mfab-recovered-urls.json';

// Helper to limit concurrency
const pLimit = async () => {
    const { default: limit } = await import('p-limit');
    return limit;
};

async function getLinks() {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    const links = new Set();
    
    // Set viewport to trigger potentially responsive layouts
    await page.setViewport({ width: 1280, height: 800 });

    console.log('Phase 1: Harvesting URLs...');

    let pageNum = 1;
    let hasNext = true;

    // Attempt to resume
    if (fs.existsSync(TEMP_URLS_FILE)) {
        try {
            const savedData = JSON.parse(fs.readFileSync(TEMP_URLS_FILE, 'utf8'));
            if (savedData.links && Array.isArray(savedData.links)) {
                savedData.links.forEach(l => links.add(l));
                if (savedData.lastPage) {
                    pageNum = savedData.lastPage + 1;
                }
                console.log(`Resuming from page ${pageNum}. Loaded ${links.size} existing links.`);
            }
        } catch (e) {
            console.error('Failed to load recovery file:', e.message);
        }
    }

    while (hasNext) {
        const url = `${BASE_URL}${PARAMS}&current_page=${pageNum}`;
        console.log(`  Scraping page ${pageNum}: ${url}`);
        
        try {
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
            
            const pageData = await page.evaluate(() => {
                const anchors = Array.from(document.querySelectorAll('a'));
                const artLinks = anchors
                    .map(a => a.href)
                    .filter(href => href.includes('/artworks/'));
                
                return {
                    totalAnchors: anchors.length,
                    artLinks: artLinks
                };
            });
             
            // Filter strictly in Node to be safe/visible
            const validLinks = pageData.artLinks.filter(href => {
                // Must have ID. e.g. /artworks/123/ or /artworks/123
                return /\/artworks\/\d+\/?$/.test(href);
            });

            console.log(`    Total anchors: ${pageData.totalAnchors}`);
            console.log(`    Potential artwork links: ${pageData.artLinks.length}`);
            console.log(`    Valid ID links: ${validLinks.length}`);
            
            if (validLinks.length === 0) {
                console.log('    No valid links found. Ending pagination.');
                hasNext = false;
            } else {
                validLinks.forEach(l => links.add(l));
                
                // Save recovery data
                fs.writeFileSync(TEMP_URLS_FILE, JSON.stringify({
                    lastPage: pageNum,
                    links: Array.from(links)
                }, null, 2));

                // Optimization: stop if we see repeating urls or empty results? 
                // Relying on validLinks === 0 is safest for the last page.
                
                // Optional: Check if we are seeing links we've already seen?
                // The Set handles uniqueness, but we need to know if we are looping.
                // Assuming pagination works correctly.
                pageNum++;
            }

        } catch (e) {
            console.error(`    Error on page ${pageNum}:`, e.message);
            // If error is 404, we are done
            if (e.message.includes('404')) {
                hasNext = false; // Stop
            } else {
                // Retry checking
                console.log('    Retrying page in 5 seconds due to error...');
                await new Promise(r => setTimeout(r, 5000));
                
                try {
                     // Simple retry once
                     await page.reload({waitUntil: 'networkidle2'});
                } catch(retryErr) {
                     console.log('    Retry failed, skipping page.');
                     pageNum++; 
                }

                if (pageNum > 1000) hasNext = false; // Safety break
            }
        }
    }

    await browser.close();
    return Array.from(links);
}

async function scrapeDetails(urls) {
    if (urls.length === 0) return [];

    console.log(`Phase 2: Scraping details for ${urls.length} items...`);
    const limit = (await pLimit())(5); 
    
    const tasks = urls.map((url, index) => limit(async () => {
        try {
            const { data } = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });
            const $ = cheerio.load(data);
            
            const title = $('h1').first().text().trim();
            const image = $('meta[property="og:image"]').attr('content');
            
            let niceArtist = '';
            let date = '';
            let medium = '';
            let dimensions = '';
            let inventory = '';
            let objectType = '';

            $('th').each((i, el) => {
                const key = $(el).text().trim();
                const val = $(el).next('td').text().trim();
                
                if (key.includes('Artist')) {
                     // Complex artist extraction
                     // Check if there is an <a> inside the TD
                     const link = $(el).next('td').find('a').first();
                     if (link.length) {
                         niceArtist = link.text().trim();
                     } else {
                         // Fallback to splitting text
                         niceArtist = val.split(/,|\n/)[0].trim();
                     }
                }
                else if (key.includes('Date')) date = val;
                else if (key.includes('Medium')) medium = val;
                else if (key.includes('Dimensions')) dimensions = val;
                else if (key.includes('Inventory')) inventory = val;
                else if (key.toLowerCase().includes('object type')) objectType = val;
            });

            // Infer category
            let category = 'Artwork';
            
            // Prefer explicit Object Type if available
            if (objectType) {
                // Capitalize first letter
                category = objectType.charAt(0).toUpperCase() + objectType.slice(1);
            } else {
                // Fallback to Medium inference
                const m = (medium || '').toLowerCase();
                if (m.includes('oil') || m.includes('tempera') || m.includes('canvas') || m.includes('panel')) category = 'Painting';
                else if (m.includes('paper') || m.includes('ink') || m.includes('chalk') || m.includes('drawing')) category = 'Drawing';
                else if (m.includes('print') || m.includes('etching') || m.includes('engraving')) category = 'Print';
                else if (m.includes('photo')) category = 'Photograph';
                else if (m.includes('sculpture') || m.includes('bronze') || m.includes('marble')) category = 'Sculpture';
            }

            if (!niceArtist) niceArtist = 'Unknown';

            return {
                id: url.split('/').filter(Boolean).pop(),
                title: title,
                artist: niceArtist,
                dateStr: date,
                year: parseInt(date.match(/\d{4}/)?.[0] || '0'),
                medium: medium,
                dimensions: dimensions,
                image: image,
                url: url,
                classification: category
            };

        } catch (e) {
            console.error(`  Error scraping ${url}:`, e.message);
            return null;
        }
    }));

    const results = await Promise.all(tasks);
    return results.filter(Boolean);
}

async function main() {
    const urls = await getLinks();
    const uniqueUrls = [...new Set(urls)];
    console.log(`Unique URLs collection: ${uniqueUrls.length}`);
    
    if (uniqueUrls.length > 0) {
        const data = await scrapeDetails(uniqueUrls);
        
        const output = {
            scrapedAt: new Date().toISOString(),
            count: data.length,
            artworks: data
        };
        
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
        console.log(`Saved ${data.length} items to ${OUTPUT_FILE}`);
    } else {
        console.log('No URLs found. Exiting.');
    }
}

main();
