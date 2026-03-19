const https = require('https');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../public/data/tepapa-collection.json');
const RESUME = process.env.RESUME === '1';
const LIMIT = Number(process.env.LIMIT || 0);
const PAGE_SIZE = Number(process.env.PAGE_SIZE || 100);

const CATEGORIES = [
  { id: '306281', name: 'Paintings' },
  { id: '306240', name: 'Drawings' },
  { id: '310924', name: 'Photographs' },
  { id: '313760', name: 'Black-and-white photographs' },
  { id: '313761', name: 'Colour photographs' },
  { id: '328467', name: 'Works of art' },
  { id: '322736', name: 'Sculpture' },
  { id: '310926', name: 'Prints' },
  { id: '311347', name: 'Black-and-white prints' },
  { id: '311348', name: 'Colour prints' },
  { id: '311445', name: 'Gelatin silver prints' },
  { id: '303854', name: 'Posters' },
  { id: '306621', name: 'Carvings' },
  { id: '321353', name: 'Ceramics' },
  { id: '328638', name: 'Studio ceramics' },
  { id: '321373', name: 'Textiles' }
];

const ASSOCIATIONS = [
  'isTypeOf',
  'isMadeOf',
  'depicts',
  'productionUsedTechnique',
  'refersTo',
  'isAbout',
  'influencedBy',
  'intendedFor',
  'unknownAssociation',
  'associatedWith'
].join(',');

const TYPES = 'Object,Specimen';

function loadExistingItems() {
  if (RESUME && fs.existsSync(OUTPUT_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
      console.log(`[Info] Resuming with ${data.length} existing items.`);
      return data;
    } catch (e) {
      console.log('[Warning] Could not parse existing collection. Starting fresh.');
    }
  }
  return [];
}

function saveItems(items) {
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(items, null, 2), 'utf-8');
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://collections.tepapa.govt.nz/'
      }
    }, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Status ${res.statusCode} for ${url}`));
      }
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function pickImage(item) {
  let images = [];
  if (Array.isArray(item.hasRepresentation)) {
    images = item.hasRepresentation;
  } else if (item.hasRepresentation) {
    images = [item.hasRepresentation];
  }
  const img = images.find(x => x && x.type === 'Image' && x.source);
  return img ? img.source : '';
}

function mapProductionArtist(item) {
  const prods = Array.isArray(item.production) ? item.production : [];
  for (const p of prods) {
    if (!p) continue;
    const actors = Array.isArray(p.hasCreator) ? p.hasCreator : (p.hasCreator ? [p.hasCreator] : []);
    if (actors.length > 0) {
      return actors.map(a => a?.title).filter(Boolean).join(', ');
    }
  }
  return '';
}

function mapDate(item) {
  const prods = Array.isArray(item.production) ? item.production : [];
  for (const p of prods) {
    if (p && p.dateOfProduction) return p.dateOfProduction;
    if (p && p.dateOfProductionSummary) return p.dateOfProductionSummary;
  }
  return '';
}

function mapDimensions(item) {
  const dims = Array.isArray(item.observedDimension) ? item.observedDimension : [];
  return dims.map(d => d?.description || d?.title).filter(Boolean).join('; ');
}

function mapMedium(item) {
  if (item.isMadeOfSummary) return item.isMadeOfSummary;
  const madeOf = Array.isArray(item.isMadeOf) ? item.isMadeOf : [];
  return madeOf.map((x) => x?.title).filter(Boolean).join('; ');
}

function mapRecord(item, categoryName) {
  const id = String(item.id || '');
  return {
    api_id: id,
    id,
    title: item.title || '',
    artist: mapProductionArtist(item),
    date: mapDate(item),
    medium: mapMedium(item),
    dimensions: mapDimensions(item),
    invNo: item.identifier || '',
    creditLine: item.creditLine || '',
    description: item.description || '',
    category: categoryName,
    categories: [categoryName],
    image: pickImage(item),
    image_url: pickImage(item),
    thumbnail: pickImage(item),
    museum: 'Museum of New Zealand Te Papa Tongarewa',
    url: item.href ? `https://collections.tepapa.govt.nz${item.href}` : `https://collections.tepapa.govt.nz/object/${id}`,
    source_api: `https://collections.tepapa.govt.nz/api/object/${id}`,
  };
}

async function collectCategoryItems(category) {
  let from = 0;
  let expectedTotal = null;
  const out = [];
  const seen = new Set();
  let errorCount = 0;

  while (true) {
    // Te Papa search endpoint for related items (hasImage=true limits to objects with images)
    const url = `https://collections.tepapa.govt.nz/api/search/category/${category.id}/related?hasImage=true&associations=${encodeURIComponent(ASSOCIATIONS)}&types=${encodeURIComponent(TYPES)}&size=${PAGE_SIZE}&from=${from}`;
    
    let payload;
    try {
      payload = await fetchJson(url);
      errorCount = 0;
    } catch (e) {
      console.error(`\n[Error] ${e.message}`);
      errorCount++;
      if (errorCount > 3) break;
      await new Promise(res => setTimeout(res, 2000));
      continue;
    }

    if (expectedTotal == null) {
      expectedTotal = Number(payload?._metadata?.resultset?.count || 0);
    }

    const results = Array.isArray(payload.results) ? payload.results : [];
    if (!results.length) break;

    let added = 0;
    for (const row of results) {
      const mapped = mapRecord(row, category.name);
      if (!mapped.api_id || seen.has(mapped.api_id) || !mapped.image) continue;
      seen.add(mapped.api_id);
      out.push(mapped);
      added += 1;
    }

    process.stdout.write(`\r[List] ${category.name} from=${from} fetched=${results.length} added=${added} total=${out.length}${expectedTotal ? `/${expectedTotal}` : ''}`);

    if (LIMIT > 0 && out.length >= LIMIT) {
      console.log('\n[List] LIMIT reached.');
      break;
    }

    if (expectedTotal && from + results.length >= expectedTotal) break;
    from += results.length;
    await new Promise(res => setTimeout(res, 100)); // be nice to the API
  }

  console.log(`\n[List] ${category.name} collected ${out.length} unique objects.`);
  return out;
}

async function run() {
  console.log('Starting Expanded Te Papa Museum Scraper...');
  const allItems = loadExistingItems();
  
  const existingMap = new Map();
  for (const item of allItems) {
    existingMap.set(item.api_id, item);
  }

  let grandTotal = allItems.length;

  for (const cat of CATEGORIES) {
    const items = await collectCategoryItems(cat);
    let newCount = 0;
    for (const item of items) {
      if (!existingMap.has(item.api_id)) {
        existingMap.set(item.api_id, item);
        allItems.push(item);
        newCount++;
      } else {
        // Append category if another exists
        const existing = existingMap.get(item.api_id);
        if (!existing.categories.includes(item.category)) {
          existing.categories.push(item.category);
        }
      }
    }
    grandTotal += newCount;
    saveItems(allItems);
  }

  console.log(`\n[List] Finished successfully. Grand Total: ${allItems.length} items.`);
}

run().catch(err => {
  console.error('[Fatal Error]', err);
  process.exit(1);
});
