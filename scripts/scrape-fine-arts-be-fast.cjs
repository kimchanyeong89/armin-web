const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const BASE_URL = 'https://fine-arts-museum.be/fr/la-collection';
const OUTPUT_FILE = 'public/data/fine-arts-be-complete.json';
const STATUS_FILE = 'public/data/fine-arts-be-status.json';
const CONCURRENCY = 10; // Concurrency limit

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

  console.log('Phase 1: Harvesting URLs from all pages...');
  
  // Create a dedicated page for pagination discovery
  const page = await browser.newPage();
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  
  // Get last page
  const lastPage = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href*="page="]'));
    if (links.length === 0) return 1;
    const nums = links.map(l => parseInt(l.innerText.trim())).filter(n => !isNaN(n));
    return nums.length ? Math.max(...nums) : 1;
  });
  console.log(`Detected ${lastPage} pages of results.`);
  await page.close();

  let allLinks = new Set();
  
  // Phase 1: Parallel fetch of listing pages
  const pageConcurrency = limit(5); // 5 listing pages at a time
  
  const listingTasks = [];
  for (let i = 1; i <= lastPage; i++) {
      listingTasks.push(pageConcurrency(async () => {
          try {
            const p = await browser.newPage();
            await p.setRequestInterception(true);
            p.on('request', (req) => {
                if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) req.abort();
                else req.continue();
            });

            const url = i === 1 ? BASE_URL : `${BASE_URL}?page=${i}`;
            await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            
            const links = await p.evaluate(() => {
                return Array.from(document.querySelectorAll('a'))
                    .map(a => a.href)
                    .filter(href => href.includes('/fr/la-collection/') && 
                                  !href.includes('/artist/') && 
                                  !href.includes('/letter/') &&
                                  href.split('/').length > 5);
            });
            
            await p.close();
            process.stdout.write('.');
            return links;
          } catch(e) {
              return [];
          }
      }));
  }
  
  console.log('Fetching listing pages...');
  const results = await Promise.all(listingTasks);
  results.flat().forEach(l => allLinks.add(l));
  console.log(`\nFound ${allLinks.size} unique artwork URLs.`);

  // Phase 2: Parallel detail scraping
  const urls = Array.from(allLinks);
  const collectedItems = [];
  let processedCount = 0;
  const startTime = Date.now();

  const detailConcurrency = limit(CONCURRENCY);
  const detailTasks = urls.map(url => detailConcurrency(async () => {
      let itemPage;
      try {
          itemPage = await browser.newPage();
          await itemPage.setRequestInterception(true);
          itemPage.on('request', (req) => {
              if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) req.abort();
              else req.continue();
          });

          await itemPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
          
          const data = await itemPage.evaluate(() => {
              let title = "";
              let artist = "Unknown";
              let image = null;
              const titleEl = document.querySelector(".header .span8 h2");
              if (titleEl) {
                  const authorSpan = titleEl.querySelector(".author");
                  if (authorSpan) {
                      artist = authorSpan.textContent.trim();
                      let rawTitle = titleEl.textContent.replace(artist, "");
                      title = rawTitle.replace(/\n/g, "").trim();
                  } else {
                      title = titleEl.textContent.replace(/\n/g, "").trim();
                  }
              }
              let description = "";
              const imgEl = document.querySelector(".image img") || document.querySelector("img[src*='/uploads/']");
              if (imgEl) {
                  let src = imgEl.src || imgEl.getAttribute("src");
                  if (src && !src.startsWith("http")) src = "https://fine-arts-museum.be" + src;
                  image = src;
              }
              return {
                  title: title || "Untitled",
                  artist: artist || "Unknown",
                  description: "",
                  image: image,
                  url: window.location.href
              };
          });

          const objectType = inferType(data.description);
          let date = '';
          const yearMatch = data.description.match(/(1[0-9]\d{2}|20\d{2})/);
          if (yearMatch) date = yearMatch[0];
          else {
              const centuryMatch = data.description.match(/([XVI]+)e\s+siècle/i);
              if (centuryMatch) date = centuryMatch[0];
          }

          const meta = {};
          const lines = data.description.split('\n');
          lines.forEach(line => {
                const parts = line.split(':');
                if (parts.length > 1) meta[parts[0].trim()] = parts.slice(1).join(':').trim(); 
          });
          meta['Date'] = date;

          collectedItems.push({ ...data, objectType, meta });

          await itemPage.close();

          processedCount++;
          if (processedCount % 10 === 0) {
              const elapsed = (Date.now() - startTime) / 60000;
              const rate = elapsed > 0 ? Math.round(processedCount / elapsed) : 0;
              
              try {
                fs.writeFileSync(STATUS_FILE, JSON.stringify({ 
                    count: processedCount, 
                    total_estimated: allLinks.size, 
                    last_item: data.title,
                    last_type: objectType,
                    page: 'Batch Processing',
                    timestamp: new Date().toISOString(),
                    speed: `${rate} items/min`
                }));
              } catch(e) {}
              
              process.stdout.write(`\rCollected: ${processedCount}/${allLinks.size} (${rate} items/min) `);
          }

      } catch (e) {
          if (itemPage) await itemPage.close().catch(()=>({}));
      }
  }));

  await Promise.all(detailTasks);

  console.log('\nSearch complete. Saving...');
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify({
      total_count_approx: allLinks.size, 
      scraped_at: new Date().toISOString(),
      count: collectedItems.length,
      items: collectedItems
  }, null, 2));
  
  console.log('Done.');
  await browser.close();
}

scrape();
