const fs = require('fs');
const path = require('path');
const https = require('https');
const cheerio = require('cheerio');

const OUTPUT_JSON = path.join(__dirname, '../public/data/qagoma-collection.json');
const OUTPUT_CSV = path.join(__dirname, '../public/data/qagoma-collection.csv');

const APP_ID = 'C6JQEY7F0L';
const API_KEY = '18dbf1d949f691ed00f407e6bdfeaeb1';
const INDEX_NAME = 'QAGOMA_Collection_Online';
const BASE_URL = 'https://collection.qagoma.qld.gov.au';

const CATEGORIES = ['Assemblage', 'Painting', 'Print', 'Drawing'];
const HAS_IMAGE_FILTER = 'qagoma_module_work_has_image:true';

const HITS_PER_PAGE = Number(process.env.HITS_PER_PAGE || 250);
const DETAIL_CONCURRENCY = Number(process.env.DETAIL_CONCURRENCY || 8);
const API_CONCURRENCY = Number(process.env.API_CONCURRENCY || 24);
const CHECKPOINT_EVERY = Number(process.env.CHECKPOINT_EVERY || 100);
const FETCH_DETAIL = process.env.DETAIL !== '0';
const LIMIT = Number(process.env.LIMIT || 0);
const MAX_OBJECT_IDS = Number(process.env.MAX_OBJECT_IDS || 0);
const ALGOLIA_PAGE_CAP = 1000;
const DISCOVERY_MODE = (process.env.DISCOVERY_MODE || 'sitemap').toLowerCase();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function toAbsoluteUrl(value) {
  const v = cleanText(value);
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  if (v.startsWith('/')) return `${BASE_URL}${v}`;
  return `${BASE_URL}/${v.replace(/^\/+/, '')}`;
}

function parseObjectIdFromUrl(url) {
  const m = String(url || '').match(/\/objects\/(\d+)/i);
  return m ? m[1] : '';
}

function httpPostJson(hostname, route, body, headers = {}) {
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname,
        path: route,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload),
          ...headers,
        },
      },
      (res) => {
        let text = '';
        res.on('data', (chunk) => (text += chunk));
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 500)}`));
          }
          try {
            resolve(JSON.parse(text));
          } catch (e) {
            reject(new Error(`JSON parse failed: ${e.message}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function httpGetText(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let text = '';
      res.on('data', (chunk) => (text += chunk));
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`GET ${url} failed: ${res.statusCode}`));
        }
        resolve(text);
      });
    });
    req.on('error', reject);
  });
}

function normalizeFromAlgolia(hit) {
  const sourceUrl = toAbsoluteUrl(hit.url);
  const objectNumericId = parseObjectIdFromUrl(sourceUrl);

  return {
    id: objectNumericId ? `qagoma-${objectNumericId}` : `qagoma-${hit.objectID}`,
    objectId: hit.objectID || '',
    objectNumericId,
    museum: 'Queensland Art Gallery | Gallery of Modern Art',
    museumId: 'qagoma',
    title: cleanText(hit.title),
    artist: cleanText(hit.creators),
    year: cleanText(hit.field_date_created),
    accessionNo: cleanText(hit.field_accession_no_),
    department: cleanText(hit.name),
    category: cleanText(hit.name_1),
    secondaryCategory: cleanText(hit.name_3),
    medium: cleanText(hit.medium_statement || hit._api_row?.medium_statement),
    dimensions: '',
    creditLine: cleanText(hit.field_credit_line_long),
    placeCreated: cleanText(hit.place_created || hit._api_row?.place_created),
    galleryLocation: '',
    onDisplay: Boolean(hit.qagoma_module_work_on_display),
    hasImage: Boolean(hit.qagoma_module_work_has_image),
    image: toAbsoluteUrl(hit.image_reference),
    sourceUrl,
    apiUrl: objectNumericId ? `${BASE_URL}/api/objects/${objectNumericId}` : '',
    detailMetadata: {},
    rawApi: hit._api_row || null,
    rawAlgolia: hit,
  };
}

function normalizeApiRowToPseudoHit(row, objectNumericId) {
  return {
    objectID: `api-object-${objectNumericId}`,
    url: row?.url || `/objects/${objectNumericId}`,
    title: row?.object_title || '',
    creators: row?.creator_list || '',
    field_date_created: row?.date_created || '',
    field_accession_no_: row?.accession_no || '',
    field_credit_line_long: row?.credit_line || '',
    name: row?.department || '',
    name_1: row?.primary_medium || '',
    name_3: row?.secondary_medium || '',
    image_reference: row?.image_url || '',
    qagoma_module_work_has_image: Boolean(row?.image_url),
    qagoma_module_work_on_display: false,
    _api_row: row || null,
  };
}

async function fetchSitemapObjectIds() {
  const rootXml = await httpGetText(`${BASE_URL}/sitemap.xml`);
  const subMapUrls = Array.from(
    new Set(
      [...rootXml.matchAll(/<loc>(https:\/\/collection\.qagoma\.qld\.gov\.au\/sitemap\.xml\?page=\d+)<\/loc>/g)].map(
        (m) => m[1]
      )
    )
  );

  const ids = new Set();
  let done = 0;
  for (const mapUrl of subMapUrls) {
    const xml = await httpGetText(mapUrl);
    for (const m of xml.matchAll(/https:\/\/collection\.qagoma\.qld\.gov\.au\/objects\/(\d+)/g)) {
      ids.add(m[1]);
    }
    done += 1;
    process.stdout.write(`\r[Sitemap] ${done}/${subMapUrls.length} maps | Object IDs ${ids.size}`);
    await sleep(30);
  }
  console.log('');

  return Array.from(ids);
}

async function fetchApiObjectRow(objectNumericId) {
  const apiUrl = `${BASE_URL}/api/objects/${objectNumericId}`;
  try {
    const text = await httpGetText(apiUrl);
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed[0];
  } catch {
    return null;
  }
  return null;
}

function parseDetailHtml(html) {
  const $ = cheerio.load(html);
  const detailMetadata = {};

  $('dl.row dt').each((_, dt) => {
    const label = cleanText($(dt).text()).replace(/\s+/g, ' ');
    const dd = $(dt).next('dd');
    const value = cleanText(dd.text());
    if (label && value) {
      detailMetadata[label] = value;
    }
  });

  const narrative = cleanText($('.view-creating-narrative .view-content').text());
  if (narrative) detailMetadata.Narrative = narrative;

  const citation = cleanText($('#clipboardjs').val());
  if (citation) detailMetadata.Citation = citation;

  const originalImage = toAbsoluteUrl($('a[data-lightbox="feature-image"]').attr('href') || '');
  if (originalImage) detailMetadata.OriginalImage = originalImage;

  return detailMetadata;
}

function mergeDetail(item, apiRow, detailMetadata) {
  const m = detailMetadata || {};
  const locationText = cleanText(m['Gallery location'] || '');
  const onDisplay = locationText
    ? !/not\s+on\s+public\s+display/i.test(locationText)
    : Boolean(item.onDisplay);

  return {
    ...item,
    artist: cleanText(item.artist || apiRow?.creator_list),
    year: cleanText(item.year || apiRow?.date_created),
    accessionNo: cleanText(item.accessionNo || apiRow?.accession_no || m['Accession No.']),
    department: cleanText(item.department || apiRow?.department || m.Department),
    category: cleanText(item.category || apiRow?.primary_medium || m['Media Category']),
    secondaryCategory: cleanText(item.secondaryCategory || apiRow?.secondary_medium || m['Secondary Media Category']),
    medium: cleanText(apiRow?.medium_statement || m.Medium),
    dimensions: cleanText(m['Dimensions A'] || m['Dimensions B'] || m.Dimensions),
    creditLine: cleanText(item.creditLine || apiRow?.credit_line || m['Credit Line']),
    placeCreated: cleanText(apiRow?.place_created || m['Place created']),
    galleryLocation: locationText,
    onDisplay,
    image: toAbsoluteUrl(item.image || apiRow?.image_url || m.OriginalImage),
    detailMetadata: m,
    rawApi: apiRow || null,
  };
}

function toCsvValue(value) {
  const str = value == null ? '' : String(value);
  return '"' + str.replace(/"/g, '""') + '"';
}

function writeCsv(items, outputPath) {
  const headers = [
    'id', 'objectId', 'objectNumericId', 'museum', 'museumId', 'title', 'artist', 'year', 'accessionNo',
    'department', 'category', 'secondaryCategory', 'medium', 'dimensions', 'creditLine', 'placeCreated',
    'galleryLocation', 'onDisplay', 'hasImage', 'image', 'sourceUrl', 'apiUrl', 'detailMetadataJson',
    'rawApiJson', 'rawAlgoliaJson'
  ];

  const lines = [headers.map(toCsvValue).join(',')];
  for (const it of items) {
    const row = [
      it.id,
      it.objectId,
      it.objectNumericId,
      it.museum,
      it.museumId,
      it.title,
      it.artist,
      it.year,
      it.accessionNo,
      it.department,
      it.category,
      it.secondaryCategory,
      it.medium,
      it.dimensions,
      it.creditLine,
      it.placeCreated,
      it.galleryLocation,
      it.onDisplay,
      it.hasImage,
      it.image,
      it.sourceUrl,
      it.apiUrl,
      JSON.stringify(it.detailMetadata || {}),
      JSON.stringify(it.rawApi || null),
      JSON.stringify(it.rawAlgolia || null),
    ];
    lines.push(row.map(toCsvValue).join(','));
  }

  fs.writeFileSync(outputPath, lines.join('\n'));
}

function loadExistingMap() {
  if (!fs.existsSync(OUTPUT_JSON)) return new Map();
  try {
    const parsed = JSON.parse(fs.readFileSync(OUTPUT_JSON, 'utf8'));
    const arr = Array.isArray(parsed) ? parsed : parsed.items;
    if (!Array.isArray(arr)) return new Map();
    return new Map(arr.map((it) => [String(it.objectId || ''), it]));
  } catch {
    return new Map();
  }
}

async function fetchAlgoliaAll() {
  const hostname = `${APP_ID.toLowerCase()}-dsn.algolia.net`;

  async function fetchAlgoliaHitsSharded() {
    const allHits = [];
    const seenObjectIds = new Set();

    async function querySearch(params) {
      const payload = {
        requests: [{ indexName: INDEX_NAME, params }],
      };
      const json = await httpPostJson(hostname, '/1/indexes/*/queries', payload, {
        'x-algolia-api-key': API_KEY,
        'x-algolia-application-id': APP_ID,
      });
      return json.results?.[0] || {};
    }

    async function queryNbHits(filters) {
      const params = [
        'query=',
        'hitsPerPage=0',
        'page=0',
        `facetFilters=${encodeURIComponent(JSON.stringify(filters))}`,
      ].join('&');

      const res = await querySearch(params);
      return Number(res.nbHits || 0);
    }

    async function queryFacetCounts(filters, facetName) {
      const params = [
        'query=',
        'hitsPerPage=0',
        'page=0',
        'maxValuesPerFacet=1000',
        `facetFilters=${encodeURIComponent(JSON.stringify(filters))}`,
        `facets=${encodeURIComponent(JSON.stringify([facetName]))}`,
      ].join('&');

      const res = await querySearch(params);
      return (res.facets && res.facets[facetName]) || {};
    }

    function escapeFacetValue(value) {
      return String(value || '').replace(/\\/g, '\\\\').replace(/:/g, '\\:');
    }

    async function splitShard(filters, depth = 0) {
      const nbHits = await queryNbHits(filters);
      if (nbHits === 0) return [];

      if (nbHits <= ALGOLIA_PAGE_CAP || depth >= 3) {
        return [{ filters, nbHits }];
      }

      for (const facetName of ['name', 'name_3']) {
        const counts = await queryFacetCounts(filters, facetName);
        const entries = Object.entries(counts)
          .filter(([, count]) => Number(count) > 0)
          .sort((a, b) => Number(b[1]) - Number(a[1]));

        if (entries.length <= 1) continue;

        const largest = Number(entries[0][1] || 0);
        if (largest >= nbHits) continue;

        let out = [];
        for (const [value] of entries) {
          const nextFilters = [...filters, `${facetName}:${escapeFacetValue(value)}`];
          const partial = await splitShard(nextFilters, depth + 1);
          out = out.concat(partial);
        }

        if (out.length > 0) {
          return out;
        }
      }

      return [{ filters, nbHits }];
    }

    async function fetchShardHits(shard) {
      let page = 0;
      let nbPages = 1;

      while (page < nbPages) {
        const params = [
          'query=',
          `hitsPerPage=${HITS_PER_PAGE}`,
          `page=${page}`,
          `facetFilters=${encodeURIComponent(JSON.stringify(shard.filters))}`,
        ].join('&');

        const res = await querySearch(params);
        const hits = Array.isArray(res.hits) ? res.hits : [];
        nbPages = Number(res.nbPages || 0);

        for (const hit of hits) {
          const oid = String(hit.objectID || '');
          if (!oid || seenObjectIds.has(oid)) continue;
          seenObjectIds.add(oid);
          allHits.push(hit);

          if (LIMIT > 0 && allHits.length >= LIMIT) {
            return;
          }
        }

        process.stdout.write(`\r[List] Shard page ${page + 1}/${nbPages} | Unique hits ${allHits.length}`);
        page += 1;

        if (LIMIT > 0 && allHits.length >= LIMIT) {
          return;
        }

        await sleep(30);
      }
    }

    for (const category of CATEGORIES) {
      const baseFilters = [`name_1:${category}`, HAS_IMAGE_FILTER];
      const shards = await splitShard(baseFilters, 0);
      console.log(`\n[List] Category ${category} -> shards ${shards.length}`);

      for (const shard of shards) {
        await fetchShardHits(shard);
        if (LIMIT > 0 && allHits.length >= LIMIT) break;
      }

      if (LIMIT > 0 && allHits.length >= LIMIT) break;
      await sleep(80);
    }

    console.log('');
    return LIMIT > 0 ? allHits.slice(0, LIMIT) : allHits;
  }

  if (DISCOVERY_MODE === 'sitemap') {
    console.log('[List] Discovery mode: sitemap');
    let objectIds = await fetchSitemapObjectIds();
    if (MAX_OBJECT_IDS > 0) {
      objectIds = objectIds.slice(0, MAX_OBJECT_IDS);
    }
    const filteredHits = [];
    const allow = new Set(CATEGORIES);

    let processed = 0;
    let accepted = 0;

    await runWithConcurrency(objectIds, API_CONCURRENCY, async (id) => {
      const row = await fetchApiObjectRow(id);
      processed += 1;

      if (row) {
        const category = cleanText(row.primary_medium);
        const hasImage = Boolean(cleanText(row.image_url));
        if (allow.has(category) && hasImage) {
          filteredHits.push(normalizeApiRowToPseudoHit(row, id));
          accepted += 1;
        }
      }

      if (processed % 200 === 0 || processed === objectIds.length) {
        process.stdout.write(`\r[List/API] ${processed}/${objectIds.length} scanned | accepted ${accepted}`);
      }
    });
    console.log('');

    const algoliaHits = await fetchAlgoliaHitsSharded();
    const onDisplayMap = new Map();
    for (const h of algoliaHits) {
      const numericId = parseObjectIdFromUrl(toAbsoluteUrl(h.url));
      if (!numericId) continue;
      onDisplayMap.set(numericId, Boolean(h.qagoma_module_work_on_display));
    }

    let mapped = 0;
    for (const hit of filteredHits) {
      const numericId = parseObjectIdFromUrl(toAbsoluteUrl(hit.url));
      if (!numericId) continue;
      if (onDisplayMap.has(numericId)) {
        hit.qagoma_module_work_on_display = onDisplayMap.get(numericId);
        mapped += 1;
      }
    }
    console.log(`[List] onDisplay merged from Algolia: ${mapped}/${filteredHits.length}`);

    return LIMIT > 0 ? filteredHits.slice(0, LIMIT) : filteredHits;
  }

  console.log('[List] Discovery mode: algolia');
  return fetchAlgoliaHitsSharded();
}

async function runWithConcurrency(items, concurrency, worker) {
  let index = 0;
  const results = new Array(items.length);

  async function runner() {
    while (index < items.length) {
      const current = index++;
      results[current] = await worker(items[current], current);
    }
  }

  const workers = Array.from({ length: Math.max(1, concurrency) }, () => runner());
  await Promise.all(workers);
  return results;
}

async function enrichOne(item) {
  if (!item.objectNumericId) return item;

  const apiUrl = `${BASE_URL}/api/objects/${item.objectNumericId}`;
  let apiRow = null;
  let detailMetadata = {};

  try {
    const apiText = await httpGetText(apiUrl);
    const apiParsed = JSON.parse(apiText);
    if (Array.isArray(apiParsed) && apiParsed.length > 0) apiRow = apiParsed[0];
  } catch {
    apiRow = null;
  }

  try {
    const html = await httpGetText(item.sourceUrl);
    detailMetadata = parseDetailHtml(html);
  } catch {
    detailMetadata = {};
  }

  return mergeDetail(item, apiRow, detailMetadata);
}

function saveCheckpoint(items) {
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(items, null, 2));
  writeCsv(items, OUTPUT_CSV);
}

async function main() {
  console.log('QAGOMA scraper start');
  console.log(`- Categories: ${CATEGORIES.join(', ')}`);
  console.log(`- Has image: true`);
  console.log(`- Detail enrichment: ${FETCH_DETAIL ? 'ON' : 'OFF'}`);

  const existingMap = loadExistingMap();
  if (existingMap.size > 0) {
    console.log(`- Resume loaded: ${existingMap.size} items`);
  }

  const hits = await fetchAlgoliaAll();
  console.log(`- Algolia hits: ${hits.length}`);

  let items = hits.map((h) => normalizeFromAlgolia(h));

  items = items.map((it) => {
    const old = existingMap.get(String(it.objectId));
    if (!old) return it;
    return {
      ...it,
      detailMetadata: old.detailMetadata || {},
      rawApi: old.rawApi || null,
      medium: old.medium || it.medium,
      dimensions: old.dimensions || it.dimensions,
      galleryLocation: old.galleryLocation || it.galleryLocation,
      placeCreated: old.placeCreated || it.placeCreated,
      onDisplay: typeof old.onDisplay === 'boolean' ? old.onDisplay : it.onDisplay,
    };
  });

  if (FETCH_DETAIL) {
    const toEnrich = items.filter((it) => !it.detailMetadata || Object.keys(it.detailMetadata).length === 0);
    console.log(`- Detail to enrich: ${toEnrich.length}`);

    let done = 0;
    const enriched = await runWithConcurrency(toEnrich, DETAIL_CONCURRENCY, async (it) => {
      const result = await enrichOne(it);
      done += 1;
      if (done % 20 === 0 || done === toEnrich.length) {
        process.stdout.write(`\r[Detail] ${done}/${toEnrich.length}`);
      }
      return result;
    });
    console.log('');

    const enrichedMap = new Map(enriched.map((it) => [String(it.objectId), it]));
    items = items.map((it) => {
      const merged = enrichedMap.get(String(it.objectId)) || it;
      return merged;
    });
  }

  items.sort((a, b) => Number(a.objectNumericId || 0) - Number(b.objectNumericId || 0));

  saveCheckpoint(items);

  const onDisplayCount = items.filter((it) => it.onDisplay).length;
  const categoryStats = {};
  for (const it of items) {
    const key = it.category || 'Unknown';
    categoryStats[key] = (categoryStats[key] || 0) + 1;
  }

  console.log('Done');
  console.log(`- JSON: ${OUTPUT_JSON}`);
  console.log(`- CSV: ${OUTPUT_CSV}`);
  console.log(`- Total: ${items.length}`);
  console.log(`- On display: ${onDisplayCount}`);
  console.log(`- Categories: ${JSON.stringify(categoryStats)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
