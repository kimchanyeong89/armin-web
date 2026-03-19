const axios = require('axios');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.resolve(__dirname, '../wawel-artworks.json');
const API_URL = 'https://cyfrowy.wawel.krakow.pl/api/catalogue/search';
const IMAGE_BASE_URL = 'https://cyfrowy.wawel.krakow.pl/iiif/3/';
const BATCH_SIZE = 50;

const IGNORED_CATEGORY_ID = "6123ed15a008bc0409edb674"; // The one we used in POC

async function scrape() {
  let offset = 0;
  let allItems = [];
  let totalCount = 0;
  
  // Headers
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
    'Content-Type': 'application/json',
    'Origin': 'https://cyfrowy.wawel.krakow.pl',
    'Referer': 'https://cyfrowy.wawel.krakow.pl/en'
  };

  console.log(`Starting Wawel scrape...`);

  while (true) {
    const payload = {
      "categoryId": IGNORED_CATEGORY_ID,
      "sortBy": { "field": "numerInwentarza", "direction": 1 },
      "offset": offset,
      "limit": BATCH_SIZE // API might ignore this but good to document intent
    };

    try {
      const response = await axios.post(API_URL, payload, { headers });
      const data = response.data;

      // Update total count
      if (offset === 0) {
        totalCount = data.totalCount;
        console.log(`Total items to fetch: ${totalCount}`);
      }

      const items = data.records || [];
      if (items.length === 0) {
        console.log('No more items returned. Stopping.');
        break;
      }

      // Process items
      const processedItems = items.map(item => {
        // Construct image URL
        let imageUrl = null;
        if (item.firstPhoto && item.firstPhoto.file) {
            imageUrl = IMAGE_BASE_URL + item.firstPhoto.file + '/full/max/0/default.jpg';
        } else if (item.photos && item.photos.length > 0 && item.photos[0].file) {
            imageUrl = IMAGE_BASE_URL + item.photos[0].file + '/full/max/0/default.jpg';
        }

        return {
          ...item,
          generated_image_url: imageUrl,
          scraped_at: new Date().toISOString()
        };
      });

      allItems = allItems.concat(processedItems);
      console.log(`Fetched ${items.length} items (Offset: ${offset}). Total so far: ${allItems.length}`);

      offset += items.length; // Use actual returned length to increment
      
      // Safety check
      if (offset >= totalCount) {
          console.log('Reached total count.');
          break;
      }

      // Small delay
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      console.error(`Error at offset ${offset}:`, error.message);
      // Retry logic? For now, just break or continue?
      // Better to stop to inspect
      console.error('Stopping script due to error.');
      break;
    }
  }

  // Save to file
  console.log(`Saving ${allItems.length} items to ${OUTPUT_FILE}...`);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allItems, null, 2));
  console.log('Done.');
}

scrape();
