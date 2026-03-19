#!/usr/bin/env node
// Fix Whitney images that return 403 by fetching the correct URL from the Whitney website
const fs = require('fs');
const { spawnSync } = require('child_process');

function fetchURL(url, headers = []) {
    const args = ['-s', '-m', '15', '-L',
        '-H', 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        ...headers,
        url
    ];
    const r = spawnSync('curl', args, { maxBuffer: 5 * 1024 * 1024 });
    return r.status === 0 ? r.stdout.toString() : '';
}

function fetchStatusCode(url) {
    const r = spawnSync('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', '-m', '10', url], {});
    return r.status === 0 ? r.stdout.toString().trim() : '0';
}

// Load Whitney data
const data = JSON.parse(fs.readFileSync('./public/data/whitney-collection.json', 'utf8'));
console.log('Total Whitney items:', data.length);

// Find items likely to have stale/broken image URLs
// Heuristic: URL filenames like T_YYYY_NNN_N.jpg that are often rotated
const isStaleLikely = (url) => {
    if (!url) return false;
    // T_2024_xxx or T_2023_xxx patterns had high 403 rate
    return /\/T_20\d\d_\d+_\d+\.jpg$/i.test(url);
};

const staledItems = data.filter(x => isStaleLikely(x.image));
console.log('Potentially stale image URLs:', staledItems.length);

// Also do a spot check of a sample of items
const sampleSize = Math.min(200, staledItems.length);
const toCheck = staledItems.slice(0, sampleSize);

let fixed = 0;
let stillBroken = 0;
let alreadyOk = 0;

for (let i = 0; i < toCheck.length; i++) {
    const item = toCheck[i];
    const code = fetchStatusCode(item.image);

    if (code === '200') {
        alreadyOk++;
        continue;
    }

    // 403 or other error — fetch the real URL from Whitney website
    const artworkId = item.originalId || item.id?.replace('whitney-', '');
    if (!artworkId) {
        stillBroken++;
        continue;
    }

    const html = fetchURL(`https://whitney.org/collection/works/${artworkId}`);
    const imageMatch = html.match(/"image":"(https:\/\/whitneymedia\.org\/[^"]+)"/);

    if (imageMatch) {
        const newUrl = imageMatch[1];
        if (newUrl !== item.image) {
            const realIdx = data.findIndex(x => x.id === item.id);
            if (realIdx >= 0) {
                data[realIdx].image = newUrl;
                fixed++;
                console.log(`  Fixed [${i + 1}/${sampleSize}] id=${artworkId}: ${item.image.slice(-30)} → ${newUrl.slice(-30)}`);
            }
        } else {
            stillBroken++;
        }
    } else {
        stillBroken++;
        if (i % 20 === 0) process.stdout.write(`  [${i + 1}/${sampleSize}] checked, fixed:${fixed} ok:${alreadyOk} broken:${stillBroken}\r`);
    }
}

console.log(`\nResult: fixed=${fixed}, alreadyOk=${alreadyOk}, stillBroken=${stillBroken}`);

if (fixed > 0) {
    fs.writeFileSync('./public/data/whitney-collection.json', JSON.stringify(data, null, 2));
    console.log('Written → public/data/whitney-collection.json');
} else {
    console.log('No changes needed');
}
