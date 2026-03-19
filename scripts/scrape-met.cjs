const fs = require('fs');
const path = require('path');

const MET_API_BASE = 'https://collectionapi.metmuseum.org/public/collection/v1';
const CONCURRENCY = 10;

// Helper to delay (for rate limiting)
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchWithRetry(url, options = {}, retries = 3) {
  try {
    const res = await fetch(url, options);
    if (res.status === 429 || res.status === 403) {
      if (retries > 0) {
        const delay = 2000 + Math.random() * 3000;
        await sleep(delay);
        return fetchWithRetry(url, options, retries - 1);
      }
    }
    return res;
  } catch (err) {
    if (retries > 0) {
      await sleep(2000);
      return fetchWithRetry(url, options, retries - 1);
    }
    // Return null or throw? Throwing might break Promise.all
    console.error(`Fetch failed for ${url}: ${err.message}`);
    return null; 
  }
}

async function getAllObjects(deptId) {
  console.log(`Fetching ALL objects for Dept ${deptId}...`);
  const res = await fetchWithRetry(`${MET_API_BASE}/objects?departmentIds=${deptId}`);
  if (!res || !res.ok) throw new Error(`Failed to fetch objects for dept ${deptId}`);
  const data = await res.json();
  return data.objectIDs || [];
}

async function search(params) {
  const url = new URL(`${MET_API_BASE}/search`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.append(key, value);
  }
  console.log(`Searching: ${url.toString()}`);
  const res = await fetchWithRetry(url.toString());
  if (!res || !res.ok) {
    console.warn(`Search failed for ${url}`);
    return [];
  }
  const data = await res.json();
  return data.objectIDs || [];
}

async function getObjectDetails(id) {
  const res = await fetchWithRetry(`${MET_API_BASE}/objects/${id}`);
  if (!res || !res.ok) return null;
  return await res.json();
}

// Simple concurrency limiter
async function mapConcurrent(items, fn, limit) {
  const results = [];
  const queue = [...items];
  const active = new Set();
  
  while (queue.length > 0 || active.size > 0) {
    while (queue.length > 0 && active.size < limit) {
      const item = queue.shift();
      const p = fn(item).then(res => {
        active.delete(p);
        return res;
      }).catch(err => {
        active.delete(p);
        return null; // Return null on error
      });
      active.add(p);
      results.push(p);
    }
    if (active.size > 0) {
        await Promise.race(active);
    }
  }
  return Promise.all(results);
}

function isRelevant(details) {
  if (!details) return false;
  
  // Must have an image
  const img = details.primaryImage || details.primaryImageSmall;
  if (!img) return false;

  const dept = details.department;
  const cls = (details.classification || '').toLowerCase();
  const med = (details.medium || '').toLowerCase();
  const title = (details.title || '').toLowerCase();
  const type = (details.objectName || '').toLowerCase();
  const isOnView = !!details.GalleryNumber && details.GalleryNumber.trim() !== '';

  // 1. European Paintings (Dept 11) -> Keep ALL with images
  if (dept === 'European Paintings') return true;

  // 2. Modern Art (Dept 21) -> Filter strict
  if (dept === 'Modern Art') {
    // If it's explicitly one of our target types
    const isTargetType = 
       cls.includes('painting') || cls.includes('drawing') || cls.includes('print') ||
       med.includes('canvas') || med.includes('oil') || med.includes('watercolor') ||
       type.includes('painting') || type.includes('drawing');
       
    // If it's On View, we are more lenient, but still must be art (not archival doc, unlikely in Dept 21 but possible)
    if (isOnView && isTargetType) return true;
    
    // If not on view, strict adherence to target types
    if (isTargetType) return true;
    
    return false;
  }

  // 3. Drawings and Prints (Dept 9) -> Keep most (since we searched for them)
  if (dept === 'Drawings and Prints') {
    return true; // We trusted the search query
  }

  // 4. Fallback for others (found via global search count)
  if (med.includes('canvas') || cls.includes('painting')) return true;

  return false;
}

async function run() {
  const allIds = new Set();

  // Phase 1: European Paintings (Get ALL)
  try {
    const dept11 = await getAllObjects(11);
    console.log(`Dept 11 (European Paintings): Found ${dept11.length} IDs`);
    dept11.forEach(id => allIds.add(id));
  } catch (e) {
    console.error('Dept 11 fail:', e);
  }

  // Phase 2: Modern Art (Get ALL)
  try {
    const dept21 = await getAllObjects(21);
    console.log(`Dept 21 (Modern Art): Found ${dept21.length} IDs`);
    dept21.forEach(id => allIds.add(id));
  } catch (e) {
    console.error('Dept 21 fail:', e);
  }

  // Phase 3: Drawings and Prints (Search strategies)
  const d9Terms = ['Drawings', 'Prints', 'Etching', 'Sketch', 'Engraving', 'Lithograph', 'Watercolor'];
  for (const term of d9Terms) {
    const res = await search({ departmentId: 9, q: term, hasImages: true });
    console.log(`Dept 9 search "${term}": Found ${res.length}`);
    res.forEach(id => allIds.add(id));
  }

  // Phase 4: Global "Canvas" search (to catch anything else)
  const canvasRes = await search({ q: 'Canvas', hasImages: true });
  console.log(`Global "Canvas" search: Found ${canvasRes.length}`);
  canvasRes.forEach(id => allIds.add(id));

  const totalIds = Array.from(allIds);
  console.log(`Total Unique IDs to process: ${totalIds.length}`); // Likely ~25k

  const finalItems = [];
  let processed = 0;

  // Process in batches
  const CHUNK_SIZE = 500;
  for (let i = 0; i < totalIds.length; i += CHUNK_SIZE) {
    const chunk = totalIds.slice(i, i + CHUNK_SIZE);
    console.log(`Processing chunk ${Math.floor(i/CHUNK_SIZE) + 1}/${Math.ceil(totalIds.length/CHUNK_SIZE)}...`);
    
    const results = await mapConcurrent(chunk, async (id) => {
      const details = await getObjectDetails(id);
      processed++;
      if (processed % 100 === 0) process.stdout.write(`.`);
      return details;
    }, CONCURRENCY);
    
    console.log('\nChunk fetch complete. Filtering...');
    
    let chunkAdded = 0;
    for (const details of results) {
      if (isRelevant(details)) {
        // Simplified object structure to save space
        const simple = {
            objectID: details.objectID,
            title: details.title,
            artistDisplayName: details.artistDisplayName,
            primaryImage: details.primaryImage,
            primaryImageSmall: details.primaryImageSmall,
            department: details.department,
            classification: details.classification,
            objectName: details.objectName,
            medium: details.medium,
            objectDate: details.objectDate,
            GalleryNumber: details.GalleryNumber,
            objectURL: details.objectURL
        };
        finalItems.push(simple);
        chunkAdded++;
      }
    }
    console.log(`Added ${chunkAdded} items. Total Valid: ${finalItems.length}`);
  }

  // Output
  const outputPath = path.join(__dirname, '../public/data/met-ny-collection.json');
  fs.writeFileSync(outputPath, JSON.stringify(finalItems, null, 2));
  console.log(`Done! Written ${finalItems.length} items to ${outputPath}`);
}

run().catch(console.error);
