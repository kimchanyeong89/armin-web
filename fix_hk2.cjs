const fs = require('fs');

const FILES = ['hamburger-kunsthalle-paintings.json', 'hamburger-kunsthalle-drawings.json', 'hamburger-kunsthalle-video.json'];

for (let file of FILES) {
  let path = './public/data/' + file;
  if (!fs.existsSync(path)) continue;
  
  let data = JSON.parse(fs.readFileSync(path, 'utf8'));
  let items = data.artworks || data.objects || data.items || data;
  let changed = 0;
  
  for (let item of items) {
    if (item.imageUrl && item.imageUrl.includes('online-sammlung.hamburger-kunsthalle.de')) {
       // if not already proxied
       if (!item.imageUrl.includes('wsrv.nl')) {
          item.imageUrl = 'https://wsrv.nl/?url=' + encodeURIComponent(item.imageUrl);
          changed++;
       }
    }
  }
  
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
  console.log(file, 'Proxied URLs:', changed);
}
