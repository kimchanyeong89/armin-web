const puppeteer = require('puppeteer');
const fs = require('fs');

const URL = 'https://www.nasjonalmuseet.no/en/collection/search/?object-name=painting';
const TARGET = 100;

(async () => {
    console.log("Starting Nasjonalmuseet Puppeteer Scraper...");
    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    const page = await browser.newPage();
    
    // Set viewport to trigger loading
    await page.setViewport({ width: 1366, height: 768 });

    try {
        await page.goto(URL, { waitUntil: 'networkidle2' });
        console.log("Page loaded.");
        
        // Wait for initial items
        await page.waitForSelector('a[href*="/collection/object/"]', { timeout: 10000 });
        
         // Attempt to accept cookies if present (once)
        const cookieBtn = await page.evaluate(async () => {
            const btns = Array.from(document.querySelectorAll('button, a'));
            const accept = btns.find(b => b.innerText.toLowerCase().includes('accept all') || b.innerText.toLowerCase().includes('godta alle'));
            if (accept) { accept.click(); return true; }
            return false;
        });
        if(cookieBtn) await new Promise(r => setTimeout(r, 2000));

        let items = [];
        let retries = 0;
        
        while(items.length < TARGET && retries < 10) {
            // Extract current items
            const newItems = await page.evaluate(() => {
                const els = document.querySelectorAll('a[href*="/collection/object/"]');
                return Array.from(els).map(el => {
                    const article = el.closest('article') || el;
                    const imgEl = article.querySelector('img');
                    
                    // Critical: Filter no-image items
                    if (!imgEl || !imgEl.src) return null;
                    if (imgEl.src.includes('placeholder')) return null;

                    const titleEl = article.querySelector('h2, .title, h3');
                    const metaEl = article.innerText; 
                    
                    return {
                        url: el.href,
                        title: titleEl ? titleEl.innerText : '',
                        image: imgEl.src,
                        raw_meta: metaEl
                    };
                }).filter(Boolean);
            });
            
            console.log(`DOM Trace: Found ${newItems.length} valid items with images.`);

            // Dedup
            let addedCount = 0;
            for (const i of newItems) {
                if (!items.find(x => x.url === i.url)) {
                    items.push(i);
                    addedCount++;
                }
            }
            console.log(`Debug: Added ${addedCount} new items. Total: ${items.length}`);
            
            // SAVE PROGRESS
            const cleaned = items.map(i => {
               const parts = i.raw_meta.split('\n').map(s => s.trim()).filter(s => s);
               const artistCandidate = parts.find(p => p !== i.title && p.length < 50) || '';
               return {
                   source: 'Nasjonalmuseet',
                   url: i.url,
                   title: i.title,
                   image: i.image,
                   artist: artistCandidate,
                   type: 'Painting' 
               };
            });
            fs.writeFileSync('public/data/nasjonal-collection.json', JSON.stringify(cleaned, null, 2));

            if (items.length >= TARGET) break;
            if (addedCount === 0 && items.length > 0 && retries > 3) {
                console.log("Stuck on pagination. Breaking.");
                break;
            }

            // Load More / Next Page
            // Attempt to accept cookies if present (once)
            const cookieBtn = await page.evaluate(async () => {
                const btns = Array.from(document.querySelectorAll('button, a'));
                const accept = btns.find(b => b.innerText.toLowerCase().includes('accept all') || b.innerText.toLowerCase().includes('godta alle'));
                if (accept) { accept.click(); return true; }
                return false;
            });
            if(cookieBtn) await new Promise(r => setTimeout(r, 2000));

            const buttonClicked = await page.evaluate(async () => {
                /* ... */
                const buttons = Array.from(document.querySelectorAll('button'));
                // Look for strictly "Vis flere" (Norwegian) or "Show more"
                const loadMoreBtn = buttons.find(b => {
                     const t = b.innerText.toLowerCase();
                     return t.includes('show more') || t.includes('load more') || t.includes('vis flere');
                });
                if (loadMoreBtn) {
                    loadMoreBtn.scrollIntoView();
                    loadMoreBtn.click();
                    return true;
                }
                return false;
            });
            
            if (buttonClicked) {
                console.log("Clicking 'Show more/Vis flere'...");
                await new Promise(r => setTimeout(r, 4000)); // Wait longer
                
                // Lazy load trigger
                await page.evaluate(() => window.scrollBy(0, 1000));
                await new Promise(r => setTimeout(r, 2000));

                if (addedCount === 0) {
                     retries++;
                     console.log(`Warning: Clicked button but found no new items. Retry ${retries}/5`);
                } else {
                     retries = 0;
                }
            } else {
                console.log("No 'Show more' button found. Trying scroll...");
                await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                await new Promise(r => setTimeout(r, 2000));
                
                // If count didn't increase, maybe we are done?
                const currentCount = await page.evaluate(() => document.querySelectorAll('a[href*="/collection/object/"]').length);
                
                // Retry logic if no new items found
                if (currentCount <= items.length && addedCount === 0) {
                    console.log("Scroll didn't load more items.");
                    retries++;
                } else if (addedCount > 0) {
                    retries = 0;
                }
            }
        }

        // Clean up data
        const cleaned = items.map(i => {
           // Heuristic extraction
           // Text usually: "The Scream\nEdvard Munch\n1893"
           const parts = i.raw_meta.split('\n').map(s => s.trim()).filter(s => s);
           // Assume Title is first, Artist second? 
           // If Title equals i.title, then remove it.
           const artistCandidate = parts.find(p => p !== i.title && p.length < 50) || '';
           
           return {
               source: 'Nasjonalmuseet',
               url: i.url,
               title: i.title,
               image: i.image,
               artist: artistCandidate,
               type: 'Painting' // inferred from search query
           };
        });

        fs.writeFileSync('public/data/nasjonal-collection.json', JSON.stringify(cleaned.slice(0, TARGET), null, 2));
        console.log(`Saved ${cleaned.length} items to public/data/nasjonal-collection.json`);

    } catch(e) {
        console.error("Puppeteer Error:", e.message);
    } finally {
        await browser.close();
    }
})();
