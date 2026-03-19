#!/usr/bin/env node
/* Enrich Tate Modern collection with dimensions and better images via Tate API v2
   API: https://www.tate.org.uk/api/v2/artworks/?acno=T16392&fields=*
   Extracts acno from URL slug (last segment: "lopes-my-people-t16392" → "T16392")
   Updates: dimensions, image (from master_images), credit
*/
const fs = require('fs');
const path = require('path');

let got;
let pLimit;

const IN = path.join(__dirname, '../public/data/tate-modern-collection.json');
const OUT = IN;
const API = 'https://www.tate.org.uk/api/v2/artworks/';
const CONCURRENCY = 8;

async function fetchJson(url) {
  if (!got) got = (await import('got')).default;
  try {
    const res = await got(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.tate.org.uk/',
      },
      timeout: { request: 20000 },
      retry: { limit: 2 },
    });
    return JSON.parse(res.body);
  } catch (e) {
    return null;
  }
}

function extractAcno(item) {
  // From URL like /art/artworks/lopes-my-people-t16392 → "T16392"
  const slug = item.url ? item.url.split('/').pop() : item.id;
  const m = slug.match(/([a-z]\d+)$/i);
  return m ? m[1].toUpperCase() : null;
}

function getBestImage(apiItem) {
  // master_images array has {urls: [...], default_url: "..."}
  if (apiItem.master_images && Array.isArray(apiItem.master_images) && apiItem.master_images.length > 0) {
    const mi = apiItem.master_images[0];
    if (mi.default_url) return mi.default_url;
    if (mi.urls && mi.urls.length > 0) return mi.urls[0];
  }
  // Fallback to media URL pattern
  const acno = apiItem.acno;
  if (acno) {
    const prefix = acno.substring(0, 1);
    const prefix3 = acno.substring(0, 3);
    return `https://media.tate.org.uk/art/images/work/${prefix}/${prefix3}/${acno}_7.jpg`;
  }
  return '';
}

async function enrichItem(item, acno) {
  if (!acno) return item;
  const url = `${API}?acno=${acno}&fields=*`;
  const data = await fetchJson(url);
  if (!data || !data.items || !data.items.length) return item;
  const a = data.items[0];

  const dimensions = (a.dimensions || '').replace(/\r\n/g, ' ').replace(/\n/g, ' ').trim();
  const medium = a.medium || item.medium || '';
  const credit = a.creditLine || item.credit || '';
  const image = getBestImage(a) || item.image || '';
  const dateText = a.dateText || item.dateText || '';
  const title = a.title || item.title;
  // allArtists: [{id, name, role, startYear, endYear}]
  let artist = item.artist;
  if (Array.isArray(a.allArtists) && a.allArtists.length) {
    artist = a.allArtists.map(x => x.name).join(', ');
  } else if (typeof a.allArtists === 'string' && a.allArtists) {
    artist = a.allArtists;
  }

  return { ...item, title, artist, dateText, medium, dimensions, credit, image };
}

async function main() {
  pLimit = (await import('p-limit')).default;

  const items = JSON.parse(fs.readFileSync(IN, 'utf8'));
  console.log(`Enriching ${items.length} Tate Modern artworks via API...`);

  const limit = pLimit(CONCURRENCY);
  let done = 0;
  const tasks = items.map(item => limit(async () => {
    try {
      const acno = extractAcno(item);
      const enriched = await enrichItem(item, acno);
      done++;
      if (done % 100 === 0) console.log(`  ${done}/${items.length}`);
      await new Promise(r => setTimeout(r, 100));
      return enriched;
    } catch (e) {
      done++;
      console.error(`  Error on ${item.url}: ${e.message}`);
      return item;
    }
  }));

  const enriched = await Promise.all(tasks);
  const withImg = enriched.filter(x => x.image).length;
  const withDims = enriched.filter(x => x.dimensions).length;
  console.log(`\nDone: ${enriched.length} | with image: ${withImg} | with dimensions: ${withDims}`);

  fs.writeFileSync(OUT, JSON.stringify(enriched, null, 2));
  console.log('Written to', OUT);
}

main().catch(e => { console.error(e); process.exit(1); });
