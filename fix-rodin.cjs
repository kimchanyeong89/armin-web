const fs = require('fs');
const file = 'public/data/rodin-collection.json';
if (fs.existsSync(file)) {
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
  console.log(`Rodin Original: ${data.length}\nRodin Unique: ${uniqueData.length}`);
} else {
  console.log("no rodin");
}
