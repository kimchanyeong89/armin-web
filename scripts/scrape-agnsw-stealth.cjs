const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const OUTPUT_FILE = path.join(__dirname, '../public/data/agnsw-collection.json');
// User requested specific filter: images=y, media=painting, sort_by=artist
const BASE_URL = 'https://www.artgallery.nsw.gov.au/collection/search/?images=y&media=painting&sort_by=artist';
const MAX_PAGES = 300; // Increased to 300 to cover 6000 items (20 items/page)
const PAGE_WAIT_MS = 1500;

(async () => {
  console.log('Launching AGNSW Scraper (Stealth) - Deep Scrape...');
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  let allItems = [];
  
  for (let p = 1; p <= MAX_PAGES; p++) {
      // NOTE: AGNSW text pagination usually works with ?page=N but careful with search parameters ordering
      const url = `${BASE_URL}&page=${p}`;
      console.log(`Navigating to page ${p}: ${url}...`);
      
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        
        // Wait for potential challenge bypass or content load
        await new Promise(r => setTimeout(r, 6000));
        
        // Check if we hit end of pagination (maybe check for "no results" text or empty list)
        const count = await page.evaluate(() => document.querySelectorAll('.artworksList-item').length);
        if (count === 0) {
            console.log("No items found on this page. Dumping HTML.");
            fs.writeFileSync(`debug-agnsw-fail-p${p}.html`, await page.content());
            break;
        }

        const pageItems = await page.evaluate(() => {
            const els = Array.from(document.querySelectorAll('.artworksList-item'));
            return els.map(el => {
                const a = el.querySelector('a');
                const img = el.querySelector('img');
                
                // improved text extraction
                // Using exact classes observed in probe
                const artistEl = el.querySelector('.card-artwork-artist');
                const titleEl = el.querySelector('.card-artwork-title');
                const dateEl = el.querySelector('.card-artwork-date');
                
                let artist = artistEl ? artistEl.innerText.trim() : "";
                let title = titleEl ? titleEl.innerText.trim() : "";
                let date = dateEl ? dateEl.innerText.trim() : "";
                
                // Fallback to text splitting if specific classes not found (legacy pages)
                if (!artist && !title) {
                    const text = el.innerText || '';
                    const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
                    if (lines.length >= 2) {
                        // Heuristic: If line 0 is long and line 1 is numeric often artist/title are split
                        // If line 0 seems to contain two parts... difficult without HTML
                        // Let's assume standard layout
                         if (!artist) artist = lines[0];
                         if (!title) title = lines[1];
                         if (!date && lines[2]) date = lines[2];
                    }
                }

                // Cleanup weird concatenation if it happens
                // Check if artist contains the title (if title is known subset)
                
                return {
                    id: ('agnsw-' + Math.random().toString(36).substr(2,9)),
                    title: title || 'Untitled',
                    artist: artist || 'Unknown',
                    date: date || '',
                    image: img ? img.src : null,
                    detailUrl: a ? a.href : null,
                    location: 'On Display',
                    source: 'AGNSW'
                };
            });
        });

        console.log(`Found ${pageItems.length} items on page ${p}`);
        allItems = allItems.concat(pageItems);
        
        // Save incremental progress
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allItems, null, 2));

        // Sleep
        await new Promise(r => setTimeout(r, PAGE_WAIT_MS));

      } catch (err) {
          console.error(`Error on page ${p}:`, err);
          // Retry logic could go here, but for now we skip
      }
  }

  console.log(`Scrape complete. Total items: ${allItems.length}`);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allItems, null, 2));
  
  await browser.close();
})();
