const fs = require('fs');
const data = JSON.parse(fs.readFileSync('public/data/tate-modern.json'));
// Remove empty display items
data.items = data.items.filter(it => {
  const id = it.id || '';
  return !id.startsWith('display-') || (it.rooms && it.rooms.length > 0);
});
fs.writeFileSync('public/data/tate-modern.json', JSON.stringify(data, null, 2));
console.log('Cleaned up, remaining items:', data.items.length);
