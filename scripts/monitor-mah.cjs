const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../public/data/mah-collection.json');
const TARGET_ESTIMATE = 3200; // Estimated from search results

function getProgress() {
    try {
        if (!fs.existsSync(DATA_FILE)) return 0;
        const content = fs.readFileSync(DATA_FILE, 'utf8');
        // Simple regex count is faster/safer for partial JSON than JSON.parse
        const matches = content.match(/"id":/g);
        return matches ? matches.length : 0;
    } catch (e) {
        return 0;
    }
}

function drawProgressBar(current, total, width = 40) {
    const percentage = Math.min(100, (current / total) * 100);
    const filled = Math.round((width * percentage) / 100);
    const empty = width - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    return `[${bar}] ${percentage.toFixed(1)}%`;
}

console.clear();
console.log('\x1b[36m%s\x1b[0m', '=== MAH Scraper Monitor ===');
console.log('Monitoring: ' + DATA_FILE);

setInterval(() => {
    const current = getProgress();
    
    // Move cursor up 3 lines
    process.stdout.write('\x1b[3A');
    process.stdout.write('\x1b[K'); // Clear line
    console.log(`\nItems collected: \x1b[32m${current}\x1b[0m / ~${TARGET_ESTIMATE}`);
    process.stdout.write('\x1b[K');
    console.log(drawProgressBar(current, TARGET_ESTIMATE));
    process.stdout.write('\x1b[K');
    console.log(`Last update: ${new Date().toLocaleTimeString()}`);
}, 2000);
