
const fs = require('fs');
const path = require('path');
const https = require('https');

const FILE_PATH = path.join(__dirname, '../public/data/smb-neue-nationalgalerie-collection.json');
const OUT_PATH = FILE_PATH; // Overwrite
const CONCURRENCY = 50;

const items = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
console.log(`Checking ${items.length} items...`);

async function checkUrl(url) {
  if (!url) return false;
  
  return new Promise((resolve) => {
    const req = https.request(url, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://recherche.smb.museum/'
      },
      timeout: 2000
    }, (res) => {
      // Accept 200 OK. 
      // 403/415 are definitely bad for us.
      if (res.statusCode === 200) {
        resolve(true);
      } else {
        // Double check with GET if HEAD fails? 
        // Based on curl test, 415 came on both HEAD and GET for broken ones.
        // 200 came on HEAD for working one.
        resolve(false);
      }
      res.destroy();
    });

    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

async function processBatch(batch) {
  return Promise.all(batch.map(async (item) => {
    if (!item.imageUrl) return null; // Already no image
    
    // Check main image
    const isOk = await checkUrl(item.imageUrl);
    if (isOk) return item;
    
    // If not OK, can we try thumbnail?
    if (item.thumbnailUrl && item.thumbnailUrl !== item.imageUrl) {
        const thumbOk = await checkUrl(item.thumbnailUrl);
        if (thumbOk) {
            console.log(`[Switch] ${item.id} main failed, using thumb`);
            item.imageUrl = item.thumbnailUrl;
            return item;
        }
    }

    // Try finding another image in 'images' array?
    if (item.images && item.images.length > 0) {
        for (const img of item.images) {
            if (img.url === item.imageUrl) continue;
            if (await checkUrl(img.url)) {
                 console.log(`[Switch] ${item.id} main failed, using alt`);
                 item.imageUrl = img.url;
                 return item;
            }
        }
    }

    console.log(`[Fail] ${item.id} - ${item.title}`);
    return null; // Remove item
  }));
}

async function main() {
  const validItems = [];
  let processed = 0;
  
  // Split into chunks
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const batch = items.slice(i, i + CONCURRENCY);
    const results = await processBatch(batch);
    
    for (const res of results) {
      if (res) validItems.push(res);
    }
    
    processed += batch.length;
    process.stdout.write(`Processed ${processed}/${items.length}. Valid: ${validItems.length}   \r`);
  }
  
  console.log(`\nFinished.`);
  console.log(`Original: ${items.length}`);
  console.log(`Retained: ${validItems.length}`);
  
  fs.writeFileSync(OUT_PATH, JSON.stringify(validItems, null, 2));
  console.log(`Updated ${OUT_PATH}`);
}

main().catch(console.error);
