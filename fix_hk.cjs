const fs = require('fs');
for (let file of ['hamburger-kunsthalle-paintings.json', 'hamburger-kunsthalle-drawings.json', 'hamburger-kunsthalle-video.json']) {
  let path = './public/data/' + file;
  if (!fs.existsSync(path)) continue;
  let data = JSON.parse(fs.readFileSync(path, 'utf8'));
  let items = data.artworks || data.objects || data.items || data;
  let changed = 0;
  for (let item of items) {
    if (item.imageUrl && item.imageUrl.includes('.r2.dev')) {
       item.imageUrl = item.original_imageUrl || item.thumbnailUrl;
       changed++;
    }
    // ensure if drawings uses something else, it points to thumbnail
    if (!item.imageUrl && item.thumbnailUrl) {
       item.imageUrl = item.thumbnailUrl;
       changed++;
    }
  }
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
  console.log(file, 'fixed images:', changed);
}
