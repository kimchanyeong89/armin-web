const fs = require('fs');

// Fix Wawel URLs
const wawel = JSON.parse(fs.readFileSync('./public/data/wawel-collection.json', 'utf8'));
let fixed = 0;
for (let item of wawel) {
    if (item.version) {
        // Look at current site URL pattern: it uses "version" for the path
        item.url = 'https://wawel.krakow.pl/en/collection/' + item.version;
        fixed++;
    }
}
fs.writeFileSync('./public/data/wawel-collection.json', JSON.stringify(wawel, null, 2));
console.log('Fixed', fixed, 'Wawel URLs');
