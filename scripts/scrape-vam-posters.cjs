#!/usr/bin/env node
/* Scrape V&A Poster collection (all posters with images)
   Source: https://collections.vam.ac.uk/search/?id_category=THES49001&images_exist=true&kw_object_type=Poster
   Output: public/data/vam-posters-display.json
*/
const fs = require('fs');
const path = require('path');

let got;

const OUT = path.join(__dirname, '../public/data/vam-posters-display.json');
const API = 'https://api.vam.ac.uk/v2/objects/search';
const IMG_BASE = 'https://framemark.vam.ac.uk/collections';

async function fetchJson(url) {
  if (!got) got = (await import('got')).default;
  const res = await got(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: { request: 30000 },
    retry: { limit: 3 },
  });
  return JSON.parse(res.body);
}

function buildImageUrl(imageId) {
  if (!imageId) return '';
  return IMG_BASE + '/' + imageId + '/full/800,/0/default.jpg';
}

async function main() {
  let page = 1;
  let allItems = [];

  while (true) {
    const url = API + '?id_category=THES49001&images_exist=1&kw_object_type=Poster&page_size=100&page=' + page;
    console.log('Fetching page', page);
    let data;
    try {
      data = await fetchJson(url);
    } catch (e) {
      console.log('API error on page', page, '-', e.message.slice(0, 80));
      console.log('Stopping pagination - API limit reached.');
      break;
    }
    const total = (data.info && data.info.record_count) ? data.info.record_count : 0;
    const records = data.records || [];
    if (page === 1) console.log('Total posters:', total);
    if (records.length === 0) break;

    const items = records.map(function(r) {
      const maker = r._primaryMaker;
      const artist = (maker && maker.name) ? maker.name : (typeof maker === 'string' ? maker : '');
      return {
        id: r.systemNumber || r.objectNumber || '',
        title: r._primaryTitle || r.objectType || 'Untitled',
        artist: artist,
        date: r._primaryDate || '',
        medium: r.materialsAndTechniques || '',
        dimensions: '',
        image: buildImageUrl(r._primaryImageId),
        url: 'https://collections.vam.ac.uk/item/' + (r.systemNumber || '') + '/',
        category: 'Poster',
        scrapedAt: new Date().toISOString(),
      };
    });

    allItems = allItems.concat(items);
    if (records.length < 100) break;
    page++;
  }

  console.log('Items scraped:', allItems.length);
  fs.writeFileSync(OUT, JSON.stringify(allItems, null, 2));
  console.log('Written to', OUT);
}

main().catch(function(e) { console.error(e); process.exit(1); });


