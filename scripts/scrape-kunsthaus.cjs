
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../public/data/kunsthaus-collection.json');
const TARGET_COUNT = 100; // User asked for 100 initially

const API_URL = 'https://collection.kunsthaus.ch/solr/published/select';
const BASE_IMG_URL = 'https://collection.kunsthaus.ch/';

// Categories from the user's URL
const CATEGORIES = [
  "mixed genre", "painting", "photograph", "single-channel video", 
  "time-based medium", "watercolour", "multiple", "performance art", 
  "photomontage", "sketchbook", "video art", "object", "photo collage", 
  "portfolio", "single sheet from portfolio", "textile", "video installation"
];

// Construct the Solr Filter Query
function buildCategoryFilter() {
  const joined = CATEGORIES.map(c => `"${c}"`).join(' OR ');
  return `{!tag=et_category_en_s}category_en_s:(${joined})`;
}

async function scrape() {
  console.log('Fetching data from Kunsthaus Zürich Solr API...');

  try {
    const params = new URLSearchParams();
    params.append('q', '*:*');
    params.append('fq', 'type:Object');         // Only Objects
    params.append('fq', 'thumb_s:*');           // Only with thumbnails (as requested "withImages")
    params.append('fq', buildCategoryFilter()); // Filter by specific categories
    params.append('rows', TARGET_COUNT);        // Limit
    params.append('fl', '*,score');             // All fields
    params.append('wt', 'json');                // JSON format
    params.append('sort', 'last_modified_sml desc');

    const response = await axios.get(API_URL, { params });
    const docs = response.data?.response?.docs;

    if (!docs || docs.length === 0) {
      console.error('No items found!');
      return;
    }

    console.log(`Found ${docs.length} items.`);

    const artworks = docs.map(doc => {
      // Determine "On View" status
      // Field: on_view_s_en_s
      // Values seen: "not on display", presumably "on display"??
      // Let's also check location.
      const statusText = (doc.on_view_s_en_s || '').toLowerCase();
      // Logic: if it explicitly says NOT on display, it's false. 
      // If it says "on display" or implies a location, it's true.
      // We'll assume false unless proven true, or check for "not".
      const isOnView = statusText.includes('on display') && !statusText.includes('not on display');
      
      // Alternative check: maybe check if location_en_ss is present and doesn't contain "Depot"
      // But statusText is cleaner if available.
      // Let's refine based on data later if needed. For now, trust the text.
      // Actually, if statusText is "not on display", likely strictly false. 
      // If it is missing or different, we'll see.
      
      // Map fields
      return {
        id: `kunsthaus-${doc.oid}`,
        title: doc.title_s,
        artist: doc.person_masonry_en_s || (doc.person_name_en_ss ? doc.person_name_en_ss[0] : 'Unknown'),
        date: doc.date_en_s || doc.date_n || '',
        medium: doc.material_tech_en_s || doc.category_en_s || 'Unknown',
        dimensions: doc.dimensions_en_s || '', // Checking if this field exists, otherwise empty
        image: doc.img_s ? (BASE_IMG_URL + doc.img_s) : null,
        url: `https://collection.kunsthaus.ch/en/collection/item/${doc.oid}/`,
        onView: isOnView,
        location: doc.location_en_ss ? doc.location_en_ss.join(', ') : '',
        category: doc.category_en_s
      };
    });

    // Save
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(artworks, null, 2));
    console.log(`Saved ${artworks.length} items to ${OUTPUT_FILE}`);

  } catch (err) {
    console.error('Error fetching data:', err.message);
    if (err.response) {
      console.error('API Response:', err.response.data);
    }
  }
}

scrape();
