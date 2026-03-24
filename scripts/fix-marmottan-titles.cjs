const fs = require('fs');

const dataRaw = fs.readFileSync('public/data/marmottan-collection.json');
const data = JSON.parse(dataRaw);
let changed = 0;

for (const obj of data.objects) {
    if (obj.title && obj.title.match(/^\d{4}\s*[;\-]\s*\d{4}$/)) {
        console.log(`Fixing: ${obj.artist} - ${obj.title} - ${obj.year}`);
        // But wait, the real year might be lost because it was lines[3].
        // However, year contains the actual title! 
        // Can we get the real year? We don't have it unless we re-scrape or regex replace it.
        // Actually, some items might just be lacking lines[3]. So year might just be the title and year is empty.
    }
}
