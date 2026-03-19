const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '../public/data/ngprague-collection-test.json');
const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));

data.forEach(item => {
    if (!item.year && item.metadata.date) {
        item.year = item.metadata.date;
    }
});

fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
console.log('Patched years in ngprague-collection-test.json');
