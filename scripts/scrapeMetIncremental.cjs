#!/usr/bin/env node
const fs = require('fs');

const DATA_FILE = './public/data/met-ny-collection.json';
let existingData = [];

// Try to load existing data
try {
    if (fs.existsSync(DATA_FILE)) {
        existingData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        if (!Array.isArray(existingData)) existingData = [];
    }
} catch (e) {
    console.error('Error reading existing data:', e);
}

const existingIds = new Set(existingData.map(item => String(item.id)));
console.log(`Loaded ${existingData.length} existing valid items.`);

async function fetchWithRetry(url, retries = 3) {
    for (let i = 0; i <= retries; i++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 12000);
            const res = await fetch(url, {
                headers: { 'User-Agent': `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (MyBot/${Math.random().toString().slice(2, 6)})` },
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!res.ok) {
                if (res.status === 404) return { error: 'not_found' }; // API explicitly returns 404 for missing
                // 403 or 429 could be rate limit
                throw new Error(`HTTP Error: ${res.status}`);
            }

            const text = await res.text();
            if (text.startsWith('<')) throw new Error(`API returned HTML instead of JSON`);

            const data = JSON.parse(text);
            if (data && data.objectID) return data;
        } catch (e) {
            if (i === retries) return { error: 'failed', message: e.message };
            await new Promise(r => setTimeout(r, 1500 * (i + 1) + Math.random() * 500)); // Exponential backoff
        }
    }
    return { error: 'failed' };
}

async function main() {
    console.log('=== Met Paintings - Resumable Smart Scraper ===');

    let onDisplayData, highlightData;
    try {
        console.log('Fetching master ID lists...');
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

    const missingIds = allIds.filter(id => !existingIds.has(id));

    console.log(`Total target IDs: ${allIds.length}`);
    console.log(`Already scraped: ${existingData.length} (including some that might be invalid now)`);
    console.log(`Need to fetch: ${missingIds.length}`);

    if (missingIds.length === 0) {
        console.log('All IDs have been processed. Exiting.');
        return;
    }

    let saved = 0;
    let noImage = 0;
    let notPainting = 0;
    let failed = 0;
    let notFound = 0;

    const concurrency = 2; // Reduced concurrency to avoid 403 rate limits

    // Shuffle missing IDs to spread load across different endpoints if Met checks sequential IDs
    missingIds.sort(() => 0.5 - Math.random());

    for (let i = 0; i < missingIds.length; i += concurrency) {
        const batchIds = missingIds.slice(i, i + concurrency);

        const batchPromises = batchIds.map(async (id) => {
            const d = await fetchWithRetry(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`);

            if (d && d.error) return d;
            if (!d) return { error: 'failed' };

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

        let shouldSave = false;
        let lastError = '';
        for (const res of batchResults) {
            if (!res) continue;
            if (res.error === 'noImage') noImage++;
            else if (res.error === 'notPainting') notPainting++;
            else if (res.error === 'not_found') notFound++;
            else if (res.error === 'failed') { failed++; lastError = res.message || 'unknown'; }
            else {
                existingData.push(res);
                saved++;
                shouldSave = true;
            }
        }

        // Save progress if there were new additions
        if (shouldSave) {
            fs.writeFileSync(DATA_FILE, JSON.stringify(existingData, null, 2));
        }

        process.stdout.write(`\r[${Math.min(i + concurrency, missingIds.length)}/${missingIds.length}] Saved:${saved} DB:${existingData.length} | notPaint:${notPainting} noImg:${noImage} notFound:${notFound} fail:${failed} (err:${lastError.slice(0, 10)}) `);

        // Moderate delay
        await new Promise(resolve => setTimeout(resolve, 800));
    }

    console.log('\n=== COMPLETE ===');
    console.log(`Final Database count: ${existingData.length} valid paintings`);
    fs.writeFileSync(DATA_FILE, JSON.stringify(existingData, null, 2));
    console.log(`Saved successfully to ${DATA_FILE}`);
}

main().catch(console.error);
