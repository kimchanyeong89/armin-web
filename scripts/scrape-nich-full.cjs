const fs = require('fs');
const path = require('path');
const https = require('https');

// Config
const API_BASE = 'https://colbase.nich.go.jp/colbaseapi/v2/collection_items';
const API_KEY = 'aaa'; 
const OUTPUT_FILE = path.join(__dirname, '../public/data/nich-collection.json');

// Target Korean Filter (User specified)
const TARGET_PARAMS = {
  locale: 'ko',
  limit: 100,
  with_image_file: 1,
  only_parent: 0,
  bunrui: '회화,동양회화', 
  organization_id: '1' // TNM
};

// English Filter - We fetch "Painting" and "Asian Painting" specifically to ensure coverage
const ENGLISH_PARAMS = {
  locale: 'en',
  limit: 100,
  with_image_file: 1,
  only_parent: 0,
  bunrui: 'Painting,Asian Painting', // Explicitly fetch these categories in English
  organization_id: '1'
};

function fetchPage(params, page) {
  const query = new URLSearchParams({
    ...params,
    page: page.toString(),
  }).toString();

  const url = `${API_BASE}?${query}`;

  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'x-api-key': API_KEY }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) throw new Error(res.statusCode);
          resolve(JSON.parse(data));
        } catch (e) { resolve({ resultset: { count: 0 }, results: [] }); } 
      });
    });
    req.on('error', (e) => resolve({ resultset: { count: 0 }, results: [] }));
  });
}

// Regex to clean "By " from artist and simple cleanup
const cleanArtist = (str) => {
  if (!str) return null;
  // Remove 'By ' prefix case insensitive
  let cleaned = str.replace(/^By\s+/i, '').trim();
  return cleaned;
};

// Clean title numbers like "01 Title"
const cleanTitle = (str) => {
  if (!str) return str;
  return str.replace(/^[\d\.]+\s+/, '').trim();
};

async function run() {
  console.log('--- Step 1: Fetching English "Painting + Asian Painting" Map ---');
  const enMap = new Map();
  let page = 1;
  let hasMore = true;
  
  while (hasMore) {
    if (page % 5 === 0) process.stdout.write(`EN Page ${page}... `);
    const data = await fetchPage(ENGLISH_PARAMS, page);
    
    if (!data.results || data.results.length === 0) {
      hasMore = false;
      break;
    }
    
    data.results.forEach(item => {
      const joinKey = item.organization_item_key || String(item.id);
      
      let imageUrl = item.thumbnail_url;
      if (imageUrl && imageUrl.includes('/thumbnail/')) {
        imageUrl = imageUrl.replace('/thumbnail/', '/regular/');
      }

      enMap.set(joinKey, {
        title: cleanTitle(item.title),
        artist: cleanArtist(item.sakusha), 
        date: item.jidai_seiki,
        medium: item.hinshitu_keijo,
        image: imageUrl,
        source_id: item.organization_item_key || item.key
      });
    });

    if (enMap.size >= data.resultset.count) hasMore = false;
    page++;
    await new Promise(r => setTimeout(r, 50));
  }
  process.stdout.write('\n');
  console.log(`Loaded ${enMap.size} English items.`);

  console.log('--- Step 2: Fetching Target List (Korean) & Merging ---');
  let targetItems = [];
  page = 1;
  hasMore = true;

  while(hasMore) {
    process.stdout.write(`KO Page ${page}... `);
    const data = await fetchPage(TARGET_PARAMS, page);

    if (!data.results || data.results.length === 0) {
      hasMore = false;
      break;
    }

    const mapped = data.results.map(item => {
      const id = String(item.id);
      const joinKey = item.organization_item_key || id;
      
      // Lookup English Data
      const enData = enMap.get(joinKey);

      // Mapping Logic: Always prefer English data if available.
      // Force Category to "Painting" as requested ("Unify").
      
      let title = enData?.title || cleanTitle(item.title);
      let artist = enData?.artist || cleanArtist(item.sakusha);
      let date = enData?.date || item.jidai_seiki;
      let medium = enData?.medium || item.hinshitu_keijo;
      let imageUrl = enData?.image;

      if (!imageUrl) {
         imageUrl = item.thumbnail_url;
         if (imageUrl && imageUrl.includes('/thumbnail/')) {
           imageUrl = imageUrl.replace('/thumbnail/', '/regular/');
         }
      }

      return {
        id,
        title,
        artist,
        date,
        medium,
        category: "Painting", // Unified Category
        image: imageUrl,
        width: null,
        height: null,
        source_org: "Tokyo National Museum",
        source_id: item.organization_item_key || item.key
      };
    });

    targetItems = targetItems.concat(mapped);
    
    if (targetItems.length >= data.resultset.count) hasMore = false;
    page++;
    await new Promise(r => setTimeout(r, 100));
  }
  process.stdout.write('\n');

  console.log(`Total Target Items: ${targetItems.length}`);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(targetItems, null, 2));
  console.log(`Saved ${targetItems.length} items to ${OUTPUT_FILE}`);
}

run();
