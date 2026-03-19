const fs = require('fs');
const path = require('path');

const TARGET = path.join(__dirname, '..', 'public', 'data', 'ateneum-collection.json');
const SOURCE = path.join(__dirname, '..', 'public', 'data', 'ateneum-collection-15k-backup.json');

if (!fs.existsSync(SOURCE)) {
    console.error("Backup source not found.");
    process.exit(1);
}

console.log("Merging high-quality metadata from backup into strictly scraped list...");

const targetItems = JSON.parse(fs.readFileSync(TARGET, 'utf8'));
const sourceItems = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));

const sourceMap = new Map(sourceItems.map(i => [i.id, i]));
let updated = 0;

targetItems.forEach(item => {
    const source = sourceMap.get(item.id);
    if (source) {
        // Source has metadata from Multi-Pass (Sculpture, Drawing, etc.)
        // We generally trust Source category unless it is 'Artwork' and Target is 'Painting'

        const sCat = source.category;
        const tCat = item.category;

        let shouldUseSource = false;

        if (sCat !== 'Artwork') {
            if (tCat === 'Artwork') shouldUseSource = true;
            else if (tCat === 'Painting' && sCat !== 'Painting') {
                // Conflict: List says Painting, Multi-Pass says something else (e.g. Sculpture).
                // Trust Multi-Pass (usually more specific search found it).
                shouldUseSource = true;
            }
        }

        if (shouldUseSource) {
            item.category = source.category;
            item.medium = source.medium || item.medium; // Use source medium if available
            item.type = source.type;
            updated++;
        }

        // Also preserve 'onDisplay' if source had it true?
        // No, Strict Scraper 'OnDisplay' pass is authoritative for current status.
    }
});

fs.writeFileSync(TARGET, JSON.stringify(targetItems, null, 2));
console.log(`✅ Updated metadata for ${updated} items.`);
