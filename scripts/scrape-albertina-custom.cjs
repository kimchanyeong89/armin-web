
const axios = require('axios');
console.log('Script started');
const fs = require('fs');
const https = require('https');
const path = require('path');

const BASE = 'https://sammlungenonline.albertina.at';
const IIIF_COLLECTION_BASE = `${BASE}/apis/iiif/presentation/v2/collection/groups`;

const DOWNLOADS_DIR = path.join(__dirname, '../public/data'); // Write directly to public/data effectively? Or downloads first? Let's write to downloads first as per pattern.
const REAL_DOWNLOADS_DIR = path.join(__dirname, '../downloads');

const LIMIT = 100;
const CONCURRENCY = 5;
const SLEEP_MS = 100;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function safeJsonParse(str) {
  try { return JSON.parse(str); } catch { return null; }
}

async function fetchJson(url) {
  const requestConfig = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      Accept: 'application/json,text/plain,*/*'
    },
    timeout: 30000,
    validateStatus: (s) => s >= 200 && s < 400
  };

  try {
    const res = await axios.get(url, requestConfig);
    if (typeof res.data === 'string') {
      const parsed = safeJsonParse(res.data);
      if (parsed) return parsed;
      throw new Error(`Non-JSON response from ${url}`);
    }
    return res.data;
  } catch (e) {
    const res = await axios.get(url, {
      ...requestConfig,
      httpsAgent: new https.Agent({ rejectUnauthorized: false })
    });
    if (typeof res.data === 'string') return safeJsonParse(res.data);
    return res.data;
  }
}

function pickIiifImageUrlFromThumbnail(manifest) {
  // Prefer IIIF service
  const thumb = manifest?.thumbnail;
  const entry = Array.isArray(thumb) ? thumb[0] : thumb;
  if (!entry) return '';
  const serviceId = entry?.service?.['@id'] || entry?.service?.id || '';
  if (serviceId) return `${serviceId}/full/full/0/default.jpg`;
  const id = entry?.['@id'] || entry?.id || '';
  return id ? (id.startsWith('http') ? id : `${BASE}${id}`) : '';
}

function metadataToMap(metadataArr) {
  const out = {};
  for (const m of metadataArr || []) {
    const k = String(m?.label || '').trim();
    if (k) out[k] = m?.value;
  }
  return out;
}

async function runPool(items, worker, concurrency) {
  const queue = [...items];
  const results = [];
  async function runOne() {
    while (queue.length) {
      const item = queue.shift();
      if (!item) return;
      results.push(await worker(item));
    }
  }
  const runners = Array.from({ length: concurrency }, () => runOne());
  await Promise.all(runners);
  return results;
}

// Configs for the user request
const CONFIGS = [
  {
    targetId: 'albertina-paintings-100',
    groupSlug: 'paintings---sculpture',
    filter: 'namesOnlineenglisch:Painting',
    name: 'Paintings'
  },
  {
    targetId: 'albertina-sculptures-100',
    groupSlug: 'paintings---sculpture',
    filter: 'namesOnlineenglisch:Sculpture;mediaExistence:true',
    name: 'Sculptures'
  }
];

async function main() {
  for (const cfg of CONFIGS) {
    console.log(`\n🖼️  Scraping ${cfg.name} (${cfg.targetId})...`);
    
    // Construct IIIF Collection URL
    // e.g. .../paintings---sculpture?filter=namesOnlineenglisch%3APainting&page=1
    // Note: The previous script used encoded filters.
    const url = `${IIIF_COLLECTION_BASE}/${encodeURIComponent(cfg.groupSlug)}?filter=${encodeURIComponent(cfg.filter)}&page=1`;
    console.log(`   URL: ${url}`);
    
    let root;
    try {
      root = await fetchJson(url);
    } catch(e) {
      console.error(`   Failed to fetch page 1: ${e.message}`);
      continue;
    }
    
    const manifestUrls = (root.manifests || [])
      .map(m => m['@id'])
      .filter(Boolean)
      .slice(0, LIMIT);
      
    console.log(`   Found ${manifestUrls.length} items (limit ${LIMIT})`);
    
    let done = 0;
    const objects = await runPool(manifestUrls, async (mUrl) => {
      try {
        const manifest = await fetchJson(mUrl);
        const metaMap = metadataToMap(manifest.metadata);
        
        // Extract fields
        const id = String(mUrl).match(/objects-(\d+)\/manifest/)?.[1] || '';
        const title = manifest.label || 'Untitled';
        const imageUrl = pickIiifImageUrlFromThumbnail(manifest);
        
        // Helper to get meta
        const getM = (...keys) => {
           for (const k of keys) {
             const v = metaMap[Object.keys(metaMap).find(x => x.toLowerCase() === k.toLowerCase())];
             if (v) return typeof v === 'string' ? v : String(v); 
           }
           return '';
        };

        const artist = getM('Primary Maker', 'Artist', 'Creator');
        const date = getM('Date');
        const medium = getM('Medium', 'Materials and Technique');
        const dim = getM('Dimensions');
        
        done++;
        if (done % 10 === 0) console.log(`   ${done}/${manifestUrls.length}`);
        
        if (SLEEP_MS) await sleep(SLEEP_MS);
        
        return {
          id: id || `alb-${done}`,
          sourceId: `albertina-${id}`,
          title,
          artist,
          date,
          medium,
          dimensions: dim,
          imageUrl,
          iiifManifest: mUrl,
          metadata: metaMap,
          sourceUrl: `${BASE}/objects/${id}`
        };
      } catch (e) {
        console.warn(`   Error fetching manifest: ${e.message}`);
        return null;
      }
    }, CONCURRENCY);
    
    const validObjects = objects.filter(Boolean);
    const data = {
      museum: "ALBERTINA Museum Vienna",
      museumId: "albertina",
      groupName: cfg.name,
      groupSlug: cfg.groupSlug,
      filter: cfg.filter,
      scrapedAt: new Date().toISOString(),
      totalOnPage: validObjects.length,
      objects: validObjects
    };
    
    // Save to public/data directly as requested by workflow
    const outPath = path.join(__dirname, '../public/data', `${cfg.targetId}.json`);
    fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
    console.log(`   ✅ Saved to ${outPath}`);
    
    // Also copy to downloads for consistency
    const downPath = path.join(REAL_DOWNLOADS_DIR, `${cfg.targetId}.json`);
    fs.writeFileSync(downPath, JSON.stringify(data, null, 2));
  }
}

main().catch(console.error);
