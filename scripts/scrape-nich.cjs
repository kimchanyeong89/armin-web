const fs = require('fs');
const path = require('path');
const https = require('https');

// Config
const API_BASE = 'https://colbase.nich.go.jp/colbaseapi/v2/collection_items';
const API_KEY = 'aaa'; // Hardcoded public key from frontend
const OUTPUT_FILE = path.join(__dirname, '../public/data/nich-collection.json');

// User Request:
// Organization ID: 1 (Tokyo National Museum)
// Categories: bunrui="회화,동양회화" (Painting, Oriental Painting)
// We map "Painting" to English Category ID 293 (Paintings, sketches, and prints)
// Locale: en (English display preferred)

const PARAMS = {
  locale: 'en',
  limit: 100,
  with_image_file: 1,
  only_parent: 0,
  category_ids: '293', // Paintings
  organization_id: '1', // Tokyo National Museum
};

async function fetchPage(page) {
  const query = new URLSearchParams({
    ...PARAMS,
    page: page.toString(),
  }).toString();

  const url = `${API_BASE}?${query}`;
  console.log(`Fetching page ${page}: ${url}`);

  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'x-api-key': API_KEY,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`API returned ${res.statusCode}: ${data}`));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
  });
}

async function run() {
  let allItems = [];
  let page = 1;
  let hasMore = true;

  try {
    while (hasMore) {
      const data = await fetchPage(page);
      
      if (!data.results || data.results.length === 0) {
        hasMore = false;
        break;
      }

      const mapped = data.results.map(item => {
        // Construct image URL
        // From: https://colbase.nich.go.jp/media/tnm/A-12/image/thumbnail/A-12_E0071674.jpg
        // To:   https://colbase.nich.go.jp/media/tnm/A-12/image/regular/A-12_E0071674.jpg
        let imageUrl = item.thumbnail_url;
        if (imageUrl && imageUrl.includes('/thumbnail/')) {
          imageUrl = imageUrl.replace('/thumbnail/', '/regular/');
        }

        return {
          id: item.id.toString(), // Keep as string for consistency
          title: item.title, // English title (since locale=en)
          artist: item.sakusha,
          date: item.jidai_seiki,
          medium: item.hinshitu_keijo,
          category: item.bunrui, // "Painting"
          image: imageUrl,
          width: null, // API doesn't seem to provide dims easily in list
          height: null,
          source_org: item.organization_title, // "Tokyo National Museum"
          source_id: item.organization_item_key || item.key,
        };
      });

      allItems = allItems.concat(mapped);
      console.log(`Page ${page}: got ${mapped.length} items. Total so far: ${allItems.length}`);

      if (allItems.length >= data.resultset.count) {
        hasMore = false;
      }
      
      page++;
      // Be nice to the API
      await new Promise(r => setTimeout(r, 200));
    }

    console.log(`Total collected: ${allItems.length}`);
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allItems, null, 2));
    console.log(`Saved to ${OUTPUT_FILE}`);

  } catch (error) {
    console.error('Error scraping:', error);
    process.exit(1);
  }
}

run();
