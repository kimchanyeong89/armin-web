const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../public/data/agnsw-collection.json');

(async () => {
    console.log('Starting AGNSW scraper...');
    
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    
    const baseUrl = 'https://www.artgallery.nsw.gov.au/collection/works/?images=y&media=painting&sort_by=artist';
    
    console.log(`Navigating to ${baseUrl}...`);
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    await new Promise(r => setTimeout(r, 2000));
    
    const title = await page.title();
    console.log(`Page title: ${title}`);
    
    if (title.toLowerCase().includes('challenge') || title.toLowerCase().includes('bot')) {
        console.error('Blocked by challenge page. Aborting.');
        await browser.close();
        return;
    }

    let allItems = [];
    const maxPages = 5; 
    
    for (let p = 1; p <= maxPages; p++) {
        const url = `${baseUrl}&page=${p}`;
        if (p > 1) {
            console.log(`Navigating to page ${p}...`);
            await page.goto(url, { waitUntil: 'domcontentloaded' });
            await new Promise(r => setTimeout(r, 1500));
        }
        
        const items = await page.evaluate(() => {
            const extracted = [];
            const cards = Array.from(document.querySelectorAll('div.card, div.grid__item, article'));
            
            cards.forEach(card => {
                const link = card.querySelector('a'); 
                if (!link) return;
                
                const href = link.href;
                if (!href.includes('/collection/works/')) return;

                const img = card.querySelector('img');
                const titleEl = card.querySelector('.card__title, h3, h4');
                const artistEl = card.querySelector('.card__subtitle, .card__meta, .artist');
                
                const pills = Array.from(card.querySelectorAll('.tag, .pill, .meta-data'));
                const pillText = pills.map(p => p.innerText.toLowerCase()).join(' ');
                const textContent = card.innerText.toLowerCase();
                
                const isOnView = pillText.includes('on display') || 
                                 pillText.includes('level') || 
                                 pillText.includes('gallery') || 
                                 textContent.includes('on display');
                
                if (img) {
                    extracted.push({
                        id: 'agnsw-' + href.split('/').filter(Boolean).pop(),
                        title: titleEl ? titleEl.innerText.trim() : 'Untitled',
                        artist: artistEl ? artistEl.innerText.trim() : 'Unknown',
                        image: img.src,
                        detailUrl: href,
                        onView: isOnView,
                        source: 'Art Gallery of NSW'
                    });
                }
            });
            return extracted;
        });
        
        if (items.length === 0) {
            console.log('No items found on this page.');
            break; 
        }
        
        const newItems = items.filter(i => !allItems.some(existing => existing.id === i.id));
        console.log(`Page ${p}: Found ${newItems.length} new items`);
        allItems = allItems.concat(newItems);
    }
    
    console.log(`Total items scraped: ${allItems.length}`);
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allItems, null, 2));
    console.log(`Saved to ${OUTPUT_FILE}`);
    
    await browser.close();
})();
