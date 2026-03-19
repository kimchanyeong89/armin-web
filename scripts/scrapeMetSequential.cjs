#!/usr/bin/env node
const fs = require('fs');
const { spawnSync } = require('child_process');

function curlJSON(url) {
    const r = spawnSync('curl', [
        '-s', '-m', '10',
        url
    ], { maxBuffer: 5 * 1024 * 1024 });
    if (r.error || r.status !== 0) return null;
    try { return JSON.parse(r.stdout.toString()); }
    catch { return null; }
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchWithRetry(url, retries = 3) {
    for (let i = 0; i <= retries; i++) {
        const d = curlJSON(url);
        if (d && d.objectID) return d;
        if (i < retries) await sleep(1000 * (i + 1));
    }
    return null;
}

async function main() {
    console.log('=== Met Paintings - Strict Scraper (CURL Sequential) ===');

    const onDisplayData = curlJSON('https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&isOnView=true&medium=Paintings&q=painting');
    const highlightData = curlJSON('https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&isHighlight=true&medium=Paintings&q=painting');

    const onDisplayIds = new Set((onDisplayData?.objectIDs || []).map(String));
    const highlightIds = new Set((highlightData?.objectIDs || []).map(String));
    const allIds = Array.from(new Set([...onDisplayIds, ...highlightIds]));

    console.log(`Total IDs to fetch: ${allIds.length}`);

    const results = [];
    let noImage = 0;
    let notPainting = 0;
    let failed = 0;

    for (let i = 0; i < allIds.length; i++) {
        const id = allIds[i];

        const d = await fetchWithRetry(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`);
        if (!d) {
            failed++;
            continue;
        }

        const image = d.primaryImageSmall || d.primaryImage || '';
        if (!image) { noImage++; continue; }

        // Strict filter for true paintings
        const isPainting =
            (d.classification && d.classification.toLowerCase().includes('painting')) ||
            (d.objectName && d.objectName.toLowerCase().includes('painting')) ||
            (d.medium && d.medium.toLowerCase().includes('canvas')) ||
            (d.medium && d.medium.toLowerCase().includes('oil '));

        if (!isPainting) {
            notPainting++;
            continue;
        }

        results.push({
            id: String(d.objectID),
            title: d.title || '',
            artist: d.artistDisplayName || d.artistAlphaSort || '',
            date: d.objectDate || '',
            image,
            medium: d.medium || '',
            dimension: d.dimensions || '',
            url: d.objectURL || '',
            isPublicDomain: !!d.isPublicDomain,
            isHighlight: highlightIds.has(String(d.objectID)),
            isOnView: onDisplayIds.has(String(d.objectID)),
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

        if (i % 20 === 0) {
            process.stdout.write(`\rProgress: ${i}/${allIds.length} | Saved: ${results.length} | NotPainting: ${notPainting} | Failed: ${failed}`);
        }

        await sleep(120); // Rate limiter
    }

    console.log('\n=== COMPLETE ===');
    console.log(`Final count: ${results.length} valid paintings`);
    fs.writeFileSync('./public/data/met-ny-collection.json', JSON.stringify(results, null, 2));
    console.log('Saved to ./public/data/met-ny-collection.json');
}

main().catch(console.error);
