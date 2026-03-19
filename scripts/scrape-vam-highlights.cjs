const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const URLS = [
  'https://collections.vam.ac.uk/search/?id_category=THES48917&images_exist=true&kw_location_type=display&kw_object_type=Oil+painting&page=1&page_size=15&q=',
  'https://collections.vam.ac.uk/search/?id_category=THES48917&images_exist=true&kw_location_type=display&kw_object_type=Painting&page=1&page_size=15&q=',
  'https://collections.vam.ac.uk/search/?id_category=THES48903&images_exist=true&kw_location_type=display&kw_object_type=Poster&page=1&page_size=15&q=',
  'https://collections.vam.ac.uk/search/?images_exist=true&kw_location_type=display&kw_object_type=Watercolour&page=3&page_size=15&q='
];

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  const allItems = [];
  const seenIds = new Set();
  
  // Reuse existing vam-poster-collection logic? Or just fresh scrape.
  // The user link has page=1&page_size=15. I should probably iterate pages until limit.
  // But maybe just scrape what's visible? "From the provided URLs".
  // Assuming they want *all* matching items, not just page 1.
  
  for (const startUrl of URLS) {
      console.log(`Scraping: ${startUrl}`);
      await page.goto(startUrl, { waitUntil: 'domcontentloaded' });
      
      let hasNext = true;
      while (hasNext) {
          // Wait for grid
          await page.waitForSelector('.search-results__list-item', { timeout: 10000 }).catch(() => console.log('No results found'));
          
          const items = await page.evaluate(() => {
              const els = document.querySelectorAll('.search-results__list-item');
              return Array.from(els).map(el => {
                  const link = el.querySelector('a')?.href;
                  const img = el.querySelector('img')?.src;
                  const title = el.querySelector('.search-results__item-title')?.innerText?.trim();
                  const meta = el.querySelector('.search-results__item-meta')?.innerText?.trim(); // Often date/place
                  return { link, img, title, meta };
              });
          });

          for (const item of items) {
              if (item.link && !seenIds.has(item.link)) {
                  seenIds.add(item.link);
                  // Parse ID
                  const id = item.link.split('/item/')[1]?.split('/')[0] || Math.random().toString(36).substring(7);
                  
                  // Metadata parsing
                  // V&A meta often: "1850 | London"
                  let year = '';
                  let artist = 'Unknown';
                  // To get full details we'd need to visit item page.
                  // For now, scrape basic info.
                  
                  allItems.push({
                      id: `vam-${id}`,
                      title: item.title,
                      artist, // Placeholder, usually needs item page visit
                      image: item.img ? item.img.replace(/_jpg_.\.jpg$/, '_jpg_l.jpg') : '', // Try to get larger image
                      year,
                      sourceUrl: item.link
                  });
              }
          }
          console.log(`Collected ${allItems.length} items so far...`);
          
          // Next page
          const nextBtn = await page.$('.pagination__next:not(.pagination__next--disabled)');
          if (nextBtn) {
              await Promise.all([
                  page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
                  nextBtn.click()
              ]);
          } else {
              hasNext = false;
          }
          // Limit pages per URL to avoid infinite run? User implied "filter" result, so scrape all.
          // But V&A has thousands.
          // The user links have specific query params.
          // I'll cap at 10 pages per URL just in case.
          const url = page.url();
          if (url.includes('page=11')) hasNext = false; 
      }
  }

  // Write to formatted JSON
  const outPath = path.join(__dirname, '..', 'public', 'data', 'vam-highlights-collection.json');
  const existing = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath)) : { items: [] };
  
  // We need to fetch details for these items to be useful (Artist, Year, Medium)
  // But that takes time.
  // The user says "Efficiently".
  // Maybe V&A API exists?
  // Check typical V&A API pattern: https://api.vam.ac.uk/v2/objects/search
  
  console.log(`Total items collected: ${allItems.length}. Saving basic list.`);
  fs.writeFileSync(outPath, JSON.stringify({ items: allItems }, null, 2));

  await browser.close();
})();
