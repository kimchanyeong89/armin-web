const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT_FILE = path.join(__dirname, '../public/data/smb-neue-nationalgalerie-collection.json');
const API_URL = "https://api.smb.museum/search/";
const QUERY = "collectionKey:NGNeueNationalgalerie";
const BATCH_SIZE = 100;

// Helper to check URL validity (HEAD request)
function checkUrl(url) {
  return new Promise((resolve) => {
    try {
      const req = https.request(url, {
        method: 'HEAD',
        timeout: 5000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      }, (res) => {
        if (res.statusCode === 200) resolve(true);
        else {
          // Consume response to free memory
          res.resume(); 
          resolve(false);
        }
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
      req.end();
    } catch (e) {
      resolve(false);
    }
  });
}

// Generate candidate URLs
function getCandidateUrls(assetId) {
  if (!assetId) return [];
  const partition = assetId.substring(0, 2);
  return [
    `https://recherche.smb.museum/images/restricted/${partition}/${assetId}_1000x1000.jpg`,
    `https://recherche.smb.museum/images/${partition}/${assetId}_1000x1000.jpg`
  ];
}

async function fetchPage(offset) {
  const payload = {
    q: QUERY,
    limit: BATCH_SIZE,
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

function cleanArtist(str) {
  if (!str) return '';
  // "Sam Francis (1923 - 1994), Künstler*in" -> "Sam Francis"
  // Clean comma role first
  let temp = str.split(',')[0].trim();
  // Remove life dates parens if at end
  temp = temp.replace(/\s*\([^)]+\)$/, '').trim();
  return temp;
}

async function main() {
  console.log(`Starting scrape for ${QUERY}...`);
  let allItems = [];
  let offset = 0;
  let total = 1; // Unknown start

  // 1. Fetch all metadata
  while (offset < total) {
    console.log(`Fetching offset ${offset}...`);
    try {
      const data = await fetchPage(offset);
      total = data.total;
      
      const mapped = data.objects.map(obj => {
        const assetId = (obj.assets && obj.assets.length > 0) ? obj.assets[0] : null;
        
        return {
          id: String(obj.id),
          title: obj.title,
          artist: obj.involvedParties ? cleanArtist(obj.involvedParties[0]) : '',
          date: (obj.dating && obj.dating[0]) || obj.dateRange || '',
          medium: (obj.materialAndTechnique && obj.materialAndTechnique[0]) || '',
          dimensions: (obj.dimensionsAndWeight && obj.dimensionsAndWeight[0]) || '',
          sourceUrl: obj.permalink,
          assetId: assetId,
          imageUrl: null // Filled later
        };
      });

      allItems = allItems.concat(mapped);
      offset += BATCH_SIZE;
      
      // Safety break
      if (mapped.length === 0) break;
      
    } catch (e) {
      console.error(`Error at offset ${offset}:`, e);
      // Wait and retry? Or skip
      break;
    }
  }

  console.log(`Fetched ${allItems.length} items. validating images...`);

  // 2. Validate images concurrently
  // We process in chunks to avoid opening too many sockets
  const CONCURRENCY = 20;
  const validItems = [];
  
  for (let i = 0; i < allItems.length; i += CONCURRENCY) {
    const chunk = allItems.slice(i, i + CONCURRENCY);
    const promises = chunk.map(async (item) => {
      if (!item.assetId) return item;

      const candidates = getCandidateUrls(item.assetId);
      
      // Try first candidate (restricted)
      if (await checkUrl(candidates[0])) {
        item.imageUrl = candidates[0];
        return item;
      }
      
      // Try second candidate (standard)
      if (await checkUrl(candidates[1])) {
        item.imageUrl = candidates[1];
        return item;
      }

      // No valid image found
      // console.log(`No image for ${item.id} (${item.assetId})`);
      return item;
    });

    const processed = await Promise.all(promises);
    validItems.push(...processed);
    
    if (i % 100 === 0) {
      process.stdout.write(`\rProcessed ${i}/${allItems.length}`);
    }
  }
  
  console.log('\rDone processing images.');
  
  // Filter out items without images if desired? 
  // User said "Make the images show up". If no image, maybe keep item but it won't show image.
  // Generally we prefer items with images. keeping all for now.
  
  console.log(`Saving ${validItems.length} items to ${OUT_FILE}`);
  fs.writeFileSync(OUT_FILE, JSON.stringify(validItems, null, 2));
}

main();
