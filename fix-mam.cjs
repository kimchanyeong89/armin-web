const fs = require('fs');
const file = 'public/data/mam-collection.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

const uniqueData = [];
const seenIds = new Set();

for(const item of data) {
  if(!seenIds.has(item.id)) {
    uniqueData.push(item);
    seenIds.add(item.id);
  }
}

fs.writeFileSync(file, JSON.stringify(uniqueData, null, 2));
console.log(`Original count: ${data.length}\nUnique count: ${uniqueData.length}`);
