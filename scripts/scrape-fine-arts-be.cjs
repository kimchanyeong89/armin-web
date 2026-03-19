const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const BASE_URL = 'https://fine-arts-museum.be/fr/la-collection';
const OUTPUT_FILE = 'public/data/fine-arts-be-complete.json';
const STATUS_FILE = 'public/data/fine-arts-be-status.json';
const TARGET_COUNT = 20000;

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
    return 'Artwork'; // Fallback
}

async function scrape() {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  // 1. Get total count estimation
  console.log('Navigating to collection page...');
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  
  const bodyText = await page.evaluate(() => document.body.innerText);
  const countMatch = bodyText.match(/recense actuellement plus de ([\d\s\.]+)/);
  let totalCountStr = "10000+";
  if (countMatch) {
      console.log(`Total count context: ${countMatch[0]}`);
      totalCountStr = countMatch[1];
  }

  // Find last page number for logging
  const lastPage = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href*="page="]'));
    if (links.length === 0) return 1;
    const nums = links.map(l => parseInt(l.innerText.trim())).filter(n => !isNaN(n));
    return nums.length ? Math.max(...nums) : 1;
  });
  console.log(`Estimated pages: ${lastPage}.`);

  let collectedItems = [];
  let pageNum = 1;
  let seenUrls = new Set();
  
  // To speed up, we can process pages in loop
  while (collectedItems.length < TARGET_COUNT) {
    console.log(`Scraping page ${pageNum} (Collected: ${collectedItems.length})...`);
    const pageUrl = pageNum === 1 ? BASE_URL : `${BASE_URL}?page=${pageNum}`;
    
    // Only navigate if we aren't already there (page 1 is already loaded, but we might loop back)
    if (page.url() !== pageUrl) {
         await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });
    }
    
    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a'))
        .map(a => a.href)
        .filter(href => {
            if (!href.includes('/fr/la-collection/')) return false;
            // Exclude artist profiles and letter filters
            if (href.includes('/la-collection/artist/')) return false;
            if (href.includes('/la-collection/letter/')) return false;
            
            try {
                const urlObj = new URL(href);
                const pathParts = urlObj.pathname.split('/').filter(Boolean);
                // Expected: ['fr', 'la-collection', 'slug']
                if (pathParts.length < 3) return false;
                
                return true;
            } catch (e) { return false; }
        })
        .filter((v, i, a) => a.indexOf(v) === i);
    });

    console.log(`Found ${links.length} potential artwork links on page ${pageNum}`);

    for (const link of links) {
      if (collectedItems.length >= TARGET_COUNT) break;
      if (seenUrls.has(link)) continue;
      seenUrls.add(link);

      try {
        const itemPage = await browser.newPage();
        await itemPage.goto(link, { waitUntil: 'domcontentloaded' });
        
        const data = await itemPage.evaluate(() => {
            const invalidTitles = ['Collections', 'Œuvres', 'Rechercher', 'À propos des musées', 'Localisation des musées', 'Partenaires', 'Suivez-nous', 'Abonnez-vous', 'Additional Links', 'Utilisation responsable de vos données', 'Musées royaux des Beaux-Arts de Belgique'];
            
            const h2s = Array.from(document.querySelectorAll('h2'));
            // Find the h2 that is NOT in the invalid list
            let potentialTitleEl = h2s.find(h => {
                const t = h.innerText.trim();
                return t.length > 2 && !invalidTitles.some(bad => t === bad || t.includes('Utilisation responsable'));
            });

            let fullTitle = potentialTitleEl ? potentialTitleEl.innerText.trim() : '';
            
            const artistEl = document.querySelector('h4 a[href*="/artist/"]');
            let artist = artistEl ? artistEl.innerText.trim() : 'Unknown';

            let title = fullTitle;
            if (artist !== 'Unknown' && title.includes(artist)) {
                title = title.replace(artist, '').trim();
            }
            // Sometimes title has newlines
            title = title.replace(/\n/g, ' ').trim();

            let description = '';
            // Strategy: Find "DESCRIPTION" header and take siblings until next header
            const hItems = Array.from(document.querySelectorAll('h3, h4, h5'));
            const descHeader = hItems.find(h => h.innerText.toUpperCase().includes('DESCRIPTION'));
            
            if (descHeader) {
                let sibling = descHeader.nextElementSibling;
                while (sibling) {
                    if (['H1','H2','H3','H4','H5'].includes(sibling.tagName)) break;
                    description += sibling.innerText + '\n';
                    sibling = sibling.nextElementSibling;
                }
            } else {
                 // Fallback text dump of main content?
                 const main = document.querySelector('article') || document.body;
                 if (main) description = main.innerText;
            }

            const imgEl = document.querySelector('img[src*="/uploads/vubisartworks/"]');
            const image = imgEl ? imgEl.src : null;

            return {
                title: title || 'Untitled',
                artist,
                description: description.trim(),
                image,
                url: window.location.href
            };
        });

        await itemPage.close();

        // Infer Type
        const objectType = inferType(data.description);

        // Infer Year
        let date = '';
        const yearMatch = data.description.match(/(1[0-9]\d{2}|20\d{2})/);
        if (yearMatch) {
            date = yearMatch[0];
        } else {
            const centuryMatch = data.description.match(/([XVI]+)e\s+siècle/i);
            if (centuryMatch) date = centuryMatch[0];
        }
        
        const meta = {};
        const lines = data.description.split('\n');
        lines.forEach(line => {
             const parts = line.split(':');
             if (parts.length > 1) {
                 const key = parts[0].trim();
                 const val = parts.slice(1).join(':').trim(); 
                 meta[key] = val;
             }
        });
        meta['Date'] = date;

        // Save EVERYTHING
        collectedItems.push({
            ...data,
            objectType,
            meta
        });

        // Update status file every 5 items
        if (collectedItems.length % 5 === 0) {
             try {
                 fs.writeFileSync(STATUS_FILE, JSON.stringify({ 
                     count: collectedItems.length, 
                     total_estimated: totalCountStr, 
                     last_item: data.title,
                     last_type: objectType,
                     page: pageNum,
                     timestamp: new Date().toISOString()
                 }));
             } catch (err) { /* ignore write errors */ }
        }
        
        console.log(`Collected [${objectType}]: ${data.title} (${data.artist}) - Date: ${date}`);

      } catch (e) {
        console.error(`Error processing ${link}:`, e.message);
      }
    }
    
    pageNum++;
    // if (pageNum > lastPage + 20) break; // Disabled to ensure we get everything
    if (links.length === 0) {
        console.log("No links found on this page. Stopping.");
        break;
    }
  }

  const outputDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outputDir)){
      fs.mkdirSync(outputDir, { recursive: true });
  }

  const result = {
      total_count_approx: totalCountStr, 
      scraped_at: new Date().toISOString(),
      count: collectedItems.length,
      items: collectedItems
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
  console.log(`Saved ${collectedItems.length} items to ${OUTPUT_FILE}`);
  
  await browser.close();
}

scrape();
