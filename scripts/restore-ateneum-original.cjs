const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'public', 'data', 'ateneum-collection.json');
const BACKUP = path.join(__dirname, '..', 'public', 'data', 'ateneum-collection-15k-backup.json');

console.log("Restoring original 6922 items...");

const allItems = JSON.parse(fs.readFileSync(FILE, 'utf8'));
console.log(`Current file has ${allItems.length} items.`);

// Backup current
fs.writeFileSync(BACKUP, JSON.stringify(allItems, null, 2));
console.log(`Backed up to ${BACKUP}`);

// The original 6922 items should be the first ones (before multi-pass added more)
// We need to deduplicate and keep only items that were in the original collection
// Strategy: Keep items with lower IDs (older items) and limit to ~7000

// Sort by ID (numeric) to get original items first
const sorted = allItems.sort((a, b) => parseInt(a.id) - parseInt(b.id));

// Take first 7000 items (should cover the original 6922)
const restored = sorted.slice(0, 7000);

// Deduplicate by ID just in case
const uniqueMap = new Map();
restored.forEach(item => {
    if (!uniqueMap.has(item.id)) {
        uniqueMap.set(item.id, item);
    }
});

const final = Array.from(uniqueMap.values());
console.log(`Restored ${final.length} unique items.`);

fs.writeFileSync(FILE, JSON.stringify(final, null, 2));
console.log(`✅ Saved to ${FILE}`);
