const fs = require('fs');
const https = require('https');
const path = require('path');

const API_URL = "https://api.smb.museum/search/";
const QUERY = "collectionKey:NGNeueNationalgalerie AND assets:*";
const OUTPUT_FILE = path.join(__dirname, '../public/data/smb-neue-nationalgalerie-collection.json');

const CONCURRENCY = 5;

// Helper to wait
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchPage(offset, limit = 50) {
  const payload = {
    q: QUERY,
    limit: limit,
    offset: offset
  };

  return new Promise((resolve, reject) => {
    const req = https.request(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    
    req.on('error', reject);
    req.write(JSON.stringify(payload));
    req.end();
  });
}

function checkImage(url) {
  return new Promise((resolve) => {
    const req = https.request(url, {
      method: 'HEAD',
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }, (res) => {
      if (res.statusCode === 200) {
        resolve(true);
      } else {
        resolve(false);
      }
    });
    req.on('error', () => resolve(false));
    req.end();
  });
}

async function processBatch(items) {
  const results = [];
  const queue = [...items];
  let active = 0;

  return new Promise((resolve) => {
    const next = async () => {
      if (queue.length === 0 && active === 0) {
        resolve(results);
        return;
      }
      
      if (queue.length === 0) return;

      const item = queue.shift();
      active++;

      try {
        const assetId = item.assets && item.assets[0];
        if (!assetId) {
            active--;
            next();
            return;
        }

        const imageUrl = `https://recherche.smb.museum/images/${assetId}_1000x1000.jpg`;
        const isValid = await checkImage(imageUrl);

        if (isValid) {
            // Helper to parse artist
            let artist = "Unknown";
            if (item.involvedParties && item.involvedParties.length > 0) {
                // "Name (Date), Title" -> "Name"
                const parts = item.involvedParties[0].split('(');
                artist = parts[0].trim();
            }

            results.push({
                id: String(item.id),
                title: item.title,
                artist: artist,
                date: item.dating ? item.dating[0] : "",
                medium: item.materialAndTechnique ? item.materialAndTechnique[0] : "",
                dimensions: item.dimensionsAndWeight ? item.dimensionsAndWeight[0] : "",
                imageUrl: imageUrl,
                url: item.permalink || `https://id.smb.museum/object/${item.id}`
            });
            process.stdout.write('+');
        } else {
            process.stdout.write('-');
        }
      } catch (err) {
        console.error(err);
      } finally {
        active--;
        next();
      }
    };

    // Start initial workers
    for (let i = 0; i < CONCURRENCY && i < items.length; i++) {
        next();
    }
  });
}

(async () => {
  try {
    console.log("Starting SMB Scrape...");
    let offset = 0;
    const limit = 50;
    let allItems = [];
    let hasMore = true;

    while (hasMore) {
        console.log(`\nFetching offset ${offset}...`);
        const data = await fetchPage(offset, limit);
        
        if (!data.objects || data.objects.length === 0) {
            hasMore = false;
            break;
        }

        const validItems = await processBatch(data.objects);
        allItems = allItems.concat(validItems);

        offset += limit;
        if (offset >= data.total) { // Use 'total' from response
            hasMore = false;
        }
        
        // Safety break
        if (offset > 5000) break;
    }

    console.log(`\nSaving ${allItems.length} items to ${OUTPUT_FILE}`);
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allItems, null, 2));
    console.log("Done.");

  } catch (e) {
    console.error(e);
  }
})();
