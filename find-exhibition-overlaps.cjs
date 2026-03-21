const fs = require('fs');
const lines = fs.readFileSync('indexed_exhibitions.txt', 'utf8').split('\n').filter(Boolean);
const prefixes = {};

lines.forEach(line => {
    const parts = line.trim().match(/^(\d+)\s+"([^"]+)"$/);
    if (!parts) return;
    const count = parseInt(parts[1], 10);
    const exh = parts[2];
    
    // Group by first part of hyphenated name, or base name
    const prefix = exh.split('-')[0];
    if (!prefixes[prefix]) prefixes[prefix] = [];
    prefixes[prefix].push({ exh, count });
});

for (const [prefix, list] of Object.entries(prefixes)) {
    if (list.length > 1) {
        console.log(`\nPrefix: ${prefix}`);
        list.forEach(item => console.log(`  ${item.count} - ${item.exh}`));
    }
}
