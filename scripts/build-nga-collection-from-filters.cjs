const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const OUT_JSON = path.join(__dirname, '../public/data/nga-collection.json');
const OUT_JSON_FULL = path.join(__dirname, '../public/data/nga-collection-full.json');
const OUT_CSV = path.join(__dirname, '../public/data/nga-collection.csv');

const TMP_DIR = path.join(__dirname, '../downloads/nga-filter-temp');

const SEARCH_URLS = [
  'https://searchthecollection.nga.gov.au/results?keyword=*&selectedFilters=[{"label":"painting","field":"mediumFilter","value":"painting"}]',
  'https://searchthecollection.nga.gov.au/results?keyword=*&selectedFilters=[{"label":"drawings","field":"objectType","value":"drawings"},{"label":"watercolours","field":"objectType","value":"watercolours"}]',
  'https://searchthecollection.nga.gov.au/results?keyword=*&selectedFilters=[{"label":"drawings","field":"objectType","value":"drawings"},{"label":"pastels","field":"objectType","value":"pastels"}]',
  'https://searchthecollection.nga.gov.au/results?keyword=*&selectedFilters=[{"label":"drawings","field":"objectType","value":"drawings"},{"label":"prints","field":"objectType","value":"prints"}]',
  'https://searchthecollection.nga.gov.au/results?keyword=*&selectedFilters=[{"label":"photographs","field":"objectType","value":"photographs"},{"label":"colour photographs","field":"objectType","value":"colour photographs"}]',
];

const FILTERS = [
  {
    key: 'painting',
    classification: 'Painting',
    mediumRegex: '',
    originalUrl: SEARCH_URLS[0],
  },
  {
    key: 'drawing-watercolour',
    classification: 'Drawing',
    mediumRegex: 'water\s*colou?r',
    originalUrl: SEARCH_URLS[1],
  },
  {
    key: 'drawing-pastel',
    classification: 'Drawing',
    mediumRegex: 'pastel',
    originalUrl: SEARCH_URLS[2],
  },
  {
    key: 'prints',
    classification: 'Print',
    mediumRegex: '',
    originalUrl: SEARCH_URLS[3],
  },
  {
    key: 'photo-colour',
    classification: 'Photograph',
    mediumRegex: 'colou?r',
    originalUrl: SEARCH_URLS[4],
  },
];

function runPass(filter) {
  const outFile = path.join(TMP_DIR, `nga-${filter.key}.json`);
  const env = {
    ...process.env,
    CLASSIFICATION: filter.classification,
    IMAGES_ONLY: '1',
    OPEN_ACCESS_ONLY: '0',
    OUT_FILE: outFile,
    ORIGINAL_URL: filter.originalUrl,
  };

  if (filter.mediumRegex) {
    env.MEDIUM_REGEX = filter.mediumRegex;
  }

  console.log(`[NGA] Pass: ${filter.key}`);
  execSync('python3 scripts/scrape-nga-opendata-awtype-107231.py', { env, stdio: 'inherit' });

  const parsed = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  console.log(`[NGA]   -> ${items.length} items`);
  return { outFile, items };
}

function hasAnyImage(item) {
  if (item?.image) return true;
  if (item?.primaryImage?.iiifFull || item?.primaryImage?.iiifUrl || item?.primaryImage?.iiifThumbUrl) return true;
  return false;
}

function ensureDerivedFields(item) {
  const image = item.image || item?.primaryImage?.iiifFull || item?.primaryImage?.iiifUrl || item?.primaryImage?.iiifThumbUrl || '';
  const onView = Boolean(item?.location?.onView);

  return {
    ...item,
    image,
    onView,
    onDisplay: onView,
    museum: 'National Gallery of Art',
    museumId: 'nga',
  };
}

function toSlimItem(item) {
  return {
    id: item.id,
    objectID: item.objectID,
    museum: item.museum,
    museumId: item.museumId,
    title: item.title || '',
    name: item.title || '',
    attribution: item.attribution || '',
    artist: item.attribution || item.artist || '',
    displayDate: item.displayDate || '',
    medium: item.medium || '',
    dimensions: item.dimensions || '',
    classification: item.classification || '',
    subClassification: item.subClassification || '',
    category: item.classification || '',
    creditLine: item.creditLine || '',
    accessionNum: item.accessionNum || '',
    onView: item.onView === true,
    onDisplay: item.onDisplay === true,
    image: item.image || '',
    sourceUrl: item?.urls?.artworkPage || item?.urls?.legacyCollectionPage || '',
    openAccessLikely: item.openAccessLikely === true,
    matchedFilters: Array.isArray(item.matchedFilters) ? item.matchedFilters : [],
    metadata: {
      termsCount: Array.isArray(item.terms) ? item.terms.length : 0,
      textEntriesCount: Array.isArray(item.textEntries) ? item.textEntries.length : 0,
      historicalDataCount: Array.isArray(item.historicalData) ? item.historicalData.length : 0,
      artistsCount: Array.isArray(item.artists) ? item.artists.length : 0,
    },
  };
}

function toCsvValue(v) {
  const s = v == null ? '' : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

function writeCsv(items, outputPath) {
  const headers = [
    'id',
    'objectID',
    'museum',
    'museumId',
    'title',
    'attribution',
    'displayDate',
    'classification',
    'subClassification',
    'medium',
    'dimensions',
    'creditLine',
    'accessionNum',
    'onView',
    'onDisplay',
    'image',
    'iiifFull',
    'artworkPage',
    'openAccessLikely',
    'locationKey',
    'preferredLocationName',
    'termsCount',
    'textEntriesCount',
    'historicalDataCount',
    'artistsCount',
    'rawJson',
  ];

  const lines = [headers.map(toCsvValue).join(',')];

  for (const item of items) {
    const row = [
      item.id,
      item.objectID,
      item.museum,
      item.museumId,
      item.title,
      item.attribution,
      item.displayDate,
      item.classification,
      item.subClassification,
      item.medium,
      item.dimensions,
      item.creditLine,
      item.accessionNum,
      item.onView,
      item.onDisplay,
      item.image,
      item?.primaryImage?.iiifFull || '',
      item?.urls?.artworkPage || '',
      item.openAccessLikely,
      item?.location?.preferredLocation?.locationKey || '',
      item?.location?.preferredLocation?.displayname || item?.location?.preferredLocation?.displayName || '',
      Array.isArray(item.terms) ? item.terms.length : 0,
      Array.isArray(item.textEntries) ? item.textEntries.length : 0,
      Array.isArray(item.historicalData) ? item.historicalData.length : 0,
      Array.isArray(item.artists) ? item.artists.length : 0,
      JSON.stringify(item),
    ];
    lines.push(row.map(toCsvValue).join(','));
  }

  fs.writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
}

function main() {
  fs.mkdirSync(TMP_DIR, { recursive: true });

  const byObjectId = new Map();
  const sourceMap = new Map();

  for (const filter of FILTERS) {
    const { items } = runPass(filter);

    for (const raw of items) {
      const item = ensureDerivedFields(raw);
      if (!hasAnyImage(item)) continue;

      const key = String(item.objectID || item.id || '');
      if (!key) continue;

      if (!byObjectId.has(key)) {
        byObjectId.set(key, item);
        sourceMap.set(key, [filter.key]);
      } else {
        const arr = sourceMap.get(key) || [];
        if (!arr.includes(filter.key)) arr.push(filter.key);
        sourceMap.set(key, arr);
      }
    }
  }

  const mergedItems = Array.from(byObjectId.values())
    .map((item) => {
      const key = String(item.objectID || item.id || '');
      return {
        ...item,
        matchedFilters: sourceMap.get(key) || [],
      };
    })
    .sort((a, b) => (a.objectID || 0) - (b.objectID || 0));

  const fullOutput = {
    generated: new Date().toISOString(),
    total: mergedItems.length,
    originalUrl: SEARCH_URLS.join(' | '),
    filterStrategy: {
      note: 'searchthecollection.nga.gov.au is blocked from this environment (HTTP 403), so NGA Open Data equivalence filters were used.',
      filters: FILTERS.map((f) => ({
        key: f.key,
        classification: f.classification,
        mediumRegex: f.mediumRegex || null,
        originalUrl: f.originalUrl,
      })),
      imageRequired: true,
      dedupeBy: 'objectID',
    },
    items: mergedItems,
  };

  const slimItems = mergedItems.map(toSlimItem);
  const slimOutput = {
    generated: fullOutput.generated,
    total: slimItems.length,
    originalUrl: fullOutput.originalUrl,
    filterStrategy: fullOutput.filterStrategy,
    items: slimItems,
  };

  fs.writeFileSync(OUT_JSON_FULL, JSON.stringify(fullOutput, null, 2), 'utf8');
  fs.writeFileSync(OUT_JSON, JSON.stringify(slimOutput, null, 2), 'utf8');
  writeCsv(mergedItems, OUT_CSV);

  const onDisplayCount = mergedItems.filter((x) => x.onDisplay === true).length;
  const withImageCount = mergedItems.filter((x) => !!x.image).length;

  console.log('\n[NGA] Build complete');
  console.log(`[NGA] Items: ${mergedItems.length}`);
  console.log(`[NGA] With image: ${withImageCount}`);
  console.log(`[NGA] On display: ${onDisplayCount}`);
  console.log(`[NGA] JSON (slim): ${OUT_JSON}`);
  console.log(`[NGA] JSON (full): ${OUT_JSON_FULL}`);
  console.log(`[NGA] CSV : ${OUT_CSV}`);
}

try {
  main();
} catch (err) {
  console.error('[NGA] Build failed:', err);
  process.exit(1);
}
