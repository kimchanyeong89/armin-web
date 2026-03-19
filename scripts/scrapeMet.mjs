import fs from 'fs';

const BASE = 'https://collectionapi.metmuseum.org/public/collection/v1';
const HDRS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Accept': 'application/json',
};

async function getJSON(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url, { headers: HDRS, signal: AbortSignal.timeout(15000) });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (e) {
            if (i < retries - 1) await new Promise(r => setTimeout(r, 300 * (i + 1)));
        }
    }
    return null;
}

async function getIds(params) {
    const qs = new URLSearchParams(params).toString();
    const d = await getJSON(`${BASE}/search?${qs}`);
    return d?.objectIDs || [];
}

async function runBatch(ids, concurrency = 30) {
    const results = [];
    let i = 0;
    while (i < ids.length) {
        const chunk = ids.slice(i, i + concurrency);
        const batch = await Promise.all(chunk.map(id => getJSON(`${BASE}/objects/${id}`)));
        results.push(...batch);
        i += concurrency;
        if (i % 300 === 0 || i >= ids.length) {
            const saved = results.filter(Boolean).filter(d => d.primaryImageSmall || d.primaryImage).length;
            console.log(`  ${Math.min(i, ids.length)}/${ids.length} fetched, ~${saved} with images`);
        }
    }
    return results;
}

async function main() {
    console.log('=== Metropolitan Museum Paintings Scraper (fetch) ===');

    const [onDisplayIds, highlightIds] = await Promise.all([
        getIds({ hasImages: true, isOnView: true, medium: 'Paintings', q: 'painting' }),
        getIds({ hasImages: true, isHighlight: true, medium: 'Paintings', q: 'painting' }),
    ]);
    console.log(`On-display: ${onDisplayIds.length}  Highlight: ${highlightIds.length}`);

    const onDisplaySet = new Set(onDisplayIds.map(String));
    const highlightSet = new Set(highlightIds.map(String));
    const allIds = Array.from(new Set([...onDisplayIds, ...highlightIds]));
    console.log(`Unique IDs: ${allIds.length}`);

    // Test
    const testObj = await getJSON(`${BASE}/objects/${allIds[0]}`);
    console.log(`API test: id=${allIds[0]} title="${testObj?.title}" image=${!!(testObj?.primaryImageSmall || testObj?.primaryImage)}`);
    if (!testObj) { console.error('API test failed! Aborting.'); process.exit(1); }

    console.log('Fetching all objects...');
    const raw = await runBatch(allIds, 30);

    const results = [];
    for (let j = 0; j < allIds.length; j++) {
        const id = String(allIds[j]);
        const d = raw[j];
        if (!d) continue;
        const image = d.primaryImageSmall || d.primaryImage || '';
        if (!image) continue;
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
            isHighlight: highlightSet.has(id),
            isOnView: onDisplaySet.has(id),
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
    }

    console.log('\n=== RESULT ===');
    console.log(`Saved: ${results.length}`);
    console.log(`On-view: ${results.filter(x => x.isOnView).length}`);
    console.log(`Highlight: ${results.filter(x => x.isHighlight).length}`);
    console.log(`Public domain: ${results.filter(x => x.isPublicDomain).length}`);

    fs.writeFileSync('./public/data/met-ny-collection.json', JSON.stringify(results, null, 2));
    console.log('Written → public/data/met-ny-collection.json');
}

main().catch(e => { console.error(e); process.exit(1); });
