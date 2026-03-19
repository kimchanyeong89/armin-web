#!/usr/bin/env node
// Phased approach: fetch IDs in small waves, respect rate limits
// Try 100 items at a time with delay between batches
const fs = require('fs');
const { spawnSync } = require('child_process');

function curl(url) {
    const r = spawnSync('curl', ['-s', '-m', '15', '-H', 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', url], {
        maxBuffer: 2 * 1024 * 1024
    });
    if (r.status !== 0 || !r.stdout.length) return null;
    try { return JSON.parse(r.stdout.toString()); }
    catch { return null; }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// IDs from search API (already done)
const onDisplayIds = JSON.parse(fs.readFileSync('/tmp/met-highlight-ids.json', 'utf8')).map(String);
// Also get on-display IDs fresh
const onDispResult = curl('https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&isOnView=true&medium=Paintings&q=painting');
const onDispIds = (onDispResult && onDispResult.objectIDs ? onDispResult.objectIDs : []).map(String);
console.log('On-display IDs:', onDispIds.length, '| Highlight IDs:', onDisplayIds.length);

const allIds = Array.from(new Set([...onDispIds, ...onDisplayIds]));
const onDispSet = new Set(onDispIds);
const hlSet = new Set(onDisplayIds);

// Find IDs NOT in the published URL file (from highlights list)
// All: fetch what we can now
console.log('Total unique:', allIds.length, '— trying first 300 items (rate limited)');

const results = [];
const start = Date.now();
let noImg = 0;
let nullResp = 0;

for (let i = 0; i < Math.min(300, allIds.length); i++) {
    const id = allIds[i];
    const d = curl(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`);

    if (!d || !d.objectID) {
        nullResp++;
        process.stdout.write(`\r${i + 1}/${Math.min(300, allIds.length)} saved:${results.length} null:${nullResp} noImg:${noImg}`);
        continue;
    }

    const image = d.primaryImageSmall || '';
    if (!image) {
        noImg++;
        process.stdout.write(`\r${i + 1}/${Math.min(300, allIds.length)} saved:${results.length} null:${nullResp} noImg:${noImg}`);
        continue;
    }

    results.push({
        id: String(d.objectID),
        title: d.title || '',
        artist: d.artistDisplayName || '',
        date: d.objectDate || '',
        image,
        medium: d.medium || '',
        dimension: d.dimensions || '',
        url: d.objectURL || '',
        isPublicDomain: !!d.isPublicDomain,
        isHighlight: hlSet.has(String(d.objectID)),
        isOnView: onDispSet.has(String(d.objectID)),
        galleryNumber: d.GalleryNumber || '',
        repository: d.repository || 'Metropolitan Museum of Art, New York, NY',
        objectName: d.objectName || '',
        classification: d.classification || 'Paintings',
        department: d.department || '',
        culture: d.culture || '',
        period: d.period || '',
        artistNationality: d.artistNationality || '',
        artistBeginDate: d.artistBeginDate || '',
        artistEndDate: d.artistEndDate || '',
        creditLine: d.creditLine || '',
        accessionNumber: d.accessionNumber || '',
        tags: (d.tags || []).map(t => t.term).join(', '),
    });

    process.stdout.write(`\r${i + 1}/${Math.min(300, allIds.length)} saved:${results.length} null:${nullResp} noImg:${noImg}`);
}

console.log(`\nDone in ${((Date.now() - start) / 1000).toFixed(0)}s`);
console.log(`Saved: ${results.length} | null: ${nullResp} | no img: ${noImg}`);
console.log(`Rate limited items: ${nullResp} (${(nullResp / 300 * 100).toFixed(0)}%)`);

if (results.length > 0) {
    fs.writeFileSync('/tmp/met-batch-result.json', JSON.stringify(results, null, 2));
    console.log('Partial result saved to /tmp/met-batch-result.json');
}
