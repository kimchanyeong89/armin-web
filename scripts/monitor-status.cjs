const fs = require('fs');
const path = require('path');

const AGNSW_FILE = path.join(__dirname, '../public/data/agnsw-collection.json');
const TROVE_FILE = path.join(__dirname, '../public/data/agnsw-trove-collection.json');

console.clear();
console.log("=== AGNSW & Trove Scraper Monitor ===");
console.log("Press Ctrl+C to stop.\n");

setInterval(() => {
    let agnswCount = 0;
    let agnswEnriched = 0;
    let troveCount = 0;

    if (fs.existsSync(AGNSW_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(AGNSW_FILE));
            agnswCount = data.length;
            agnswEnriched = data.filter(i => i.medium && i.medium.length > 0).length;
        } catch(e) {}
    }

    if (fs.existsSync(TROVE_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(TROVE_FILE));
            troveCount = data.length;
        } catch(e) {}
    }

    // Move cursor up 2 lines and clear
    process.stdout.write(`\r\x1b[KAGNSW Items: ${agnswCount} (Enriched: ${agnswEnriched})\n`);
    process.stdout.write(`\x1b[KTrove Items: ${troveCount}\n`);
    process.stdout.write(`\x1b[2A`); // Move back up

}, 2000);
