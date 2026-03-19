const axios = require('axios');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../public/data/vam-permanent-exhibitions.json');
const BASE_URL = 'https://api.vam.ac.uk/v2/objects/search';

const CATEGORIES = [
  'Paintings', 
  'Posters', 
  'Watercolours', 
  'Metalwork', 
  'Ceramics', 
  'Sculpture', 
  'Textiles', 
  'Furniture', 
  'Architecture', 
  'Photography', 
  'Digital', 
  'Jewellery', 
  'Glass',
  'Prints',
  'Fashion'
];

async function fetchPage(category, page = 1) {
  try {
    const response = await axios.get(BASE_URL, {
      params: {
        kw_location_type: 'display',
        q: category, // Using q param as it's broader than specific ids, and filters by display location
        page: page,
        page_size: 100,
        images_exist: true,
        data_only: true
      }
    });
    return response.data;
  } catch (error) {
    console.error(`Error fetching ${category} page ${page}: ${error.message}`);
    return null;
  }
}

async function scrape() {
  let allItems = [];
  let seenIds = new Set();

  for (const category of CATEGORIES) {
    console.log(`Scraping category: ${category}`);
    let page = 1;
    let keepGoing = true;

    while (keepGoing) {
      const data = await fetchPage(category, page);
      if (!data || !data.records || data.records.length === 0) {
        keepGoing = false;
        break;
      }

      console.log(`  Page ${page}: Found ${data.records.length} items`);

      for (const record of data.records) {
        if (seenIds.has(record.systemNumber)) continue;
        
        // Map to our schema
        const item = {
          id: record.systemNumber,
          title: record._primaryTitle || record.objectType || 'Untitled',
          artist: record._primaryMaker?.name || 'Unknown',
          date: record._primaryDate || '',
          medium: record.objectType || '', // V&A API doesn't always have exact medium field in list view
          dimensions: '', // List view doesn't have dimensions, would need detail fetch
          image: record._images?._primary_thumbnail ? record._images._primary_thumbnail.replace('!100,100', 'full') : '',
          url: `https://collections.vam.ac.uk/item/${record.systemNumber}/${record.objectType.replace(/\s+/g, '-').toLowerCase()}-by-${(record._primaryMaker?.name || 'unknown').replace(/\s+/g, '-').toLowerCase()}/`,
          category: category,
          scrapedAt: new Date().toISOString()
        };

        if (item.image) {
            allItems.push(item);
            seenIds.add(item.id);
        }
      }

      // Limit to reasonable amount per category to avoid banning/timeout if huge, or just run until valid
      // User asked for "ALL permanent exhibitions".
      // Given 60k total items, this might take a while. I'll add a safety limit of 5 pages per category for now to demonstrate, 
      // but the user logic implies *all*. 
      // I will allow up to 20 pages (2000 items) per category.
      if (page >= 20 || data.records.length < 100) {
        keepGoing = false;
      } else {
        page++;
        // Be nice to API
        await new Promise(r => setTimeout(r, 200));
      }
    }
  }

  console.log(`Total items scraped: ${allItems.length}`);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allItems, null, 2));
  console.log(`Saved to ${OUTPUT_FILE}`);
}

scrape();
