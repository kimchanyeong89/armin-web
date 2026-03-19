const axios = require('axios');
const fs = require('fs');
const https = require('https');
const path = require('path');

const BASE = 'https://sammlungenonline.albertina.at';
const IIIF_COLLECTION_BASE = `${BASE}/apis/iiif/presentation/v2/collection/groups`;

const DOWNLOADS_DIR = path.join(__dirname, '../downloads');

const LIMIT = process.env.LIMIT ? Math.max(1, Number(process.env.LIMIT)) : 100;
const CONCURRENCY = process.env.CONCURRENCY ? Math.max(1, Number(process.env.CONCURRENCY)) : 5;
const SLEEP_MS = process.env.SLEEP_MS ? Number(process.env.SLEEP_MS) : 150;

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
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
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
    // In this environment, Node TLS sometimes fails to validate the leaf certificate
    // even though curl succeeds. Retry with an insecure agent.
    const code = e?.code || e?.cause?.code;
    const msg = String(e?.message || '');
    const isTlsError =
      code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
      code === 'CERT_HAS_EXPIRED' ||
      msg.includes('unable to verify the first certificate');

    if (!isTlsError) throw e;

    if (!fetchJson._warnedTls) {
      fetchJson._warnedTls = true;
      console.warn('⚠️  TLS verification failed in Node; retrying with insecure HTTPS agent.');
    }

    const res = await axios.get(url, {
      ...requestConfig,
      httpsAgent: new https.Agent({ rejectUnauthorized: false })
    });

    if (typeof res.data === 'string') {
      const parsed = safeJsonParse(res.data);
      if (parsed) return parsed;
      throw new Error(`Non-JSON response from ${url}`);
    }
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

  // Prefer the IIIF Image API service if present.
  const serviceId = entry?.service?.['@id'] || entry?.service?.id || '';
  if (serviceId) {
    // IIIF v2 image API
    return `${serviceId}/full/full/0/default.jpg`;
  }

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

async function collectManifestIdsFromCollectionPage(collectionPageUrl) {
  const page = await fetchJson(collectionPageUrl);
  const manifests = page.manifests || [];
  return manifests
    .map((m) => m?.['@id'] || '')
    .filter(Boolean);
}

async function collectHighlightIdSet({ groupSlug, filter }) {
  // The site uses semicolon-separated filters, e.g. namesOnlineenglisch:Print;mediaExistence:true
  const baseFilter = String(filter || '').trim();
  const withHighlight = baseFilter.toLowerCase().includes('ishighlight:true')
    ? baseFilter
    : `isHighlight:true;${baseFilter}`;

  const rootUrl = `${IIIF_COLLECTION_BASE}/${encodeURIComponent(groupSlug)}?filter=${encodeURIComponent(withHighlight)}`;
  const root = await fetchJson(rootUrl);
  const pages = (root.collections || []).map((c) => c?.['@id']).filter(Boolean);

  // If there are no sub-collections, it may already be a page response.
  const pageUrls = pages.length ? pages : [`${rootUrl}&page=1`];

  const highlightObjectIds = new Set();

  for (const pageUrl of pageUrls) {
    const manifestUrls = await collectManifestIdsFromCollectionPage(pageUrl);
    for (const manifestUrl of manifestUrls) {
      // Fast path: manifest URLs include the numeric object id:
      // https://.../apis/iiif/presentation/v2/1-objects-429098/manifest
      const m = String(manifestUrl).match(/objects-(\d+)\/manifest/);
      if (m) {
        highlightObjectIds.add(String(m[1]));
        continue;
      }

      // Fallback: fetch manifest and derive from related URL.
      const manifest = await fetchJson(manifestUrl);
      const objectId = extractObjectIdFromRelated(manifest);
      if (objectId) highlightObjectIds.add(String(objectId));
    }
  }

  return highlightObjectIds;
}

async function runPool(items, worker, concurrency) {
  const queue = [...items];
  const results = [];

  async function runOne() {
    while (queue.length) {
      const item = queue.shift();
      if (!item) return;
      const r = await worker(item);
      results.push(r);
    }
  }

  const runners = Array.from({ length: concurrency }, () => runOne());
  await Promise.all(runners);
  return results;
}

async function scrapeGroup({ groupSlug, groupName, filter }) {
  console.log(`\n🖼️  Albertina group: ${groupName} (${groupSlug})`);
  console.log(`   filter: ${filter}`);

  const outFile = path.join(DOWNLOADS_DIR, `albertina-${slugify(groupSlug)}-${LIMIT}.json`);

  // 1) Build highlight set (so we can mark isHighlight).
  console.log('   ⭐ collecting highlight IDs...');
  let highlightIds = new Set();
  try {
    highlightIds = await collectHighlightIdSet({ groupSlug, filter });
    console.log(`   ⭐ highlight IDs: ${highlightIds.size}`);
  } catch (e) {
    console.warn('   ⚠️ highlight collection failed:', e.message);
  }

  // 2) Get the first page manifests (100 per IIIF page).
  const page1Url = `${IIIF_COLLECTION_BASE}/${encodeURIComponent(groupSlug)}?filter=${encodeURIComponent(filter)}&page=1`;
  const page1 = await fetchJson(page1Url);
  const manifestUrls = (page1.manifests || []).map((m) => m?.['@id']).filter(Boolean).slice(0, LIMIT);

  console.log(`   📄 manifests on page 1: ${page1.manifests?.length || 0} (taking ${manifestUrls.length})`);

  let done = 0;
  const objects = await runPool(
    manifestUrls,
    async (manifestUrl) => {
      const manifest = await fetchJson(manifestUrl);
      const metaMap = metadataToMap(manifest.metadata);
      const objectId = extractObjectIdFromRelated(manifest);
      const objectUrl = extractObjectUrlFromRelated(manifest) || '';
      const imageUrl = pickIiifImageUrlFromThumbnail(manifest);

      const title = String(manifest.label || '').trim() || 'Untitled';
      const creator = metaGet(metaMap, 'Primary Maker', 'Artist', 'Creator');
      const date = metaGet(metaMap, 'Date');
      const medium = metaGet(metaMap, 'Medium', 'Materials and Technique', 'Technique');
      const dimensions = metaGet(metaMap, 'Dimensions');
      const objectNumber = metaGet(metaMap, 'Object number', 'Inv. Nr.', 'Inventory number');
      const copyright = metaGet(metaMap, 'Copyright');

      done++;
      if (done % 10 === 0 || done === manifestUrls.length) {
        console.log(`   ✓ ${done}/${manifestUrls.length}`);
      }

      if (SLEEP_MS) await sleep(SLEEP_MS);

      return {
        id: objectId || '',
        sourceId: objectId ? `albertina-${objectId}` : '',
        title,
        creator,
        artist: creator,
        date,
        medium,
        dimensions,
        inventory: objectNumber,
        objectNumber,
        imageUrl,
        description: typeof manifest.description === 'string' ? manifest.description.trim() : manifest.description || '',
        url: objectUrl,
        iiifManifest: manifestUrl,
        isHighlight: objectId ? highlightIds.has(String(objectId)) : false,
        metadata: metaMap,
        source: 'ALBERTINA Museum Vienna',
        sourceUrl: BASE
      };
    },
    CONCURRENCY
  );

  const finalObjects = objects.filter((o) => o && o.imageUrl);

  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
  fs.writeFileSync(
    outFile,
    JSON.stringify(
      {
        museum: 'ALBERTINA Museum Vienna',
        museumId: 'albertina',
        groupName,
        groupSlug,
        filter,
        limit: LIMIT,
        scrapedAt: new Date().toISOString(),
        totalOnPage: page1.manifests?.length || 0,
        objects: finalObjects
      },
      null,
      2
    ),
    'utf8'
  );

  console.log(`   📁 wrote ${outFile} (${finalObjects.length} objects)`);
  return outFile;
}

async function main() {
  const groups = [
    {
      groupName: 'Paintings & Sculpture',
      groupSlug: 'paintings---sculpture',
      filter: 'mediaExistence:true'
    },
    {
      groupName: 'Drawings & Prints (Print)',
      groupSlug: 'drawings---prints',
      filter: 'namesOnlineenglisch:Print;mediaExistence:true'
    },
    {
      groupName: 'Photography (Photograph)',
      groupSlug: 'photography',
      filter: 'namesOnlineenglisch:Photograph;mediaExistence:true'
    },
    {
      groupName: 'Objects / Installations / Media Art',
      groupSlug: 'objects--installations-and-media-art',
      filter: 'mediaExistence:true'
    },
    {
      groupName: 'Poster',
      groupSlug: 'poster',
      filter: 'mediaExistence:true'
    }
  ];

  console.log('🏛️  ALBERTINA — 5 groups test scrape (IIIF)');
  console.log('Limit:', LIMIT);
  console.log('Concurrency:', CONCURRENCY);
  console.log('Sleep (ms):', SLEEP_MS);

  const written = [];
  for (const g of groups) {
    written.push(await scrapeGroup(g));
  }

  console.log('\n✅ Done. Files:');
  for (const f of written) console.log('-', f);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
