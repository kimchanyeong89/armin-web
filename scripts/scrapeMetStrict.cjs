#!/usr/bin/env node
const fs = require('fs');

async function fetchWithRetry(url, retries = 3) {
    for (let i = 0; i <= retries; i++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            const res = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (!res.ok) {
                if (res.status === 404) return null; // Doesn't exist
                throw new Error(`Status ${res.status}`);
            }
            const data = await res.json();
            if (data && data.objectID) return data;
        } catch (e) {
            if (i === retries) return null;
            await new Promise(r => setTimeout(r, 500 * (i + 1))); // Exponential backoff
        }
    }
    return null;
}

async function main() {
    console.log('=== Met Paintings - Strict Scraper (Node Fetch) ===');

    let onDisplayData, highlightData;
    try {
        const res1 = await fetch('https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&isOnView=true&medium=Paintings&q=painting');
        onDisplayData = await res1.json();
        const res2 = await fetch('https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&isHighlight=true&medium=Paintings&q=painting');
        highlightData = await res2.json();
    } catch (e) {
        console.error('Failed to get initial search lists', e);
        process.exit(1);
    }

    const onDisplayIds = new Set((onDisplayData?.objectIDs || []).map(String));
    const highlightIds = new Set((highlightData?.objectIDs || []).map(String));
    const allIds = Array.from(new Set([...onDisplayIds, ...highlightIds]));

    console.log(`Total IDs to fetch: ${allIds.length}`);

    const results = [];
    let noImage = 0;
    let notPainting = 0;

    const concurrency = 20;

    for (let i = 0; i < allIds.length; i += concurrency) {
        const batchIds = allIds.slice(i, i + concurrency);
        const batchPromises = batchIds.map(async (id) => {
            const d = await fetchWithRetry(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`);
            if (!d) return null;

            const image = d.primaryImageSmall || d.primaryImage || '';
            if (!image) return { error: 'noImage' };

            // Strict filter for true paintings
            const isPainting =
                (d.classification && d.classification.toLowerCase().includes('painting')) ||
                (d.objectName && d.objectName.toLowerCase().includes('painting')) ||
                (d.medium && d.medium.toLowerCase().includes('canvas')) ||
                (d.medium && d.medium.toLowerCase().includes('oil '));

            if (!isPainting) {
                return { error: 'notPainting' };
            }

            return {
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
            };
        });

        const batchResults = await Promise.all(batchPromises);

        for (const res of batchResults) {
            if (!res) continue;
            if (res.error === 'noImage') noImage++;
            else if (res.error === 'notPainting') notPainting++;
            else results.push(res);
        }

        process.stdout.write(`\rProgress: ${Math.min(i + concurrency, allIds.length)}/${allIds.length} | Saved: ${results.length} | NotPainting: ${notPainting} `);
    }

    console.log('\n=== COMPLETE ===');
    console.log(`Final count: ${results.length} valid paintings`);
    fs.writeFileSync('./public/data/met-ny-collection.json', JSON.stringify(results, null, 2));
    console.log('Saved to ./public/data/met-ny-collection.json');
}

main().catch(console.error);
