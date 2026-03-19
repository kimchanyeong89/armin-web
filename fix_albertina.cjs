const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'public', 'data', 'albertina-permanent-collection.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
let fixed = 0;
data.forEach(item => {
    if (item.imageUrl && !item.imageUrl.includes('r2.dev')) {
        let proxy = "https://wsrv.nl/?url=" + encodeURIComponent(item.imageUrl);
        item.original_imageUrl = item.imageUrl;
        item.imageUrl = proxy;
        fixed++;
    }
});
fs.writeFileSync(file, JSON.stringify(data, null, 2));
console.log(`Proxied ${fixed} URLs in Albertina to wsrv.`);
