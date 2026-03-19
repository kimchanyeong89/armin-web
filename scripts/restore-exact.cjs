const fs = require('fs');
const path = require('path');

const BACKUP = path.join(__dirname, '..', 'public', 'data', 'ateneum-collection-15k-backup.json');
const OUTPUT = path.join(__dirname, '..', 'public', 'data', 'ateneum-collection.json');

console.log("Extracting first 7025 items (original collection + Sculpture/Installation passes)...");

const all = JSON.parse(fs.readFileSync(BACKUP, 'utf8'));
console.log(`Backup has ${all.length} items.`);

// Take first 7025 items (this includes the original 6922 + 646 sculptures + 10 installations from the log)
const restored = all.slice(0, 7025);

fs.writeFileSync(OUTPUT, JSON.stringify(restored, null, 2));
console.log(`✅ Restored ${restored.length} items.`);

// Verify
const sculptures = restored.filter(i => i.category === 'Sculpture').length;
const haapasalo = restored.find(i => i.id === '553279');
console.log(`Sculptures: ${sculptures}`);
console.log(`Has Johannes Haapasalo: ${!!haapasalo}`);
if (haapasalo) console.log(`  Category: ${haapasalo.category}`);
