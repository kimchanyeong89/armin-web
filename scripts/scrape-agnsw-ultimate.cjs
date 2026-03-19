const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

// Categories requested by user + standard ones
const TARGETS = [
  {
    category: 'Painting',
    // Previously used filter: media=painting
    url: 'https://www.artgallery.nsw.gov.au/collection/works/?images=y&media=painting&sort_by=artist',
    collectionType: 'Paintings'
  },
  {
    category: 'Drawing',
    // Previously used filter: media=drawing&sort_by=date
    url: 'https://www.artgallery.nsw.gov.au/collection/works/?images=y&media=drawing&sort_by=date',
    collectionType: 'Drawings'
  },
  {
    category: 'Photograph',
    // Previously used filter: media=photograph&date_from=1980&sort_by=date
    url: 'https://www.artgallery.nsw.gov.au/collection/works/?images=y&media=photograph&date_from=1980&sort_by=date',
    collectionType: 'Photographs'
  },
  {
    category: 'Mixed Media',
    url: 'https://www.artgallery.nsw.gov.au/collection/works/?images=y&media=mixed-media&sort_by=artist',
    collectionType: 'Mixed Media'
  },
  {
    category: 'Watercolour', 
    url: 'https://www.artgallery.nsw.gov.au/collection/works/?images=y&media=watercolour&sort_by=artist',
    collectionType: 'Paintings' 
  }
];

const OUTPUT_FILE = path.join(__dirname, '../public/data/agnsw-collection-fixed.json');
const PROD_FILE = path.join(__dirname, '../public/data/agnsw-collection.json');
const INTERMEDIATE_FILE_LIST = path.join(__dirname, '../public/data/agnsw-list-temp.json');
const CONCURRENCY_LIMIT = 5; 

async function scrapeList(page, target) {
  console.log(`\n[List Phase] Starting category: ${target.category}`);
  
  try {
      await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch (e) {
      console.error(`Failed to load ${target.url}: ${e.message}`);
      return [];
  }
  
  let items = [];
  let pageCount = 1;
  let hasNext = true;

  while (hasNext) {
    try {
        await page.waitForSelector('.artworksList-item', { timeout: 10000 }).catch(() => null);
        
        const pageItems = await page.evaluate((cat, colType) => {
          const els = document.querySelectorAll('.artworksList-item');
          const results = [];
          
          els.forEach(el => {
            const link = el.querySelector('a.card-artwork-link');
            if (!link) return;
            const href = link.getAttribute('href');
            if (!href) return;

            const parts = href.split('/').filter(Boolean);
            const accessionId = parts[parts.length - 1]; 
            const safeId = `agnsw-${accessionId.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`;

            const imgEl = el.querySelector('.card-artwork-image');
            const titleEl = el.querySelector('.card-artwork-title');
            const artistEl = el.querySelector('.card-artwork-artist');
            const dateEl = el.querySelector('.card-artwork-date'); 
            const accessionEl = el.querySelector('.card-artwork-accession');
            const displayEl = el.querySelector('.card-artwork-display');

            const displayCtx = displayEl ? displayEl.textContent.trim() : '';
            const onDisplay = displayCtx.toLowerCase().includes('on display') && !displayCtx.toLowerCase().includes('not on display');
            
            let imageUrl = imgEl ? imgEl.src : '';
            const dateText = dateEl ? dateEl.textContent.trim() : '';
            const yearMatch = dateText.match(/\d{4}/);
            const year = yearMatch ? parseInt(yearMatch[0]) : null;

            results.push({
              id: safeId,
              title: titleEl ? titleEl.textContent.trim() : 'Untitled',
              artist: artistEl ? artistEl.innerText.replace(/\n/g, ' ').trim() : 'Unknown',
              date: dateText,
              year: year,
              detailUrl: `https://www.artgallery.nsw.gov.au${href}`,
              image: imageUrl,
              source: 'AGNSW',
              collectionType: colType,
              category: cat,
              onDisplay: onDisplay,
              location: onDisplay ? displayCtx.replace(/On display [–-]/i, '').trim() : null,
              accession: accessionEl ? accessionEl.textContent.trim() : accessionId,
              medium: '',
              dimensions: '',
              credit: ''
            });
          });
          return results;
        }, target.category, target.collectionType);

        if (pageItems.length === 0) {
            console.log("No items found on this page.");
            break;
        }

        items.push(...pageItems);
        process.stdout.write(`\rLoaded ${items.length} items from ${target.category} (Page ${pageCount})...`);

        // Pagination
        const nextPageEvaluated = await page.evaluate(() => {
            const nextBtn = document.querySelector('a.pagination-link-next');
            if (nextBtn) { nextBtn.click(); return true; }
            
            // Fallback
            const active = document.querySelector('.pagination .active');
            if (!active) return false;
            const current = parseInt(active.innerText);
            if (isNaN(current)) return false;
            
            const nextLinks = Array.from(document.querySelectorAll('.pagination a'));
            const target = nextLinks.find(a => a.innerText.trim() === String(current + 1));
            if (target) { target.click(); return true; }
            
            return false;
        });

        if (nextPageEvaluated) {
          await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
          pageCount++;
        } else {
          hasNext = false;
        }

    } catch (err) {
        console.error(`Error on page ${pageCount}:`, err);
        hasNext = false;
    }
  }
  console.log(`\nFinished ${target.category}: Total ${items.length}`);
  return items;
}

async function enrichDetails(browser, items, saveCallback) {
  const { default: pLimit } = await import('p-limit');
  const limit = pLimit(CONCURRENCY_LIMIT);
  let processed = 0;
  
  console.log(`\n[Detail Phase] Enriching ${items.length} items...`);
  
  const tasks = items.map(item => {
    return limit(async () => {
      // Basic resume check: metadata present and non-empty
      if (item.medium && item.dimensions && item.medium.length > 0) {
        processed++;
        return item;
      }

      let contextPage = null;
      try {
        contextPage = await browser.newPage();
        await contextPage.setRequestInterception(true);
        contextPage.on('request', (req) => {
          if (['image', 'font', 'stylesheet', 'media'].includes(req.resourceType())) { 
             req.abort();
          } else {
            req.continue();
          }
        });

        await contextPage.goto(item.detailUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });

        const details = await contextPage.evaluate(() => {
           const clean = (text) => text ? text.trim().replace(/\s+/g, ' ') : '';
           const findValue = (labels) => {
               for (const label of labels) {
                   const els = Array.from(document.querySelectorAll('dt, .artwork-details-list-key'));
                   for (const el of els) {
                       if (el.textContent.includes(label)) {
                           let next = el.nextElementSibling;
                           if (next) return clean(next.textContent);
                       }
                   }
               }
               return null;
           };

           const medium = findValue(['Materials used', 'Medium', 'Technique']);
           const dimensions = findValue(['Dimensions', 'Size']);
           const credit = findValue(['Credit line', 'Credit']);
           const descEl = document.querySelector('.artwork-description, .description');
           
           return { medium, dimensions, credit, description: descEl ? clean(descEl.textContent) : '' };
        });

        if (details.medium) item.medium = details.medium;
        if (details.dimensions) item.dimensions = details.dimensions;
        if (details.credit) item.credit = details.credit;
        if (details.description) item.description = details.description;

    } catch (err) {
        // ignore
    } finally {
        if (contextPage) await contextPage.close();
        processed++;
        if (processed % 20 === 0) {
          process.stdout.write(`\rEnriched ${processed}/${items.length} items...`);
          if (saveCallback) saveCallback();
        }
      }
      return item;
    });
  });

  await Promise.all(tasks);
  return items;
}

(async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
  });

  try {
    const page = await browser.newPage();
    let allItems = [];

    // 1. Scrape Lists
    for (const target of TARGETS) {
      const items = await scrapeList(page, target);
      allItems.push(...items);
    }

    // 2. Deduplicate
    const uniqueMap = new Map();
    allItems.forEach(i => uniqueMap.set(i.id, i));
    const uniqueItems = Array.from(uniqueMap.values());
    console.log(`\nUnique items: ${uniqueItems.length}`);

    const jsonStr = JSON.stringify(uniqueItems, null, 2);
    fs.writeFileSync(OUTPUT_FILE, jsonStr);
    fs.writeFileSync(PROD_FILE, jsonStr);
    console.log('[Snapshot] Saved list data.');

    // 3. Enrich Details
    await enrichDetails(browser, uniqueItems, () => {
        const updatedStr = JSON.stringify(uniqueItems, null, 2);
        fs.writeFileSync(OUTPUT_FILE, updatedStr);
        fs.writeFileSync(PROD_FILE, updatedStr);
    });

    console.log('\n[Final] Saved fully enriched data.');

  } catch (err) {
    console.error('Fatal:', err);
  } finally {
    await browser.close();
  }
})();
