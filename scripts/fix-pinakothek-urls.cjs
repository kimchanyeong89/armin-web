#!/usr/bin/env node
/**
 * Fix Pinakothek URLs by re-fetching from the updated API.
 * The old sammlung.pinakothek.de/en/artwork/{inventoryId} format now returns 404.
 * The new format is: /en/artwork/{hash}/{artist-slug}/{title-slug}-{inventoryId}
 * The API now returns the correct `url` field.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const API_BASE = 'https://www.sammlung.pinakothek.de/api/search';
const DATA_DIR = path.join(__dirname, '../public/data');
const DELAY_MS = 500;

const COLLECTIONS = {
  'AP': 'alte-pinakothek-collection.json',
  'NP': 'neue-pinakothek-collection.json',
  'PdM': 'pinakothek-moderne-collection.json',
  'SS': 'sammlung-schack-collection.json',
  'SG': 'staatsgalerien-collection.json',
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.sammlung.pinakothek.de/en/extendedsearch',
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try { resolve(JSON.parse(data)); }
          catch(e) { reject(new Error('parse error: ' + data.slice(0, 100))); }
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(new Error('timeout')); });
  });
}

async function fetchAllForLocation(locationCode) {
  const urlMap = {}; // inventoryId -> new URL
  let page = 1;
  let totalFetched = 0;

  const filters = {
    yearRange: { min: 100, max: 2030 },
    artist: '', title: '', inventoryId: '', origin: '',
    material: '', locationCode, department: '', genre: '', year: '',
    onDisplay: false, onHidden: false, withPicture: true,
    publicDomain: false
  };

  while (true) {
    const url = `${API_BASE}?page=${page}&perPage=100&filters=${encodeURIComponent(JSON.stringify(filters))}`;
    let data;
    try {
      data = await fetchJSON(url);
    } catch(e) {
      console.error(`  Error page ${page}: ${e.message}`);
      await sleep(2000);
      continue;
    }

    const items = data.items || data.data || [];
    if (!items.length) break;

    for (const item of items) {
      const invId = String(item.inventoryId || item.id || '');
      const newUrl = (item.url || '').replace('/de/artwork/', '/en/artwork/');
      if (invId && newUrl) {
        urlMap[invId] = newUrl;
      }
    }

    totalFetched += items.length;
    const total = data.total || data.count || '?';
    if (page % 10 === 1) console.log(`  ${locationCode} page ${page}: fetched ${totalFetched}/${total}`);

    // Check if we have all items
    if (data.total && totalFetched >= data.total) break;
    if (items.length < 100) break; // Last page

    page++;
    await sleep(DELAY_MS);
  }

  console.log(`  ${locationCode}: collected ${Object.keys(urlMap).length} URL mappings`);
  return urlMap;
}

async function updateFile(fileName, urlMap) {
  const filePath = path.join(DATA_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    console.warn(`  File not found: ${fileName}`);
    return 0;
  }

  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const objects = raw.objects || raw.items || [];
  let updated = 0;
  let notFound = 0;

  for (const obj of objects) {
    const invId = String(obj.inventoryNumber || obj.inventoryId || '');
    if (invId && urlMap[invId]) {
      obj.url = urlMap[invId];
      updated++;
    } else {
      notFound++;
    }
  }

  fs.writeFileSync(filePath, JSON.stringify(raw, null, 2));
  console.log(`  Updated ${updated} URLs (${notFound} not found in API) in ${fileName}`);
  return updated;
}

async function main() {
  console.log('🔧 Fixing Pinakothek URLs...\n');
  let totalUpdated = 0;

  for (const [locationCode, fileName] of Object.entries(COLLECTIONS)) {
    console.log(`📦 Processing ${locationCode} (${fileName})...`);
    try {
      const urlMap = await fetchAllForLocation(locationCode);
      const n = await updateFile(fileName, urlMap);
      totalUpdated += n;
    } catch(e) {
      console.error(`  ❌ Error for ${locationCode}: ${e.message}`);
    }
    await sleep(1000);
  }

  console.log(`\n✅ Done. Total URLs updated: ${totalUpdated}`);
}

main().catch(console.error);
