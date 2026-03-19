#!/usr/bin/env node
/* Supplement V&A poster data - fetch items NOT in existing 10,000
   Strategy: fetch year-range batches (each <10,000), merge/dedup with existing data
   Output: public/data/vam-posters-display.json (appended)
*/
const fs = require('fs');
const path = require('path');

let got;
const API = 'https://api.vam.ac.uk/v2/objects/search';
const IMG_BASE = 'https://framemark.vam.ac.uk/collections';
const OUT = path.join(__dirname, '../public/data/vam-posters-display.json');

async function fetchJson(url) {
  if (!got) got = (await import('got')).default;
  try {
    const res = await got(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: { request: 30000 },
      retry: { limit: 3 },
    });
    return JSON.parse(res.body);
  } catch (e) {
    console.log('Error fetching:', url.slice(-60), '-', e.message.slice(0, 60));
    return null;
  }
}

function buildImageUrl(imageId) {
  if (!imageId) return '';
  return IMG_BASE + '/' + imageId + '/full/800,/0/default.jpg';
}

function recordToItem(r) {
  const maker = r._primaryMaker;
  const artist = (maker && maker.name) ? maker.name : (typeof maker === 'string' ? maker : '');
  return {
    id: r.systemNumber || r.objectNumber || '',
    title: r._primaryTitle || r.objectType || 'Untitled',
    artist,
    date: r._primaryDate || '',
    medium: r.materialsAndTechniques || '',
    dimensions: '',
    image: buildImageUrl(r._primaryImageId),
    url: 'https://collections.vam.ac.uk/item/' + (r.systemNumber || '') + '/',
    category: 'Poster',
    scrapedAt: new Date().toISOString(),
  };
}

async function fetchRange(yearFrom, yearTo, existingIds) {
  const params = `id_category=THES49001&images_exist=1&kw_object_type=Poster&page_size=100`;
  const yearParam = yearFrom !== null ? `&year_made_from=${yearFrom}&year_made_to=${yearTo}` : '';
  
  let page = 1;
  const newItems = [];
  let skipped = 0;

  while (true) {
    const url = `${API}?${params}${yearParam}&page=${page}`;
    const data = await fetchJson(url);
    if (!data) break;
    const records = data.records || [];
    if (records.length === 0) break;

    const total = data.info?.record_count || 0;
    if (page === 1) console.log(`  Year ${yearFrom || 'all'}-${yearTo || 'all'}: ${total} total`);

    for (const r of records) {
      const id = r.systemNumber || r.objectNumber || '';
      if (id && !existingIds.has(id)) {
        newItems.push(recordToItem(r));
        existingIds.add(id);
      } else {
        skipped++;
      }
    }

    if (records.length < 100) break;
    page++;
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`  → ${newItems.length} new items (skipped ${skipped} duplicates)`);
  return newItems;
}

async function main() {
  // Load existing data
  let existing = [];
  if (fs.existsSync(OUT)) {
    existing = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    console.log(`Loaded ${existing.length} existing items`);
  }
  const existingIds = new Set(existing.map(x => x.id));
  console.log(`Unique existing IDs: ${existingIds.size}`);

  // Year ranges to cover – each is <10,000 items so fully accessible
  const ranges = [
    [null, 1899],    // pre-1900: ~1,306
    [1900, 1949],   // 1900-1949: ~3,589
    [1950, 1974],   // 1950-1974: ~3,716
    [1975, 1999],   // 1975-1999: ~6,108
    [2000, 2030],   // 2000+: ~205
  ];

  let allNew = [];
  for (const [from, to] of ranges) {
    const newItems = await fetchRange(from, to, existingIds);
    allNew = allNew.concat(newItems);
    console.log(`  Running total new: ${allNew.length} | existing+new: ${existing.length + allNew.length}`);
  }

  const combined = existing.concat(allNew);
  console.log(`\nFinal total: ${combined.length} items (added ${allNew.length} new)`);

  fs.writeFileSync(OUT, JSON.stringify(combined, null, 2));
  console.log('Written to', OUT);
}

main().catch(e => { console.error(e); process.exit(1); });
