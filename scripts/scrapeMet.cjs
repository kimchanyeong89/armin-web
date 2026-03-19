#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');

function curlJSON(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const out = execSync(
                `curl -s -m 15 -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" -H "Referer: https://www.metmuseum.org/" "${url}"`,
                { maxBuffer: 10 * 1024 * 1024, timeout: 20000 }
            ).toString();
            return JSON.parse(out);
        } catch (e) {
            if (i < retries - 1) {
                const ms = 500 + i * 500;
                console.log(`  retry ${i + 1} for ${url} after ${ms}ms`);
                execSync(`sleep 0.5`);
            }
        }
    }
    return null;
}

function getIds(params) {
    const qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    const url = `https://collectionapi.metmuseum.org/public/collection/v1/search?${qs}`;
    console.log('Fetching IDs from:', url);
    const d = curlJSON(url);
    return d && d.objectIDs ? d.objectIDs : [];
}

function fetchObject(id) {
    const url = `https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`;
    return curlJSON(url);
}

// ---- Main ----
console.log('=== Metropolitan Museum Paintings Scraper ===');

const onDisplayIds = getIds({ hasImages: 'true', isOnView: 'true', medium: 'Paintings', q: 'painting' });
console.log('On-display painting IDs:', onDisplayIds.length);

const highlightIds = getIds({ hasImages: 'true', isHighlight: 'true', medium: 'Paintings', q: 'painting' });
console.log('Highlight painting IDs:', highlightIds.length);

const onDisplaySet = new Set(onDisplayIds.map(String));
const highlightSet = new Set(highlightIds.map(String));
const allIds = Array.from(new Set([...onDisplayIds, ...highlightIds]));
console.log('Total unique IDs:', allIds.length);

const results = new Map();
let fetched = 0;

for (let i = 0; i < allIds.length; i++) {
    const id = allIds[i];
    const d = fetchObject(id);
    fetched++;

    if (!d) {
        if (fetched % 50 === 0) process.stdout.write(`${fetched}/${allIds.length} (${results.size} saved)\r`);
        continue;
    }

    const image = d.primaryImageSmall || d.primaryImage || '';
    if (!image) {
        if (fetched % 50 === 0) process.stdout.write(`${fetched}/${allIds.length} (${results.size} saved)\r`);
        continue;
    }

    results.set(String(id), {
        id: String(d.objectID),
        title: d.title || '',
        artist: d.artistDisplayName || '',
        date: d.objectDate || '',
        image,
        medium: d.medium || '',
        dimension: d.dimensions || '',
        url: d.objectURL || '',
        isPublicDomain: !!d.isPublicDomain,
        isHighlight: !!d.isHighlight,
        isOnView: onDisplaySet.has(String(id)),
        galleryNumber: d.GalleryNumber || d.galleryNumber || '',
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

    if (fetched % 100 === 0) {
        console.log(`Progress: ${fetched}/${allIds.length} (${results.size} saved)`);
    }
}

console.log('');
const finalArr = Array.from(results.values());
console.log(`\nTotal saved: ${finalArr.length}`);
console.log(`On-view: ${finalArr.filter(x => x.isOnView).length}`);
console.log(`Highlight: ${finalArr.filter(x => x.isHighlight).length}`);
console.log(`Public domain: ${finalArr.filter(x => x.isPublicDomain).length}`);

fs.writeFileSync('./public/data/met-ny-collection.json', JSON.stringify(finalArr, null, 2));
console.log('Saved to public/data/met-ny-collection.json');
