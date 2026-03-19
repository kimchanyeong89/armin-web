const puppeteer = require('puppeteer');
const fs = require('fs');

const API_URL = 'https://www.nasjonalmuseet.no/en/collection/search//search?object-name=painting'; 
const OUT_FILE = 'public/data/nasjonal-collection.json';

(async () => {
    console.log("Starting Nasjonalmuseet API Scraper (Hybrid)...");
    const browser = await puppeteer.launch({ 
        headless: "new",
        defaultViewport: { width: 1280, height: 800 }
    });
    const page = await browser.newPage();
    
    // Capture the API URL dynamically
    let apiUrl = '';
    page.on('request', req => {
        if (req.method() === 'POST' && req.url().includes('nasjonalmuseet.no') && req.url().includes('/search') && !apiUrl) {
            console.log(`Captured API URL: ${req.url()}`);
            apiUrl = req.url();
        }
    });

    // Go to search page first to establish session
    await page.goto('https://www.nasjonalmuseet.no/en/collection/search/?object-name=painting', { waitUntil: 'networkidle2' });
    console.log("Session established. Triggering initial load...");

    // Click "Show more" to force the POST request we want
    try {
        await page.waitForSelector('button', { timeout: 5000 });
        const found = await page.evaluate(async () => {
             const buttons = Array.from(document.querySelectorAll('button'));
             const loadMoreBtn = buttons.find(b => {
                 const t = b.innerText.toLowerCase();
                 return t.includes('show more') || t.includes('load more') || t.includes('vis flere');
             });
             if (loadMoreBtn) {
                 loadMoreBtn.click();
                 return true;
             }
             return false;
        });
        if(found) await new Promise(r => setTimeout(r, 3000));
    } catch(e) {
        console.log("Could not click show more ("+e.message+"). Trying to fast-forward anyway if URL captured.");
    }

    if (!apiUrl) {
        console.error("Failed to capture API URL. Using fallback.");
        apiUrl = '/en/collection/search//search?object-name=painting'; // Relative path
    }

    const items = [];
    let pageNum = 1;
    let hasMore = true;

    while(hasMore) {
        console.log(`Fetching page ${pageNum} from ${apiUrl}...`);
        
        try {
            const data = await page.evaluate(async (url, p) => {
                
                // Get the Anti-Forgery Token
                const tokenInput = document.getElementById('aft');
                const token = tokenInput ? tokenInput.value : '';

                if (!token) {
                    console.error("Could not find Anti-Forgery Token (#aft)");
                }

                // Try absolute path if relative fails
                const target = url; 

                const res = await fetch(target, {
                    method: 'POST', 
                    headers: {
                        'X-Requested-With': 'XMLHttpRequest',
                        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                        'RequestVerificationToken': token
                    },
                    // We must respect the original query params if they exist in the body
                    body: `includeRelatedResult=true&page=${p}`
                });
                if (!res.ok) {
                     const txt = await res.text();
                     throw new Error(`${res.status} ${res.statusText}`);
                }
                return res.json();
            }, apiUrl, pageNum);

            if (data.Results && data.Results.length > 0) {
                const batch = data.Results.map(r => {
                    let img = '';
                    if (r.media && r.media.iiifImageUrlTemplate && r.media.images && r.media.images.length > 0) {
                        const template = r.media.iiifImageUrlTemplate;
                        const filename = r.media.images[0].originalFile; 
                        
                        // Construct High Res URL (1200px)
                        img = template.replace('{0}', encodeURIComponent(filename))
                                      .replace('{1}', '1200')
                                      .replace('{2}', '');
                    } else if (r.image) {
                        img = r.image;
                    }

                    return {
                        id: r.media?.nmId || r.url.split('/').pop(),
                        source: 'Nasjonalmuseet',
                        url: 'https://www.nasjonalmuseet.no' + r.url,
                        title: r.title,
                        artist: r.media?.producer || '', 
                        image: img,
                        
                        // Fallback Date/Dimension logic (we might not get it from API list view)
                        // If 'excerpt' or 'media' has it, great. If not, we still need to Enrich.
                        // But listing 5000 items via API takes seconds vs hours via scroll.
                        // We can THEN enrich them in parallel.
                        type: 'Painting',
                        
                        // Debug field to see if we can extract more
                        _raw: r 
                    };
                });
                
                const valid = batch.filter(i => i.image && !i.image.includes('null') && i.image.startsWith('http'));
                items.push(...valid);
                console.log(`Got ${valid.length} items. Total: ${items.length}`);
                
                pageNum++;
                await new Promise(r => setTimeout(r, 200)); 
            } else {
                console.log("No more results.");
                hasMore = false;
            }

        } catch (e) {
            console.error(`Page ${pageNum} failed: ${e.message}`);
            hasMore = false;
        }
    }

    fs.writeFileSync(OUT_FILE, JSON.stringify(items, null, 2));
    console.log(`Saved ${items.length} items to ${OUT_FILE}`);

    await browser.close();
})();
