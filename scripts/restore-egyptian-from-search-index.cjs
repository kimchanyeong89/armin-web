const fs = require('fs');

const INPUT = 'public/data/search-index-part-11.json';
const OUTPUT_JSON = 'public/data/egyptian-museum-cairo-collection.json';
const OUTPUT_CSV = 'public/data/egyptian-museum-cairo-collection.csv';
const TARGET_EXHIBITION = 'egyptian-museum-cairo-collection';

function toCsvValue(value) {
  return `"${String(value == null ? '' : value).replace(/"/g, '""')}"`;
}

const raw = fs.readFileSync(INPUT, 'utf8');
const list = JSON.parse(raw);

const items = list
  .filter((item) => item && item.e === TARGET_EXHIBITION)
  .map((item) => ({
    id: item.id || '',
    museum: item.m || 'The Egyptian Museum in Cairo',
    museumId: 'egyptian-museum-cairo',
    title: item.n || '',
    artist: item.a || 'Unknown',
    year: item.d || '',
    category: 'Artefact',
    medium: '',
    description: '',
    onDisplay: true,
    image: item.i || '',
    sourceUrl: ''
  }))
  .filter((item) => item.id && item.title && item.image);

fs.writeFileSync(OUTPUT_JSON, JSON.stringify(items, null, 2));

const headers = [
  'id',
  'museum',
  'museumId',
  'title',
  'artist',
  'year',
  'category',
  'medium',
  'description',
  'onDisplay',
  'image',
  'sourceUrl'
];
const lines = [headers.join(',')];
for (const row of items) {
  lines.push([
    row.id,
    row.museum,
    row.museumId,
    row.title,
    row.artist,
    row.year,
    row.category,
    row.medium,
    row.description,
    row.onDisplay,
    row.image,
    row.sourceUrl
  ].map(toCsvValue).join(','));
}
fs.writeFileSync(OUTPUT_CSV, lines.join('\n'));

console.log(`Restored ${items.length} items to ${OUTPUT_JSON}`);
