const fs = require('fs');
const readline = require('readline');

const IN_FILE = 'public/data/met-ny-on-view-paintings.jsonl';
const OUT_FILE = 'public/data/met-ny-on-view-paintings.json';

(async () => {
    const stream = fs.createReadStream(IN_FILE, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    
    const items = [];
    const seen = new Set();
    
    for await (const line of rl) {
        if (!line.trim()) continue;
        try {
            const item = JSON.parse(line);
            if (item.objectID && !seen.has(item.objectID)) {
                seen.add(item.objectID);
                items.push(item);
            }
        } catch {}
    }
    
    fs.writeFileSync(OUT_FILE, JSON.stringify(items, null, 2));
    console.log(`Finalized ${items.length} items to ${OUT_FILE}`);
})();
