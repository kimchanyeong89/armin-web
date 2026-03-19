#!/usr/bin/env node
// Scrape Walker Art Gallery collection from Wikidata
// Wikidata ID: Q1536471
// Total: ~2279 works, ~1511 with images
// Images from Wikimedia Commons (freely accessible, no 403)

const https = require('https');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../public/data/walker-art-gallery-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/walker-wikidata-progress.json');

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'ArtCollectionBot/1.0 (https://github.com/armin; research)',
        'Accept': 'application/json',
      }
    }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function sparql(query) {
  const url = 'https://query.wikidata.org/sparql?query=' + encodeURIComponent(query) + '&format=json';
  let attempts = 0;
  while (attempts < 3) {
    try {
      const r = await get(url);
      if (r.status === 429) {
        const wait = 60000 + attempts * 30000;
        console.log(`Rate limited. Waiting ${wait/1000}s...`);
        await sleep(wait);
        attempts++;
        continue;
      }
      if (r.status !== 200) throw new Error(`SPARQL status: ${r.status}`);
      return JSON.parse(r.body).results.bindings;
    } catch(e) {
      attempts++;
      if (attempts >= 3) throw e;
      await sleep(5000 * attempts);
    }
  }
}

// Build Wikimedia thumbnail URL from Commons file path
function buildCommonsThumb(filePath, width = 600) {
  // filePath like: http://commons.wikimedia.org/wiki/Special:FilePath/FILENAME
  const encodedName = filePath.split('/').pop();
  const decodedName = decodeURIComponent(encodedName).replace(/ /g, '_');
  // Wikimedia thumb URL format
  const md5 = require('crypto').createHash('md5').update(decodedName).digest('hex');
  const dir1 = md5[0];
  const dir2 = md5[0] + md5[1];
  const encodedForThumb = encodeURIComponent(decodedName).replace(/%20/g, '_');
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${dir1}/${dir2}/${encodedForThumb}/${width}px-${encodedForThumb}`;
}

// Alternative: use Special:FilePath which redirects to actual file
function buildCommonsUrl(filePath, width = 600) {
  const encodedName = filePath.split('/').pop();
  const decodedName = decodeURIComponent(encodedName);
  // Use Special:FilePath with width param (doesn't need md5)
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${decodedName}?width=${width}`;
}

async function fetchAllWalkerArtworks() {
  console.log('Fetching Walker Art Gallery artworks from Wikidata...');
  console.log('Walker Art Gallery QID: Q1536471');

  // Fetch in batches with OFFSET/LIMIT
  const BATCH_SIZE = 500;
  let offset = 0;
  let allItems = [];
  
  // Load progress if exists
  if (fs.existsSync(PROGRESS_FILE)) {
    const prog = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    allItems = prog.items || [];
    offset = prog.offset || 0;
    console.log(`Resuming from offset ${offset}, ${allItems.length} items so far`);
  }

  let hasMore = true;
  while (hasMore) {
    console.log(`\nFetching offset ${offset}...`);
    
    const results = await sparql(`
SELECT ?item ?itemLabel ?image ?creatorLabel ?date ?medium ?dimensions ?accNo WHERE {
  ?item wdt:P195 wd:Q1536471.
  ?item wdt:P18 ?image.
  OPTIONAL { ?item wdt:P170 ?creator }
  OPTIONAL { ?item wdt:P571 ?date }
  OPTIONAL { ?item wdt:P186 ?medium }
  OPTIONAL { ?item wdt:P217 ?accNo }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
} LIMIT ${BATCH_SIZE} OFFSET ${offset}
    `);
    
    console.log(`Got ${results.length} results`);
    
    for (const r of results) {
      const qid = r.item.value.split('/').pop();
      const title = r.itemLabel?.value || 'Untitled';
      const rawImageUrl = r.image?.value || '';
      const artist = r.creatorLabel?.value || '';
      const date = r.date?.value ? r.date.value.split('T')[0].split('-')[0] : '';
      const accNo = r.accNo?.value || '';
      
      // Build accessible image URL via Wikimedia
      const imageUrl = rawImageUrl ? buildCommonsUrl(rawImageUrl, 600) : '';
      
      allItems.push({
        id: `walker-wd-${qid}`,
        title,
        artist,
        year: date,
        image: imageUrl,
        accessionNumber: accNo,
        sourceUrl: r.item.value,
        wikidataId: qid,
        commonsFile: rawImageUrl,
      });
    }
    
    if (results.length < BATCH_SIZE) {
      hasMore = false;
    } else {
      offset += BATCH_SIZE;
      // Save progress
      fs.mkdirSync(path.dirname(PROGRESS_FILE), { recursive: true });
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ items: allItems, offset }, null, 2));
      
      // Polite delay
      await sleep(2000);
    }
  }
  
  console.log(`\nTotal items fetched: ${allItems.length}`);
  return allItems;
}

async function verifyImageSample(items, sampleSize = 5) {
  console.log(`\nVerifying ${sampleSize} image URLs...`);
  const sample = items.filter(i => i.image).slice(0, sampleSize);
  
  for (const item of sample) {
    try {
      const r = await get(item.image);
      const contentType = r.headers['content-type'] || '';
      const isImage = contentType.startsWith('image/');
      const isRedirect = r.status === 301 || r.status === 302;
      console.log(`  ${r.status} ${isRedirect ? '→ ' + r.headers.location?.slice(0,60) : ''} [${contentType.slice(0,30)}] - ${item.title.slice(0,40)}`);
      if (isRedirect && r.headers.location) {
        // Follow redirect once to check
        const r2 = await get(r.headers.location);
        const ct2 = r2.headers['content-type'] || '';
        console.log(`    Followed: ${r2.status} [${ct2.slice(0,30)}]`);
      }
    } catch(e) {
      console.log(`  ERROR: ${e.message} - ${item.title.slice(0,40)}`);
    }
    await sleep(300);
  }
}

(async () => {
  try {
    // First check total count and with images
    console.log('=== Checking counts ===');
    const countRes = await sparql(`
SELECT (COUNT(?item) AS ?cnt) WHERE {
  ?item wdt:P195 wd:Q1536471.
  ?item wdt:P18 ?image.
}`);
    console.log('Total with images:', countRes[0]?.cnt?.value);
    
    const items = await fetchAllWalkerArtworks();
    
    // Verify a few images
    await verifyImageSample(items, 5);
    
    // Build output
    const output = {
      galleryId: 'wag-collection',
      galleryName: 'Walker Art Gallery',
      location: 'Liverpool, England',
      source: 'wikidata',
      scrapedAt: new Date().toISOString(),
      totalObjects: items.length,
      objects: items
    };
    
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    console.log(`\n✅ Saved ${items.length} items to ${OUTPUT_FILE}`);
    
    // Stats
    const withImages = items.filter(i => i.image).length;
    const withArtist = items.filter(i => i.artist).length;
    console.log(`  With images: ${withImages}`);
    console.log(`  With artist: ${withArtist}`);
    
    // Delete progress file
    if (fs.existsSync(PROGRESS_FILE)) fs.unlinkSync(PROGRESS_FILE);
    
  } catch(e) {
    console.error('FATAL:', e.message);
    process.exit(1);
  }
})();
