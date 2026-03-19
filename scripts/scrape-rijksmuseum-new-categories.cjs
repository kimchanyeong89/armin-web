#!/usr/bin/env node
/**
 * Rijksmuseum New Categories Scraper
 * Scrapes 4 new object-type categories using the undocumented v1 API:
 *   - cartoon (da8e49bd7e1ff7bbce9b72f085492a01) ~8418 items
 *   - design (ae1467b9e46b14088c02526de24aeda9) ~4821 items
 *   - poster (76f0a13803f4eeef59f136c4a2777b8e) ~3790 items
 *   - documentary photographs (71fe78971770d992d9c2ad0a8a33f867) ~3123 items
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'www.rijksmuseum.nl';
const SEARCH_API = '/api/v1/collection/search';
const OUTPUT_DIR = path.join(__dirname, '../public/data');
const DELAY_MS = 600; // 600ms between requests to be polite

const CATEGORIES = [
  {
    id: 'cartoon',
    facetId: 'da8e49bd7e1ff7bbce9b72f085492a01',
    name: 'Cartoons & Caricatures',
    outputFile: 'rijksmuseum-cartoon-collection.json',
  },
  {
    id: 'design',
    facetId: 'ae1467b9e46b14088c02526de24aeda9',
    name: 'Design',
    outputFile: 'rijksmuseum-design-collection.json',
  },
  {
    id: 'poster',
    facetId: '76f0a13803f4eeef59f136c4a2777b8e',
    name: 'Posters',
    outputFile: 'rijksmuseum-poster-collection.json',
  },
  {
    id: 'documentary-photographs',
    facetId: '71fe78971770d992d9c2ad0a8a33f867',
    name: 'Documentary Photographs',
    outputFile: 'rijksmuseum-docphotos-collection.json',
  },
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function fetchJSON(urlPath) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: BASE_URL,
      path: urlPath,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 100)}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(new Error('timeout')); });
    req.end();
  });
}

function transformItem(item, categoryName) {
  const micrioId = item.micrioImage?.micrioId;
  const imageUrl = micrioId ? `https://iiif.micr.io/${micrioId}/full/max/0/default.jpg` : '';
  const thumbnailUrl = micrioId ? `https://iiif.micr.io/${micrioId}/full/400,/0/default.jpg` : '';

  // Artist from makerSubtitleLine: "Jan Davidsz. de Heem, 1650 - 1683"
  let artist = '';
  let date = '';
  let year = null;
  if (item.makerSubtitleLine) {
    const parts = item.makerSubtitleLine.split(',');
    artist = parts[0].trim();
    if (parts.length > 1) {
      date = parts.slice(1).join(',').trim();
      const m = date.match(/\b(\d{4})\b/);
      if (m) year = parseInt(m[1], 10);
    }
  }

  const sourceUrl = item.objectNumber
    ? `https://www.rijksmuseum.nl/en/collection/${item.objectNumber}`
    : '';

  return {
    id: item.objectNumber || item.objectNodeId || '',
    objectNumber: item.objectNumber || '',
    title: item.title || '',
    artist,
    date,
    year,
    medium: item.physicalFeatures || '',
    dimensions: '',
    description: '',
    imageUrl,
    thumbnailUrl,
    onDisplay: !!item.museumLocationFacet,
    displayLocation: item.museumLocationFacet?.value || '',
    sourceUrl,
    category: categoryName,
    metadata: {}
  };
}

async function scrapeCategory(cat) {
  console.log(`\n📦 Scraping category: ${cat.name} (facet: ${cat.facetId})`);
  const artworks = [];
  let page = 1;
  let totalItems = Infinity;
  const seenIds = new Set();

  while (artworks.length < totalItems) {
    const urlPath = `${SEARCH_API}?language=en&page=${page}&sortingType=Popularity&onlyWithImages=true&facets%5B0%5D.id=${cat.facetId}&facets%5B0%5D.nodeRelationType=HasObjectType`;

    let data;
    try {
      data = await fetchJSON(urlPath);
    } catch (e) {
      console.error(`  Error on page ${page}: ${e.message}`);
      await sleep(2000);
      continue;
    }

    // Update total from first page response
    if (page === 1 && data.totalItemsArtObject !== undefined) {
      totalItems = data.totalItemsArtObject;
      console.log(`  Total items available: ${totalItems}`);
    }

    const items = data.artObjects || data.hits || [];
    if (!items.length) {
      console.log(`  No more items at page ${page}. Done.`);
      break;
    }

    for (const item of items) {
      if (!item.micrioImage?.micrioId) continue; // skip items without images
      const id = item.objectNumber || item.objectNodeId;
      if (!id || seenIds.has(id)) continue;
      seenIds.add(id);
      artworks.push(transformItem(item, cat.name));
    }

    console.log(`  Page ${page}: ${items.length} items → total collected: ${artworks.length}`);
    page++;
    await sleep(DELAY_MS);
  }

  console.log(`✅ ${cat.name}: ${artworks.length} artworks collected`);

  const output = {
    museum: 'Rijksmuseum',
    collection: cat.name,
    website: 'https://www.rijksmuseum.nl',
    scraped_date: new Date().toISOString(),
    total_count: artworks.length,
    artworks,
    last_updated: new Date().toISOString(),
  };

  const outPath = path.join(OUTPUT_DIR, cat.outputFile);
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`💾 Saved to ${cat.outputFile}`);
  return artworks.length;
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log('🚀 Rijksmuseum New Categories Scraper started');
  for (const cat of CATEGORIES) {
    try {
      await scrapeCategory(cat);
    } catch (e) {
      console.error(`❌ Failed to scrape ${cat.name}: ${e.message}`);
    }
    await sleep(1000);
  }
  console.log('\n✅ All categories done!');
}

main().catch(console.error);
