const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const https = require('https');

const OUTPUT_FILE = path.join(__dirname, '../public/data/hermitage-highlights.json');

// Create an HTTPS agent that ignores SSL errors
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

async function fetchPage(pageNumber) {
  const form = new FormData();
  form.append('lng', 'en');
  form.append('page', String(pageNumber));
  form.append('categories', 'all');
  form.append('fund', '');
  form.append('material', '');
  form.append('author_sort', '');

  try {
    const response = await axios.post('https://www.hermitagemuseum.org/api/collections/load/highlights', form, {
      headers: {
        ...form.getHeaders(),
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.hermitagemuseum.org/explore/highlights?lng=en&page=1&collection_categories=all',
        'Origin': 'https://www.hermitagemuseum.org'
      },
      httpsAgent: httpsAgent
    });

    if (response.data && response.data.error === 'ok' && response.data.data) {
      return {
          items: response.data.data.highlights || [],
          totalPages: response.data.data.totalPages || 0
      };
    }
    return { items: [], totalPages: 0 };
  } catch (error) {
    console.error(`❌ Error fetching page ${pageNumber}:`, error.message);
    return { items: [], totalPages: 0 };
  }
}

function extractValue(paramObj) {
  if (!paramObj || !paramObj.value) return '';
  
  if (Array.isArray(paramObj.value)) {
    return paramObj.value.map(v => {
      if (typeof v === 'string') return v;
      if (typeof v === 'object' && v !== null) {
        // Use comment (usually full name) or title or value
        return v.comment || v.title || v.value || '';
      }
      return '';
    }).filter(Boolean).join(', ');
  }
  
  if (typeof paramObj.value === 'object' && paramObj.value !== null) {
      return paramObj.value.comment || paramObj.value.title || paramObj.value.value || '';
  }

  return String(paramObj.value);
}

function extractMetadata(item) {
  // Initialize with defaults
  const meta = {
    id: `hermitage-${item.elementId || item.id}`,
    title: item.name,
    artist: 'Unknown',
    year: '',
    image: item.image ? `https://www.hermitagemuseum.org${item.image}` : '',
    sourceUrl: `https://www.hermitagemuseum.org/wps/portal/hermitage/digital-collection/01.+Paintings/${item.elementId}/`,
    museum: 'State Hermitage Museum',
    // Extended fields
    place: '',
    technique: '',
    material: '',
    dimensions: '',
    inventoryNumber: '',
    acquisition: '',
    category: '',
    series: '',
    raw: item
  };

  // Dynamic extraction from params
  if (item.params) {
      for (const [key, val] of Object.entries(item.params)) {
          if (!val || !val.name) continue;
          
          const label = val.name.toLowerCase().trim();
          const value = extractValue(val);

          if (!value) continue;

          // Map based on label name from the website/API
          if (label === 'author') {
              meta.artist = value;
          } else if (label === 'title') {
              meta.title = value;
          } else if (label === 'place') {
              meta.place = value;
          } else if (label === 'date' || label === 'created') {
              meta.year = value;
          } else if (label === 'technique') {
              meta.technique = value;
          } else if (label === 'material') {
              meta.material = value;
          } else if (label === 'dimensions') {
              meta.dimensions = value;
          } else if (label === 'museum number') {
              meta.inventoryNumber = value;
          } else if (label === 'acquisition details') {
              meta.acquisition = value;
          } else if (label === 'category') {
              meta.category = value;
          } else if (label.includes('album') || label.includes('book') || label.includes('seria')) {
              meta.series = value;
          }
      }
  }

  return meta;
}

(async () => {
  console.log(`🚀 Starting Hermitage Scraper (All Highlights)...`);
  
  let allItems = [];
  let page = 1;
  let totalPages = 1; // Will be updated after first fetch

  while (page <= totalPages) {
    console.log(`📄 Fetching page ${page}/${totalPages === 1 ? '?' : totalPages}...`);
    const { items, totalPages: fetchedTotal } = await fetchPage(page);
    
    // Update totalPages on first fetch (or if it changes)
    if (page === 1 && fetchedTotal > 0) {
        totalPages = fetchedTotal;
        console.log(`📊 Total pages detected: ${totalPages}`);
    }

    if (items.length === 0) {
      console.log('⚠️ No items found on this page. Stopping.');
      break;
    }

    console.log(`   Found ${items.length} items.`);
    
    for (const item of items) {
      const metadata = extractMetadata(item);
      allItems.push(metadata);
    }

    page++;
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`✅ Collected ${allItems.length} items.`);
  
  const dir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(dir)){
      fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allItems, null, 2));
  console.log(`💾 Saved to ${OUTPUT_FILE}`);

  if (allItems.length > 0) {
      console.log('\n🔍 Sample Item (without raw):');
      const sample = { ...allItems[0] };
      delete sample.raw;
      console.log(JSON.stringify(sample, null, 2));
  }
})();
