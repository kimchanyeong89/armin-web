#!/usr/bin/env node
// Scrape V&A collection from 4 specific search URLs:
// 1. Oil paintings (category THES48917)
// 2. Paintings (category THES48917)  
// 3. Posters (category THES48903)
// 4. Watercolours
// Outputs: public/data/vam-permanent-exhibitions.json

const fs = require('fs');
const path = require('path');

const PAGE_SIZE = 100;
const DELAY_MS = 300;

const QUERIES = [
  { label: 'Oil paintings', params: 'id_category=THES48917&images_exist=1&kw_location_type=display&kw_object_type=Oil+painting' },
  { label: 'Paintings',     params: 'id_category=THES48917&images_exist=1&kw_location_type=display&kw_object_type=Painting' },
  { label: 'Posters',       params: 'id_category=THES48903&images_exist=1&kw_location_type=display&kw_object_type=Poster' },
  { label: 'Watercolours',  params: 'images_exist=1&kw_location_type=display&kw_object_type=Watercolour' },
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchPage(params, page) {
  let got;
  if (!fetchPage._got) {
    fetchPage._got = (await import('got')).default;
  }
  got = fetchPage._got;

  const url = `https://api.vam.ac.uk/v2/objects/search?${params}&page_size=${PAGE_SIZE}&page=${page}&fields=id,title,artist,date,medium,dimensions,image`;
  const res = await got(url, {
    headers: { 'user-agent': 'Mozilla/5.0' },
    timeout: { request: 20000 },
    retry: { limit: 3 }
  });
  return JSON.parse(res.body);
}

function buildImageUrl(record) {
  // The V&A API returns _primaryImageId for the image
  const imageId = record._primaryImageId;
  if (!imageId) return '';
  return `https://framemark.vam.ac.uk/collections/${imageId}/full/800,/0/default.jpg`;
}

function normArtist(record) {
  // Try _primaryMaker.name, then artMakers array, then direct artist field
  if (record._primaryMaker && record._primaryMaker.name) return record._primaryMaker.name;
  if (Array.isArray(record.artMakers) && record.artMakers.length > 0) return record.artMakers[0].name || '';
  return '';
}

function normDate(record) {
  if (record._primaryDate) return record._primaryDate;
  if (record.productionDates && record.productionDates.length > 0) {
    return record.productionDates[0].date?.text || '';
  }
  return '';
}

async function scrapeQuery(query) {
  console.log(`\nScraping: ${query.label}`);
  const results = [];
  let page = 1;

  while (true) {
    try {
      const data = await fetchPage(query.params, page);
      const records = data.records || [];
      const total = data.info?.record_count || 0;

      console.log(`  Page ${page}: ${records.length} records (total: ${total})`);

      for (const rec of records) {
        const image = buildImageUrl(rec);
        if (!image) continue; // Skip items without images

        results.push({
          id: rec.systemNumber || rec.id || `vam-${results.length}`,
          title: rec._primaryTitle || rec.title || 'Untitled',
          artist: normArtist(rec),
          date: normDate(rec),
          medium: rec.medium || '',
          dimensions: rec.dimensions || '',
          image,
          url: `https://collections.vam.ac.uk/item/${rec.systemNumber || rec.id}/`,
          category: query.label,
          scrapedAt: new Date().toISOString()
        });
      }

      if (records.length < PAGE_SIZE || results.length >= total) break;
      page++;
      await sleep(DELAY_MS);
    } catch (err) {
      console.error(`  Error on page ${page}:`, err.message);
      break;
    }
  }

  return results;
}

async function main() {
  const seen = new Set();
  const allItems = [];

  for (const query of QUERIES) {
    const items = await scrapeQuery(query);
    let added = 0;
    for (const item of items) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        allItems.push(item);
        added++;
      }
    }
    console.log(`  Added ${added} unique items from ${query.label} (${items.length} scraped)`);
  }

  console.log(`\nTotal unique items: ${allItems.length}`);

  const outPath = path.join(__dirname, '../public/data/vam-permanent-exhibitions.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(allItems, null, 2));
  console.log(`Written to ${outPath}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
