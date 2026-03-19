const fs = require('fs');

const files = [
  'public/data/mah-collection.json',
  'public/data/mah-collection-1768573047934.json',
  'public/data/mah-collection-1768572847125.json'
];

function getItems(payload) {
  if (Array.isArray(payload)) return payload;
  return payload?.artworks || payload?.items || payload?.data || payload?.results || [];
}

for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
  const items = getItems(payload);
  const urls = items
    .map((it) => it.image || it.imageUrl || it.image_url || it.thumbnail || '')
    .filter(Boolean);
  const map = new Map();
  for (const url of urls) map.set(url, (map.get(url) || 0) + 1);
  const total = items.length;
  const uniq = map.size;
  const dupHeavy = [...map.values()].filter((v) => v >= 10).reduce((a, b) => a + b, 0);
  console.log(file, { total, uniq, dupHeavy });
}
