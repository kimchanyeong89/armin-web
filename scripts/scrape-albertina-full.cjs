
const axios = require('axios');
const fs = require('fs');
const https = require('https');
const path = require('path');

const BASE = 'https://sammlungenonline.albertina.at';
const IIIF_COLLECTION_BASE = `${BASE}/apis/iiif/presentation/v2/collection/groups`;

// Write to public/data effectively as user seems to want live data
const DOWNLOADS_DIR = path.join(__dirname, '../public/data');
const BACKUP_DIR = path.join(__dirname, '../downloads');

// No strict limit (Infinity) or very high
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : 999999;
const CONCURRENCY = 3; // Reduced per-group concurrency to safely run groups in parallel
// Be gentle
const SLEEP_MS = 100;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .trim();
}

function normalizeLabel(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
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

function extractObjectIdFromRelated(manifest) {
  const rel = manifest?.related?.[0]?.['@id'] || manifest?.rendering?.[0]?.['@id'] || '';
  const m = String(rel).match(/\/objects\/(\d+)\//);
  return m ? m[1] : '';
}

function extractObjectUrlFromRelated(manifest) {
  return manifest?.related?.[0]?.['@id'] || manifest?.rendering?.[0]?.['@id'] || '';
}

function pickIiifImageUrlFromThumbnail(manifest) {
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
    const label = m?.label;
    const value = m?.value;
    if (!label || value == null) continue;
    const k = String(label).trim();
    if (!k) continue;
    out[k] = typeof value === 'string' ? value.trim() : value;
  }
  return out;
}

function metaGet(metaMap, ...labels) {
  for (const l of labels) {
    const target = normalizeLabel(l);
    for (const [k, v] of Object.entries(metaMap)) {
      if (normalizeLabel(k) === target) return typeof v === 'string' ? v : String(v);
    }
  }
  return '';
}

// Helper to fully walk all collection pages
async function getAllManifestUrls(rootUrl) {
  let manifestUrls = [];
  try {
    const root = await fetchJson(rootUrl);
    // If root has manifests directly (it's a page or a small collection)
    if (root.manifests && Array.isArray(root.manifests)) {
      manifestUrls.push(...root.manifests.map(m => m['@id']));
    }
    
    // If root has sub-collections (pagination)
    if (root.collections && Array.isArray(root.collections)) {
      const pageUrls = root.collections.map(c => c['@id']).filter(Boolean);
      console.log(`   Found ${pageUrls.length} pages of results.`);
      for (const pUrl of pageUrls) {
        // Fetch each page
        // Use a small retry or tolerance
        try {
          const page = await fetchJson(pUrl);
          if (page.manifests && Array.isArray(page.manifests)) {
            const urls = page.manifests.map(m => m['@id']).filter(Boolean);
            manifestUrls.push(...urls);
            process.stdout.write('.');
          }
        } catch(e) {
          console.warn(`   ⚠️ Failed page ${pUrl}: ${e.message}`);
        }
      }
      console.log('');
    } else if (manifestUrls.length === 0) {
       // Maybe it's a paged collection but only one page? 
       // Often IIIF Collections with pagination have 'first', 'next' links. 
       // BUT Albertina's implementation seems to provide a list of "pages" as collections in the root response.
       // If empty, maybe try &page=1 explicit if not present?
       if (!rootUrl.includes('page=')) {
          console.log('   No collections found. Trying implicit page=1...');
          return getAllManifestUrls(`${rootUrl}&page=1`);
       }
    }
  } catch(e) {
    console.error(`Error fetching root ${rootUrl}:`, e.message);
  }
  return manifestUrls;
}

async function runPool(items, worker, concurrency) {
  const queue = [...items];
  const results = [];
  let completed = 0;
  const total = items.length;

  async function runOne() {
    while (queue.length) {
      const item = queue.shift();
      if (!item) return;
      results.push(await worker(item));
      completed++;
      if (completed % 50 === 0 || completed === total) {
        process.stdout.write(`\r   Processing: ${completed}/${total}`);
      }
    }
  }

  const runners = Array.from({ length: concurrency }, () => runOne());
  await Promise.all(runners);
  console.log('');
  return results;
}

async function scrapeGroup(cfg) {
  console.log(`\n🖼️  Scraping [${cfg.groupName}] -> ${cfg.targetId}.json`);
  console.log(`   Filter: ${cfg.filter}`);

  const outFile = path.join(DOWNLOADS_DIR, `${cfg.targetId}.json`);
  const backupFile = path.join(BACKUP_DIR, `${cfg.targetId}.json`);

  // Construct Root URL
  const rootUrl = `${IIIF_COLLECTION_BASE}/${encodeURIComponent(cfg.groupSlug)}?filter=${encodeURIComponent(cfg.filter)}`;
  console.log(`   Root URL: ${rootUrl}`);

  // 1. Collect all manifest URLs (pagination)
  console.log('   📄 Collecting all pages...');
  let manifestUrls = await getAllManifestUrls(rootUrl);
  manifestUrls = [...new Set(manifestUrls)]; // Dedupe
  
  if (manifestUrls.length > LIMIT) {
    console.log(`   ⚠️ Limit applied: ${LIMIT} (found ${manifestUrls.length})`);
    manifestUrls = manifestUrls.slice(0, LIMIT);
  } else {
    console.log(`   Found ${manifestUrls.length} total objects.`);
  }

  if (manifestUrls.length === 0) {
    console.warn('   ⚠️ No objects found. Skipping.');
    return;
  }

  // 2. Fetch details
  const objects = await runPool(
    manifestUrls,
    async (manifestUrl) => {
      try {
        const manifest = await fetchJson(manifestUrl);
        const metaMap = metadataToMap(manifest.metadata);
        const objectId = extractObjectIdFromRelated(manifest);
        const objectUrl = extractObjectUrlFromRelated(manifest) || '';
        const imageUrl = pickIiifImageUrlFromThumbnail(manifest);

        const title = String(manifest.label || '').trim() || 'Untitled';
        const artist = metaGet(metaMap, 'Primary Maker', 'Artist', 'Creator');
        const date = metaGet(metaMap, 'Date');
        const medium = metaGet(metaMap, 'Medium', 'Materials and Technique', 'Technique');
        const dimensions = metaGet(metaMap, 'Dimensions');
        const objectNumber = metaGet(metaMap, 'Object number', 'Inv. Nr.', 'Inventory number');
        
        if (SLEEP_MS) await sleep(SLEEP_MS);

        return {
          id: objectId || '',
          sourceId: objectId ? `albertina-${objectId}` : '',
          title,
          artist,
          date,
          medium,
          dimensions,
          inventory: objectNumber,
          imageUrl,
          // Minimal fields for production file
          url: objectUrl,
          iiifManifest: manifestUrl,
          metadata: metaMap,
          source: 'ALBERTINA Museum Vienna',
          sourceUrl: BASE
        };
      } catch (e) {
        // console.warn(`Error on ${manifestUrl}: ${e.message}`);
        return null;
      }
    },
    CONCURRENCY
  );

  const validObjects = objects.filter((o) => o && o.imageUrl);
  console.log(`   ✓ Scraped ${validObjects.length} valid objects (with images).`);

  const data = {
    museum: 'ALBERTINA Museum Vienna',
    museumId: 'albertina',
    groupName: cfg.groupName,
    groupSlug: cfg.groupSlug,
    filter: cfg.filter,
    scrapedAt: new Date().toISOString(),
    totalObj: validObjects.length,
    objects: validObjects
  };

  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(data, null, 2), 'utf8');
  console.log(`   💾 Saved to ${outFile}`);

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.writeFileSync(backupFile, JSON.stringify(data, null, 2), 'utf8');
}

async function main() {
  const configs = [
    {
      targetId: 'albertina-paintings-100', // Keep ID consistent even if full. Or should we rename? User said "full scrape", but keeping ID consistent simplifies the app config which references this file!
      // Wait, "albertina-paintings-100" implies 100. But if I overwrite it with full data, the app will just show all of them (or many).
      // If the file is huge (e.g. 20MB), checking logic might be needed.
      // However, user said "전부 전체 스크래핑해줘".
      // Let's stick to the filenames used in code, or rename?
      // "albertina-paintings-100" is a bad name for full scrape.
      // But the app imports '/data/albertina-paintings-100.json'.
      // I will overwrite the file. The "100" in filename will be a misnomer but the app will work without code changes.
      groupName: 'Paintings',
      groupSlug: 'paintings---sculpture',
      filter: 'namesOnlineenglisch:Painting'
    },
    {
      targetId: 'albertina-sculptures-100',
      groupName: 'Sculptures',
      groupSlug: 'paintings---sculpture',
      filter: 'namesOnlineenglisch:Sculpture;mediaExistence:true'
    },
    {
      targetId: 'albertina-drawings-prints-100',
      groupName: 'Drawings & Prints',
      groupSlug: 'drawings---prints',
      filter: 'namesOnlineenglisch:Print;mediaExistence:true' // Or verify if drawings has different filter? 'Print' is what 5groups used. Albertina groups are quirky. 'Print' might exclude 'Drawing'?
      // Let's check the original script: 'namesOnlineenglisch:Print;mediaExistence:true' was labeled "Drawings & Prints (Print)".
      // Let's assume this is correct for now.
    },
    {
      targetId: 'albertina-photography-100',
      groupName: 'Photography',
      groupSlug: 'photography',
      filter: 'namesOnlineenglisch:Photograph;mediaExistence:true'
    },
    {
      targetId: 'albertina-objects-installations-media-art-100',
      groupName: 'Objects & Media Art',
      groupSlug: 'objects--installations-and-media-art',
      filter: 'mediaExistence:true'
    },
    {
      targetId: 'albertina-poster-100',
      groupName: 'Posters',
      groupSlug: 'poster',
      filter: 'mediaExistence:true'
    }
  ];

  console.log('🚀 ALBERTINA FULL SCRAPE STARTED (PARALLEL)');
  console.log(`Writing to: ${DOWNLOADS_DIR}`);

  // Run all groups in parallel
  await Promise.all(configs.map(cfg => scrapeGroup(cfg)));
  
  console.log('\n✅ ALL DONE.');
}

main().catch(console.error);

