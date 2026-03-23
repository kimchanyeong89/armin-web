const fs = require('fs');

const files = fs.readFileSync('rmn_files.txt', 'utf8').split('\n').filter(x => x.trim() !== '');

let totalRemoved = 0;

for (const file of files) {
  if (!fs.existsSync(file)) continue;
  
  let d;
  try {
    d = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch(e) {
    console.log(`Failed to parse ${file}`);
    continue;
  }
  
  const isPlaceholder = (obj) => {
    const urls = [obj.image, obj.imageUrl, obj.originalImage].filter(Boolean);
    return urls.some(url => url.includes('grandpalaisrmn.fr') || url.includes('ui/images/placeholder'));
  };
  
  let before = 0;
  let after = 0;

  if (Array.isArray(d)) {
    before = d.length;
    d = d.filter(o => !isPlaceholder(o));
    after = d.length;
  } else if (d.objects && Array.isArray(d.objects)) {
    before = d.objects.length;
    d.objects = d.objects.filter(o => !isPlaceholder(o));
    after = d.objects.length;
  } else if (d.items && Array.isArray(d.items)) {
    before = d.items.length;
    d.items = d.items.filter(o => !isPlaceholder(o));
    after = d.items.length;
  } else if (d.artworks && Array.isArray(d.artworks)) {
    before = d.artworks.length;
    d.artworks = d.artworks.filter(o => !isPlaceholder(o));
    after = d.artworks.length;
  }
  
  const removed = before - after;
  if (removed > 0) {
    fs.writeFileSync(file, JSON.stringify(d, null, 2));
    console.log(`File: ${file} | Removed: ${removed} | Remaining: ${after}`);
    totalRemoved += removed;
  }
}

console.log(`\nTotal placeholders removed: ${totalRemoved}`);