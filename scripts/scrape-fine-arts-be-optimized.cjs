const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const BASE_URL = 'https://fine-arts-museum.be/fr/la-collection';
const OUTPUT_FILE = 'public/data/fine-arts-be-complete.json';
const STATUS_FILE = 'public/data/fine-arts-be-status.json';

// Configuration
const MAX_PAGES = 700; // Upper bound (enough for ~16k items)
const LISTING_CONCURRENCY = 5;
const DETAIL_CONCURRENCY = 15;

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

// Helpers
const updateStatus = (data) => {
    try {
        fs.writeFileSync(STATUS_FILE, JSON.stringify({
            timestamp: new Date().toISOString(),
            ...data
        }, null, 2));
    } catch (e) { /* ignore write errors */ }
};

const pLimit = async () => {
    const { default: limit } = await import('p-limit');
    return limit;
};

async function scrape() {
  const limit = await pLimit(); 
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  console.log('Phase 1: Deep Discovery of URLs...');
  updateStatus({ count: 0, page: 0, last_item: "Starting Discovery Phase...", last_type: "System" });
  
  const allLinks = new Set();
  const listingLimiter = limit(LISTING_CONCURRENCY);
  let pagesProcessed = 0;
  let emptyPageCount = 0;
  
  const listingTasks = [];

  // Generate range 1..MAX_PAGES
  for (let i = 1; i <= MAX_PAGES; i++) {
        listingTasks.push(listingLimiter(async () => {

          try {
            const page = await browser.newPage();
            // Block heavy assets
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                const rt = req.resourceType();
                if (['image', 'media', 'font', 'stylesheet'].includes(rt)) req.abort();
                else req.continue();
            });

            const url = i === 1 ? BASE_URL : `${BASE_URL}?page=${i}`;
            // Go to page
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            
            
            // Extract links
            const rawLinks = await page.evaluate(() => {
                return Array.from(document.querySelectorAll('a'))
                    .map(a => a.href);
            });
            
            await page.close();
            
            if (validLinks.length > 0) {
                 validLinks.forEach(l => allLinks.add(l));
                 emptyPageCount = 0; 
            } else {
                emptyPageCount++;
            }
            
            pagesProcessed++;
            if (pagesProcessed % 10 === 0) {
                 process.stdout.write(` [P${pagesProcessed}: ${allLinks.size} URLs] `);
                 updateStatus({ 
                     count: allLinks.size, 
                     page: `${pagesProcessed}/${MAX_PAGES} (Discovery)`, 
                     last_item: `Found ${validLinks.length} on page ${i}`, 
                     last_type: "Discovery" 
                 });
            }
            return validLinks;
          } catch(e) {
              // console.error(`Error on page ${i}: ${e.message}`);
              return [];
          }
      }));
  }

  // Wait for all/most listing pages
  await Promise.all(listingTasks);
  console.log(`\n\nDiscovery Complete. Found ${allLinks.size} total unique artworks.`);
  
  // Phase 2: Details
  const urls = Array.from(allLinks);
  const detailLimiter = limit(DETAIL_CONCURRENCY);
  const results = [];
  
  let scrapedCount = 0;
  
  const detailTasks = urls.map((url, index) => detailLimiter(async () => {
      try {
          const p = await browser.newPage();
          await p.setRequestInterception(true);
          p.on('request', (req) => {
             if (['image', 'media', 'font', 'stylesheet'].includes(req.resourceType())) req.abort();
             else req.continue();
          });
          
          await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
          
          const data = await p.evaluate(() => {
              const getText = (sel) => document.querySelector(sel)?.innerText?.trim() || '';
              const getMeta = (name) => document.querySelector(`meta[property="${name}"]`)?.content || '';
              
              const title = getMeta('og:title') || getText('h1') || document.title;
              const image = getMeta('og:image');
              
              const info = {};
              document.querySelectorAll('.artwork-meta tr').forEach(row => {
                  const key = row.querySelector('th')?.innerText?.trim();
                  const val = row.querySelector('td')?.innerText?.trim();
                  if(key && val) info[key] = val;
              });
              
              return {
                  url: document.location.href,
                  title,
                  image,
                  artist: info['Artiste'] || info['Artist'] || '',
                  date: info['Date'] || '',
                  medium: info['Technique'] || '',
                  dimensions: info['Dimensions'] || '',
                  inv: info['Numéro d\'inventaire'] || ''
              };
          });
          
          await p.close();
          
          const type = inferType(data.medium || data.title);
          const finalItem = { ...data, type, source: 'Fine Arts Belgium' };
          results.push(finalItem);
          
          scrapedCount++;
          if (scrapedCount % 20 === 0) {
             process.stdout.write('+');
             updateStatus({ 
                 count: scrapedCount, 
                 page: "Scraping Details", 
                 last_item: data.title, 
                 last_type: type 
             });
          }
          return finalItem;
      } catch(e) {
          // Retry once? or just skip
          return null;
      }
  }));
  
  await Promise.all(detailTasks);
  
  console.log(`\n\nScraping done. Writing to ${OUTPUT_FILE}...`);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results.filter(x=>x), null, 2));
  updateStatus({ count: results.length, page: "Done", last_item: "Complete", last_type: "System" });
  
  await browser.close();
  process.exit(0);
}

scrape();
