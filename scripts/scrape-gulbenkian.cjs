const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const OUTPUT_FILE = path.join(__dirname, '../public/data/gulbenkian-collection.json');
const TARGET_COUNT = 300; // Increased to cover all items (~220)
const BASE_URL = 'https://gulbenkian.pt/museu/en/works/';

async function scrapeGulbenkian() {
    console.log('🚀 Starting Gulbenkian scraper (Full Mode)...');
    
    // Launch browser
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    let collectedItems = [];
    let currentPage = 1;
    let lastPageFirstLink = '';
    let ConsecutiveEmptyPages = 0;

    // Create dir if not exists
    const dir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(dir)){
        fs.mkdirSync(dir, { recursive: true });
    }

    while (collectedItems.length < TARGET_COUNT) {
        const listUrl = currentPage === 1 ? BASE_URL : `${BASE_URL}?page=${currentPage}`;
        console.log(`\n📂 Scraping list page: ${listUrl}`);
        
        try {
            await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
            
            // Extract links
            const workLinks = await page.evaluate(() => {
                const anchors = Array.from(document.querySelectorAll('.fcg-archive-grid a'));
                return [...new Set(anchors.map(a => a.href).filter(href => href.includes('/works/')))];
            });

            console.log(`Found ${workLinks.length} works on page ${currentPage}`);

            if (workLinks.length === 0) {
                console.log('No works found on this page.');
                if (ConsecutiveEmptyPages > 2) {
                     console.log('Stopping due to consecutive empty pages.');
                     break;
                }
                ConsecutiveEmptyPages++;
                currentPage++;
                continue;
            }
            ConsecutiveEmptyPages = 0;

            // Pagination detection
            if (workLinks[0] === lastPageFirstLink) {
                console.log('⚠️ Reached end of pagination (same items).');
                break;
            }
            lastPageFirstLink = workLinks[0];

            for (const link of workLinks) {
                if (collectedItems.length >= TARGET_COUNT) break;
                // Dedupe
                if (collectedItems.some(i => i.url === link)) continue;

                console.log(`   🎨 Scraping detail: ${link}`);
                
                try {
                    const detailPage = await browser.newPage();
                    await detailPage.goto(link, { waitUntil: 'domcontentloaded', timeout: 60000 });

                    const metadata = await detailPage.evaluate(() => {
                        const getText = (selector) => {
                            const el = document.querySelector(selector);
                            return el ? el.innerText.trim() : '';
                        };

                        const data = {};
                        data.url = window.location.href;
                        data.title = getText('#main-content h1') || document.title.split(' - ')[0]; 
                        data.description = getText('.fcg-container-narrow > div.tw-my-10 p') || getText('.fcg-container-narrow > div.tw-my-15 p');
                        
                        // Parse DL list loosely to capture EVERYTHING
                        const dlItems = document.querySelectorAll('.fcg-tech-info-list > div');
                        dlItems.forEach(div => {
                            const dtEl = div.querySelector('dt');
                            const ddEl = div.querySelector('dd');
                            if (dtEl && ddEl) {
                                const key = dtEl.innerText.trim().replace(':', '');
                                const val = ddEl.innerText.trim();
                                
                                // Map known keys, keep unknown ones in 'misc' if needed
                                if (key === 'Date') data.date = val;
                                else if (key === 'Creator' || key === 'Author') data.artist = val;
                                else if (key === 'Technique') data.technique = val;
                                else if (key === 'Materials') data.materials = val;
                                else if (key === 'Dimensions') data.dimensions = val;
                                else if (key === 'Inventory no.') data.id = val;
                                else if (key === 'Category' || key === 'Object type' || key === 'Type') data.category = val;
                                else if (key === 'Collection') data.collection = val;
                            }
                        });


                        // Image extraction
                        const img = document.querySelector('.fcg-figure__image');
                        if (img) {
                            if (img.srcset) {
                                const sources = img.srcset.split(',').map(s => {
                                    const [url, width] = s.trim().split(' ');
                                    return { url, width: parseInt(width || '0') };
                                });
                                sources.sort((a, b) => b.width - a.width);
                                data.image = sources[0].url;
                            } else {
                                data.image = img.src;
                            }
                        }

                        // Fallback for Artist
                        if (!data.artist) {
                            const headerSubtitle = document.querySelector('header .tw-text-16');
                            if (headerSubtitle) data.subtitle = headerSubtitle.innerText;
                        }
                        
                        return data;
                    });

                    await detailPage.close();

                    if (!metadata.artist) metadata.artist = metadata.subtitle || 'Unknown';

                    // --- INTELLIGENT CATEGORY INFERENCE ---
                    // Since the site often lacks explicit "Category" fields in the DL, we infer better here.
                     let inferredCategory = metadata.category || 'Artwork';

                     if (!metadata.category) { // Only infer if site didn't provide it
                        const t = (metadata.title || '').toLowerCase();
                        const m = ((metadata.technique || '') + ' ' + (metadata.materials || '')).toLowerCase();

                        if (m.includes('coin') || m.includes('tetradrachm') || m.includes('decadrachm') || t.includes('coin')) {
                            inferredCategory = 'Numismatics';
                        } else if (m.includes('manuscript') || m.includes('parchment') || m.includes('vellum') || m.includes('illumination') || m.includes('bookbinding') || t.includes('quran') || t.includes('book')) {
                            inferredCategory = 'Manuscript'; // Prioritize this over 'gold'
                        } else if (m.includes('oil') || m.includes('canvas') || m.includes('tempera') || m.includes('panel') || t.includes('portrait of')) {
                             // Check for "Paintings"
                            if (!m.includes('tile') && !m.includes('ceramic')) inferredCategory = 'Painting';
                        } else if (m.includes('carpet') || m.includes('rug') || m.includes('silk') || m.includes('velvet') || m.includes('embroidery') || m.includes('costume')) {
                            inferredCategory = 'Textile';
                        } else if (m.includes('porcelain') || m.includes('ceramic') || m.includes('earthenware') || m.includes('faience') || m.includes('stonepaste') || m.includes('tile')) {
                             inferredCategory = 'Ceramics';
                        } else if (m.includes('marble') || m.includes('bronze') || m.includes('sculpture') || m.includes('statue') || m.includes('bust')) {
                             inferredCategory = 'Sculpture';
                        } else if (m.includes('glass') && !m.includes('enamel')) { // Enamel often metalwork
                             inferredCategory = 'Glass';
                        } else if (m.includes('furniture') || m.includes('wood') || m.includes('chair') || m.includes('desk') || m.includes('commode') || m.includes('cabinet')) {
                             inferredCategory = 'Furniture';
                        } else if (m.includes('gold') || m.includes('silver') || m.includes('enamel') || m.includes('jewelry') || m.includes('gem') || t.includes('necklace') || t.includes('brooch')) {
                             inferredCategory = 'Metalwork/Jewelry';
                        } else if (m.includes('drawing') || m.includes('pencil') || m.includes('chalk') || m.includes('pastel') || m.includes('watercolour') || m.includes('gouache')) {
                             inferredCategory = 'Drawing';
                        } else if (m.includes('print') || m.includes('engraving') || m.includes('etching') || m.includes('lithograph')) {
                             inferredCategory = 'Print';
                        }
                     }
                     // --------------------------------------

                    console.log(`      ✅ Collected: "${metadata.title}" [${inferredCategory}]`);
                    
                    const item = {
                        id: metadata.id || Math.random().toString(36).substr(2, 9),
                        title: metadata.title,
                        artist: metadata.artist,
                        image: metadata.image,
                        date: metadata.date,
                        medium: metadata.technique || metadata.materials,
                        dimensions: metadata.dimensions,
                        category: inferredCategory, // Save directly
                        url: metadata.url,
                        source: 'Gulbenkian Museum'
                    };
                    
                    collectedItems.push(item);
                    // Save incrementally
                    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collectedItems, null, 2));

                } catch (err) {
                    console.error(`      ⚠️ Error scraping detail ${link}:`, err.message);
                }
            }

            currentPage++;

        } catch (err) {
            console.error(`Error on page ${currentPage}:`, err.message);
            currentPage++;
        }
    }

    await browser.close();
    console.log(`\n🎉 Done! Scraped ${collectedItems.length} items.`);
}

scrapeGulbenkian();