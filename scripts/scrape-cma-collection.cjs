const fs = require('fs');
const path = require('path');
const https = require('https');

const OUTPUT_FILE = path.join(__dirname, '../public/data/cma-collection.json');
const API_BASE = 'https://openaccess-api.clevelandart.org/api/artworks/';

// Helper for fetch
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function scrapeCMA() {
  console.log('Starting CMA scrape...');
  
  let allItems = [];
  const types = ['Painting', 'Drawing'];
  
  for (const type of types) {
    let skip = 0;
    const limit = 1000;
    let hasMore = true;

    console.log(`Fetching ${type}...`);

    while (hasMore) {
      // url param 'has_image=1' is important
      const url = `${API_BASE}?type=${type}&has_image=1&limit=${limit}&skip=${skip}`;
      try {
        const response = await fetchJson(url);
        const data = response.data;
        
        if (!data || data.length === 0) {
          hasMore = false;
          break;
        }

        console.log(`Fetched ${data.length} items (skip: ${skip})`);
        
        for (const item of data) {
           // On View Logic: Must have a location that isn't null and doesn't look like storage
           const loc = item.current_location;
           const isOnView = loc && 
                            !loc.toLowerCase().includes('storage') && 
                            !loc.toLowerCase().includes('vault') &&
                            !loc.toLowerCase().includes('reserve');

           // Add ALL items, not just on view
           allItems.push({
             id: item.id,
             accessionNumber: item.accession_number,
             title: item.title,
             artist: item.creators && item.creators.length > 0 ? item.creators[0].description : 'Unknown',
             date: item.creation_date,
             medium: item.technique,
             dimensions: item.measurements,
             imageUrl: item.images && item.images.web ? item.images.web.url : null,
             category: item.type,
             gallery: loc,
             department: item.department,
             onView: !!isOnView
           });

        }

        if (data.length < limit) {
          hasMore = false;
        } else {
          skip += limit;
        }

      } catch (err) {
        console.error('Error fetching data:', err);
        hasMore = false; 
      }
    }
  }

  console.log(`Total on-view items found: ${allItems.length}`);
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allItems, null, 2));
  console.log(`Wrote data to ${OUTPUT_FILE}`);
}

scrapeCMA();
