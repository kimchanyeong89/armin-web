const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '../public/data/marmottan-collection.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

for (const obj of data.objects) {
  if (['M-6016', '888', '770'].includes(obj.id)) {
      console.log(`Fixing ${obj.id}...`);
      if (obj.year && !obj.year.match(/^\d{4}$/)) {
         obj.title = obj.year;
         obj.year = '';
      }
  }
}

fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
console.log("Fixed the final three.");
