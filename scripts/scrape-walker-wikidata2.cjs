#!/usr/bin/env node
// Scrape Walker Art Gallery from Wikidata with SAMPLE() to avoid duplicate rows
// Adds: category (instance of P31), creator, date, accession

const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OUTPUT_FILE = path.join(__dirname, '../public/data/walker-art-gallery-collection.json');

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'ArtCollectionBot/1.0 (research)',
        'Accept': 'application/json',
      }
    }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function sparql(query) {
  const url = 'https://query.wikidata.org/sparql?query=' + encodeURIComponent(query) + '&format=json';
  let attempts = 0;
  while (attempts < 4) {
    try {
      const r = await get(url);
      if (r.status === 429) {
        const wait = 90000 + attempts * 30000;
        console.log(`Rate limited. Waiting ${wait/1000}s...`);
        await sleep(wait);
        attempts++;
        continue;
      }
      if (r.status !== 200) throw new Error(`SPARQL ${r.status}: ${r.body.slice(0,200)}`);
      return JSON.parse(r.body).results.bindings;
    } catch(e) {
      attempts++;
      if (attempts >= 4) throw e;
      console.log(`Retry ${attempts}: ${e.message}`);
      await sleep(8000 * attempts);
    }
  }
}

function buildThumbUrl(commonsFilePath, width = 600) {
  const encodedName = commonsFilePath.split('/').pop();
  let decodedName = decodeURIComponent(encodedName).replace(/ /g, '_');
  if (decodedName.startsWith('File:')) decodedName = decodedName.slice(5);
  const md5 = crypto.createHash('md5').update(decodedName).digest('hex');
  const dir1 = md5[0];
  const dir2 = md5[0] + md5[1];
  const encodedForUrl = encodeURIComponent(decodedName).replace(/%20/g, '_');
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${dir1}/${dir2}/${encodedForUrl}/${width}px-${encodedForUrl}`;
}

// Wikidata P31 values → normalized category
function normalizeCategory(typeLabel) {
  if (!typeLabel) return 'Painting';
  const t = typeLabel.toLowerCase();
  if (t.includes('print') || t.includes('etching') || t.includes('engraving') || t.includes('lithograph') || t.includes('woodcut') || t.includes('aquatint') || t.includes('mezzotint')) return 'Print';
  if (t.includes('drawing') || t.includes('sketch') || t.includes('study') || t.includes('cartoon')) return 'Drawing';
  if (t.includes('watercolour') || t.includes('watercolor')) return 'Watercolour';
  if (t.includes('photograph') || t.includes('photo')) return 'Photograph';
  if (t.includes('sculpture') || t.includes('statue') || t.includes('relief') || t.includes('bust')) return 'Sculpture';
  if (t.includes('miniature')) return 'Miniature';
  if (t.includes('pastel')) return 'Pastel';
  if (t.includes('tapestry') || t.includes('textile')) return 'Textile';
  if (t.includes('panel')) return 'Painting';
  if (t.includes('painting') || t.includes('canvas') || t.includes('altarpiece') || t.includes('triptych') || t.includes('diptych')) return 'Painting';
  return 'Painting'; // default
}

(async () => {
  console.log('=== Walker Art Gallery – Wikidata scraper (deduped) ===');
  
  // Count first
  const countRes = await sparql(`
SELECT (COUNT(DISTINCT ?item) AS ?cnt) WHERE {
  ?item wdt:P195 wd:Q1536471.
  ?item wdt:P18 ?image.
}`);
  const total = parseInt(countRes[0]?.cnt?.value || '0');
  console.log(`Total unique items with images: ${total}`);
  
  const BATCH = 500;
  let offset = 0;
  const seen = new Set();
  const items = [];
  
  while (true) {
    console.log(`\nFetching offset ${offset}...`);
    
    const results = await sparql(`
SELECT ?item (SAMPLE(?image) AS ?img) (SAMPLE(?itemLabel) AS ?title)
       (SAMPLE(?creatorLabel) AS ?artist) (SAMPLE(?inception) AS ?date)
       (SAMPLE(?typeLabel) AS ?category) (SAMPLE(?accNo) AS ?acc)
WHERE {
  ?item wdt:P195 wd:Q1536471.
  ?item wdt:P18 ?image.
  OPTIONAL { ?item wdt:P170 ?creator. ?creator rdfs:label ?creatorLabel. FILTER(LANG(?creatorLabel)="en") }
  OPTIONAL { ?item wdt:P571 ?inception }
  OPTIONAL { ?item wdt:P31 ?type. ?type rdfs:label ?typeLabel. FILTER(LANG(?typeLabel)="en") }
  OPTIONAL { ?item wdt:P217 ?accNo }
  ?item rdfs:label ?itemLabel. FILTER(LANG(?itemLabel)="en")
}
GROUP BY ?item
LIMIT ${BATCH} OFFSET ${offset}
    `);
    
    console.log(`Got ${results.length} results`);
    if (results.length === 0) break;
    
    for (const r of results) {
      const qid = r.item.value.split('/').pop();
      if (seen.has(qid)) continue;
      seen.add(qid);
      
      const title = r.title?.value || 'Untitled';
      const rawImg = r.img?.value || '';
      const artist = r.artist?.value || '';
      const rawDate = r.date?.value || '';
      const year = rawDate ? rawDate.split('T')[0].split('-')[0] : '';
      const typeLabel = r.category?.value || '';
      const category = normalizeCategory(typeLabel);
      const accNo = r.acc?.value || '';
      
      const image = rawImg ? buildThumbUrl(rawImg, 600) : '';
      
      items.push({
        id: `walker-wd-${qid}`,
        title,
        artist,
        year,
        image,
        category,
        categoryRaw: typeLabel,
        accessionNumber: accNo,
        sourceUrl: r.item.value,
        wikidataId: qid,
        commonsFile: rawImg,
      });
    }
    
    if (results.length < BATCH) break;
    offset += BATCH;
    await sleep(2000);
  }
  
  console.log(`\nUnique items collected: ${items.length}`);
  
  // Category breakdown
  const catStats = {};
  items.forEach(i => { catStats[i.category] = (catStats[i.category]||0)+1; });
  console.log('Categories:', JSON.stringify(catStats, null, 2));
  
  const withArtist = items.filter(i=>i.artist).length;
  const withYear = items.filter(i=>i.year).length;
  console.log(`With artist: ${withArtist}, with year: ${withYear}`);
  
  const output = {
    galleryId: 'wag-collection',
    galleryName: 'Walker Art Gallery',
    location: 'Liverpool, England',
    source: 'wikidata',
    scrapedAt: new Date().toISOString(),
    totalObjects: items.length,
    objects: items,
  };
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`\n✅ Saved ${items.length} items to ${OUTPUT_FILE}`);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
