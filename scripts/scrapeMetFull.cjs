#!/usr/bin/env node
// Full Met paintings scraper using curl concurrently with GNU parallel or xargs
// Fetch on-display + highlight paintings from Met API
const fs = require('fs');
const { execSync, spawnSync } = require('child_process');

function curlJSON(url) {
    const r = spawnSync('curl', [
        '-s', '-m', '20',
        '-H', 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        '-H', 'Accept: application/json',
        url
    ], { maxBuffer: 5 * 1024 * 1024 });
    if (r.error || r.status !== 0) return null;
    try { return JSON.parse(r.stdout.toString()); }
    catch { return null; }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchWithCurl(url, retries = 2) {
    for (let i = 0; i <= retries; i++) {
        const d = curlJSON(url);
        if (d) return d;
        if (i < retries) await sleep(300 * (i + 1));
    }
    return null;
}

async function main() {
    console.log('=== Met Paintings Full Scraper ===');

    // Get IDs from both searches
    const onDisplayData = curlJSON('https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&isOnView=true&medium=Paintings&q=painting');
    const highlightData = curlJSON('https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&isHighlight=true&medium=Paintings&q=painting');

    const onDisplayIds = new Set((onDisplayData?.objectIDs || []).map(String));
    const highlightIds = new Set((highlightData?.objectIDs || []).map(String));
    const allIds = Array.from(new Set([...onDisplayIds, ...highlightIds]));

    console.log(`On-display: ${onDisplayIds.size} | Highlight: ${highlightIds.size} | Unique: ${allIds.length}`);

    // Write IDs to file for parallel curl
    fs.writeFileSync('/tmp/met-all-ids.txt', allIds.join('\n'));

    // Use xargs to run parallel curl fetchs (8 at a time)
    console.log('Fetching all object details in parallel...');

    const startTime = Date.now();

    // Create a temp script for xargs
    fs.writeFileSync('/tmp/fetch-met-obj.sh', `#!/bin/bash
ID=$1
curl -s -m 20 -H "User-Agent: Mozilla/5.0" "https://collectionapi.metmuseum.org/public/collection/v1/objects/$ID" > /tmp/met-obj-$ID.json 2>/dev/null
`);
    execSync('chmod +x /tmp/fetch-met-obj.sh');

    // Run in parallel with 8 workers
    try {
        execSync(
            'cat /tmp/met-all-ids.txt | xargs -P 8 -I{} /tmp/fetch-met-obj.sh {}',
            { timeout: 600000, stdio: 'inherit' }
        );
    } catch (e) {
        console.log('xargs completed (some may have failed)');
    }

    console.log(`Fetched in ${((Date.now() - startTime) / 1000).toFixed(0)}s`);

    // Collect results
    const results = [];
    let noImage = 0;
    let noData = 0;

    for (const id of allIds) {
        const path = `/tmp/met-obj-${id}.json`;
        if (!fs.existsSync(path)) { noData++; continue; }
        let d;
        try { d = JSON.parse(fs.readFileSync(path, 'utf8')); }
        catch { noData++; continue; }

        if (!d || !d.objectID) { noData++; continue; }

        const image = d.primaryImageSmall || d.primaryImage || '';
        if (!image) { noImage++; continue; }

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

        // Cleanup temp file
        try { fs.unlinkSync(path); } catch { }
    }

    console.log('\n=== RESULT ===');
    console.log(`Saved: ${results.length} | No image: ${noImage} | No data: ${noData}`);
    console.log(`On-view: ${results.filter(x => x.isOnView).length}`);
    console.log(`Highlight: ${results.filter(x => x.isHighlight).length}`);
    console.log(`Public Domain: ${results.filter(x => x.isPublicDomain).length}`);
    console.log(`With artist: ${results.filter(x => x.artist).length}`);

    fs.writeFileSync('./public/data/met-ny-collection.json', JSON.stringify(results, null, 2));
    console.log('Written → public/data/met-ny-collection.json');
}

main().catch(console.error);
