#!/usr/bin/env node
// Convert Walker Art Gallery Wikimedia URLs to wsrv.nl proxied URLs
// This fixes gallery mode loading issues (Wikimedia throttles parallel requests)

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '../public/data/walker-art-gallery-collection.json');
const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));

let converted = 0;
data.objects = data.objects.map(item => {
  if (item.image && item.image.includes('upload.wikimedia.org')) {
    // Store original for lightbox use
    item.imageOriginal = item.image;
    // 400px proxy thumbnail for gallery (wsrv.nl CDN)
    item.image = `https://wsrv.nl/?url=${encodeURIComponent(item.image)}&w=400&q=75&output=webp`;
    converted++;
  }
  return item;
});

console.log(`Converted ${converted}/${data.objects.length} Wikimedia URLs to wsrv.nl proxy`);
fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
console.log('Saved:', FILE);

// Quick sanity check
const sample = data.objects.slice(0,3).map(x => ({ title: x.title, image: x.image.slice(0, 80) }));
console.log('\nSample:');
sample.forEach(s => console.log(`  ${s.title}: ${s.image}`));
