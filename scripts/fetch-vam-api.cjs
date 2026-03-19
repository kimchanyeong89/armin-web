const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Utilities
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const CONFIGS = [
  {
    name: 'oil_paintings',
    params: {
      id_category: 'THES48917',
      // kw_object_type: 'Oil painting' -> filter by objectType
      // kw_location_type: 'display' -> filter by onDisplay
    },
    filter: (item) => item.objectType === 'Oil painting' && item._currentLocation?.onDisplay === true
  },
  {
    name: 'paintings',
    params: {
      id_category: 'THES48917',
      // kw_object_type: 'Painting'
    },
    filter: (item) => item.objectType === 'Painting' && item._currentLocation?.onDisplay === true
  },
  {
    name: 'posters',
    params: {
      id_category: 'THES48903',
      // kw_object_type: 'Poster'
    },
    filter: (item) => item.objectType === 'Poster' && item._currentLocation?.onDisplay === true
  },
  {
    name: 'watercolours',
    params: {
        // No id_category in the URL provided for watercolours?
        // URL: ...kw_object_type=Watercolour...
        // But let's check the URL list again.
        // https://collections.vam.ac.uk/search/?images_exist=true&kw_location_type=display&kw_object_type=Watercolour&page=3&page_size=15&q=
        // No id_category. So we must rely on q=Watercolour or just fetch generic and filter.
        // Actually q param is empty in the URL.
        q: 'Watercolour' 
    },
    filter: (item) => item.objectType === 'Watercolour' && item._currentLocation?.onDisplay === true
  }
];

// Helper to map V&A item to our schema
function mapItem(record) {
  // Try to find image
  let image = null;
  if (record._images && record._images._primary_thumbnail) {
    // Convert thumbnail to larger image if possible, or just use it
    // The thumbnail is .../full/!100,100/0/default.jpg
    // We can try .../full/full/0/default.jpg for max res
    image = record._images._primary_thumbnail.replace('!100,100', 'full');
  }

  // Maker
  const artist = record._primaryMaker?.name || 'Unknown';

  // Date
  const date = record._primaryDate || '';

  // Title
  const title = record._primaryTitle || record.objectType || 'Untitled';

  return {
    id: record.systemNumber,
    title: title,
    artist: artist,
    date: date,
    image: image,
    url: `https://collections.vam.ac.uk/item/${record.systemNumber}`,
    source: 'Victoria and Albert Museum',
    dimensions: '' // Not in search result, needing detail fetch? Search result has minimal info.
    // Ideally we fetch details if dims are needed, but for now let's stick to list.
  };
}

async function fetchForConfig(config) {
  const items = [];
  let page = 1;
  const PAGE_SIZE = 50; // Maximize efficiency
  const TARGET_COUNT = 15;

  console.log(`Starting fetch for ${config.name}...`);

  while (items.length < TARGET_COUNT && page < 20) { // Safety limit of 20 pages
    const queryParams = new URLSearchParams({
      page: page.toString(),
      page_size: PAGE_SIZE.toString(),
      images_exist: 'true'
    });
    
    // Add config params
    Object.entries(config.params).forEach(([key, value]) => {
        if (value) queryParams.append(key, value);
    });

    const url = `https://api.vam.ac.uk/v2/objects/search?${queryParams.toString()}`;
    console.log(`  Fetching ${url}`);

    try {
      const response = await axios.get(url);
      const records = response.data.records || [];
      
      if (records.length === 0) {
        console.log('  No more records found.');
        break;
      }

      for (const record of records) {
        if (config.filter(record)) {
          items.push(mapItem(record));
          if (items.length >= TARGET_COUNT) break;
        }
      }
      
      console.log(`  Found ${items.length} valid items so far...`);
      page++;
      await wait(500); // Be nice to API

    } catch (err) {
      console.error(`  Error fetching page ${page}:`, err.message);
      break;
    }
  }
  
  return items;
}

(async () => {
  const allResults = {};

  for (const config of CONFIGS) {
    allResults[config.name] = await fetchForConfig(config);
  }

  // Combine or save separately?
  // Let's print summary and save to 'vam-highlights.json'
  const flatList = Object.values(allResults).flat();
  
  console.log(`Total collected: ${flatList.length}`);
  
  fs.writeFileSync('vam-highlights.json', JSON.stringify(flatList, null, 2));
  console.log('Saved to vam-highlights.json');
})();
