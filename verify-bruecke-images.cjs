const fs = require('fs');
const d = require('./public/data/bruecke-museum-collection.json');

async function testUrl(item) {
  if (!item.imageUrl) return item;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const r = await fetch(item.imageUrl, { method: 'HEAD', signal: controller.signal });
    clearTimeout(timeout);
    if (r.status !== 200) {
      item.imageUrl = "";
      item.thumbnailUrl = "";
    }
  } catch (e) {
    item.imageUrl = "";
    item.thumbnailUrl = "";
  }
  return item;
}

async function run() {
  const batchSize = 25;
  for (let i = 0; i < d.length; i += batchSize) {
    const batch = d.slice(i, i + batchSize);
    await Promise.all(batch.map(item => testUrl(item)));
    console.log(`Verified up to ${i + batchSize}`);
  }
  fs.writeFileSync('./public/data/bruecke-museum-collection.json', JSON.stringify(d, null, 2));
  console.log('Verification done!');
}
run();
