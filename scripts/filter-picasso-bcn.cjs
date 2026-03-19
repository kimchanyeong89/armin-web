/**
 * Filter Picasso Barcelona collection:
 * - Remove items with category "Sketchbooks" (any case)
 * - Remove items where medium starts with "Sugar-lift" or "Aiguafort" (case-insensitive)
 * - Remove items where medium starts with "Graphite pencil on paper"
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../public/data/picasso-bcn-collection.json');
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
const arr = data.artworks || data.objects || data;

const before = arr.length;

const filtered = arr.filter(item => {
  const cat = (item.category || '').toLowerCase();
  const med = (item.medium || '').toLowerCase();
  
  // Remove sketchbooks category
  if (cat.includes('sketchbook')) return false;
  
  // Remove Sugar-lift starting medium
  if (med.startsWith('sugar-lift')) return false;
  
  // Remove Aiguafort starting medium (case-insensitive)
  if (med.startsWith('aiguafort')) return false;
  
  // Remove Graphite pencil on paper
  if (med.startsWith('graphite pencil on paper')) return false;
  
  return true;
});

const after = filtered.length;
console.log(`Before: ${before}, After: ${after}, Removed: ${before - after}`);

// Show breakdown of what was removed
const removed = arr.filter(item => {
  const cat = (item.category || '').toLowerCase();
  const med = (item.medium || '').toLowerCase();
  return cat.includes('sketchbook') || med.startsWith('sugar-lift') || med.startsWith('aiguafort') || med.startsWith('graphite pencil on paper');
});

const sketchbooks = removed.filter(i => (i.category || '').toLowerCase().includes('sketchbook'));
const sugarLift = removed.filter(i => (i.medium || '').toLowerCase().startsWith('sugar-lift'));
const aiguafort = removed.filter(i => (i.medium || '').toLowerCase().startsWith('aiguafort'));
const graphite = removed.filter(i => (i.medium || '').toLowerCase().startsWith('graphite pencil on paper'));

console.log(`  Sketchbooks: ${sketchbooks.length}`);
console.log(`  Sugar-lift: ${sugarLift.length}`);
console.log(`  Aiguafort: ${aiguafort.length}`);
console.log(`  Graphite pencil on paper: ${graphite.length}`);

// Save
const output = {
  ...data,
  artworks: filtered,
  totalItems: filtered.length,
  filteredAt: new Date().toISOString(),
};
delete output.objects;
fs.writeFileSync(filePath, JSON.stringify(output, null, 2));
console.log(`Saved ${after} items to ${filePath}`);
