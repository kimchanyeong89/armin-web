const fs = require('fs');
const file = 'public/data/albertina-permanent-collection.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
let fixed = 0;
data.objects.forEach(item => {
    if (item.imageUrl && !item.imageUrl.includes('r2.dev') && !item.imageUrl.includes('wsrv.nl')) {
        item.imageUrl = 'https://wsrv.nl/?url=' + encodeURIComponent(item.imageUrl);
        fixed++;
    }
});
fs.writeFileSync(file, JSON.stringify(data, null, 2));
console.log('Fixed Albertina remaining images: ' + fixed);
