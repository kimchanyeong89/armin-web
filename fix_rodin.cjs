const fs = require('fs');

const data = JSON.parse(fs.readFileSync('./public/data/rodin-collection.json'));

const toDeleteIds = [];
const toDeleteUrls = [];
const kept = [];

for (const item of data) {
  if (item.original_imageUrl && item.original_imageUrl.includes('no-image.png')) {
    toDeleteIds.push(item.id);
    if (item.imageUrl) {
      toDeleteUrls.push(item.imageUrl);
    }
  } else {
    // Fix artist name
    if (item.artist && /RODIN/i.test(item.artist) && /Auguste/i.test(item.artist)) {
      item.artist = 'Auguste Rodin';
    }
    kept.push(item);
  }
}

fs.writeFileSync('./public/data/rodin-collection.json', JSON.stringify(kept, null, 2));
fs.writeFileSync('./rodin_deletes.json', JSON.stringify({ ids: toDeleteIds, urls: toDeleteUrls }, null, 2));

console.log(`Original count: ${data.length}, Kept: ${kept.length}, To Delete: ${toDeleteIds.length}`);
