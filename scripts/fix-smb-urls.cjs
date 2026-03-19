
const fs = require('fs');
const path = require('path');
const https = require('https');

const FILE_PATH = path.join(__dirname, '../public/data/smb-neue-nationalgalerie-collection.json');
const OUT_PATH = FILE_PATH; // Overwrite
const CONCURRENCY = 50;

const items = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
console.log(`Processing ${items.length} items...`);

function checkUrl(url) {
  return new Promise((resolve) => {
    const req = https.request(url, {
        method: 'HEAD',
        timeout: 3000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
    }, (res) => {
        resolve(res.statusCode === 200);
        res.destroy();
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

function transformUrl(url) {
    if (!url) return null;
    const match = url.match(/images\/(\d+)_/);
    if (!match) return url; // Cannot parse asset ID
    
    const assetId = match[1];
    const partition = assetId.substring(0, 2);
    
    // We try two patterns:
    // 1. Restricted (more likely for 20th century art): /images/restricted/XX/ID_1000x1000.jpg
    // 2. Standard: /images/XX/ID_1000x1000.jpg
    
    return {
        restricted: `https://recherche.smb.museum/images/restricted/${partition}/${assetId}_1000x1000.jpg`,
        standard: `https://recherche.smb.museum/images/${partition}/${assetId}_1000x1000.jpg`
    };
}

async function processBatch(batch) {
  return Promise.all(batch.map(async (item) => {
    if (!item.imageUrl) return item;
    
    // Transform URL logic
    const urls = transformUrl(item.imageUrl);
    if (!urls) return item; // Keep original if regex fails
    
    // Try Standard first (cleaner URL)
    if (await checkUrl(urls.standard)) {
        item.imageUrl = urls.standard;
        // console.log(`[Standard] ${item.id}`);
        return item;
    }
    
    // Try Restricted
    if (await checkUrl(urls.restricted)) {
        item.imageUrl = urls.restricted;
        // console.log(`[Restricted] ${item.id}`);
        return item;
    }
    
    // If both fail, keep original? Or remove image?
    // User said "Make them show up". 
    // If we fail, it's better to NOT return a broken image url so the UI shows a placeholder?
    // But the user said "If image is missing on original site delete it".
    // Since we know "Original Site" HAS the images, we just failed to find the right URL path.
    // Let's fallback to original URL (maybe verify fails eventually but at least data is there).
    // Actually, if we return the original URL it will 415.
    // Let's keep it but mark it as checked?
    
    // Let's keep the item but maybe NULL the imageUrl if truly broken?
    // "Make them all show up properly again" implies the DATA should be there.
    // "If original site doesn't have image, delete it".
    // But we are processing ALL items (restored from git).
    
    // For now, let's just keep the item. If image fails, React usually handles error.
    // But the user complained about "Inaccessible" images being deleted (only 10 left).
    // So the goal is to MAXIMIZE valid images.
    
    return item;
  }));
}

async function main() {
  let processed = 0;
  
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const batch = items.slice(i, i + CONCURRENCY);
    await processBatch(batch);
    processed += batch.length;
    process.stdout.write(`Processed ${processed}/${items.length}   \r`);
  }
  
  console.log(`\nFinished.`);
  fs.writeFileSync(OUT_PATH, JSON.stringify(items, null, 2));
  console.log(`Updated ${OUT_PATH}`);
}

main().catch(console.error);
