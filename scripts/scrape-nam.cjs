
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const START_URL = 'https://www.namuseum.gr/en/collections/';
const OUTPUT_FILE = path.join(__dirname, '../public/data/nam-collection.json');
const TARGET_COUNT = 1000; // Increased to cover all ~308 items

async function scrape() {
  console.log(`Starting scrape of ${START_URL}...`);
  
  // 1. Get Sub-Collection URLs
  const { data: mainHtml } = await axios.get(START_URL);
  const $ = cheerio.load(mainHtml);
  
  const collectionLinks = new Set();
  // Find links that look like sub-collections. 
  // Based on observation: /collection/syllogi-...
  $('a[href*="/collection/"]').each((i, el) => {
    const href = $(el).attr('href');
    // Ensure accurate filtering
    if (href.includes('namuseum.gr/en/collection/') && !href.endsWith('/collections/')) {
        collectionLinks.add(href);
    }
  });

  const urlsToVisit = Array.from(collectionLinks);
  console.log(`Found ${urlsToVisit.length} sub-collection URLs:`);
  urlsToVisit.forEach(u => console.log(` - ${u}`));

  const allItems = [];

  // 2. Visit each sub-collection
  for (const url of urlsToVisit) {
    if (allItems.length >= TARGET_COUNT) break;
    
    console.log(`\nVisiting ${url}...`);
    try {
      const { data: pageHtml } = await axios.get(url);
      const $$ = cheerio.load(pageHtml);
      
      // Determine a rough category from the page title
      // e.g. "Collection of Mycenaean Antiquities"
      let pageTitle = $$('h2').first().text().trim(); 
      // Fallback if h2 isn't the title
      if (!pageTitle) pageTitle = $$('title').text();

      // Clean up title for 'category'
      const category = pageTitle.replace('Collection of ', '').split('|')[0].trim();

      // 3. Extract Items
      // The items are in <div class="item"> ... <a class="thumb" ... data-el_name="...">
      const items = $$('.modalgallery .item a.thumb');
      
      console.log(`Found ${items.length} items on this page.`);

      items.each((i, el) => {
        if (allItems.length >= TARGET_COUNT) return;

        const elName = $$(el).attr('data-el_name') || '';
        const elTxt = $$(el).attr('data-el_txt') || '';
        const rawImage = $$(el).attr('data-image') || '';
        
        // title often contains date/loc, e.g. "Gold death-mask... 16th cent. BC"
        // Let's try to split title and date if possible, but keeping it whole is safer for now.
        // Or we can try to extract date from the end.
        
        // Image cleanup: ensure valid URL
        let image = rawImage;
        // Sometimes rawImage might be relative or broken, but they looked absolute in the grep.
        
        // ID generation
        const id = 'nam-' + Math.random().toString(36).substr(2, 9);

        // Simple medium inference
        let medium = 'Artifact';
        const lowerText = (elName + ' ' + elTxt).toLowerCase();
        if (lowerText.includes('gold')) medium = 'Gold';
        else if (lowerText.includes('bronze')) medium = 'Bronze';
        else if (lowerText.includes('marble')) medium = 'Marble';
        else if (lowerText.includes('clay') || lowerText.includes('terracotta') || lowerText.includes('pottery')) medium = 'Ceramic';
        else if (lowerText.includes('fresco')) medium = 'Fresco';
        
        // Push item
        if (elName && image) {
            allItems.push({
                id,
                title: elName, // We can clean this up later or in the UI
                artist: 'Unknown', // Typically unknown for antiquities
                date: extractDate(elName) || 'Unknown',
                medium,
                dimensions: '', // Not easily available without text parsing
                image,
                url: url, // Link back to collection page as there is no single item page
                description: elTxt,
                category
            });
        }
      });

    } catch (err) {
      console.error(`Failed to scrape ${url}: ${err.message}`);
    }
  }

  // 4. Save
  console.log(`\nTotal items scraped: ${allItems.length}`);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allItems, null, 2));
  console.log(`Saved to ${OUTPUT_FILE}`);
}

function extractDate(text) {
    // Look for patterns like "16th cent. BC", "1500 BC", etc.
    const dateRegex = /(\d+(?:st|nd|rd|th)?\s+cent\.\s+(?:BC|AD))|(\d+\s*-\s*\d+\s+(?:BC|AD))/i;
    const match = text.match(dateRegex);
    return match ? match[0] : null;
}

scrape();
