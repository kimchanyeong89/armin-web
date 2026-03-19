import fs from 'fs';

async function fetchObjects(url) {
    let retries = 3;
    while (retries--) {
        try {
            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json'
                }
            });
            if (!res.ok) {
                console.error('Bad status from search API:', res.status, url);
                return [];
            }
            const data = await res.json();
            return data.objectIDs || [];
        } catch (e) {
            await new Promise(r => setTimeout(r, 1000));
        }
    }
    return [];
}

async function fetchObjectDetails(id) {
    let retries = 5;
    while (retries--) {
        try {
            const res = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json'
                }
            });
            if (res.status === 404) return null;
            if (!res.ok) throw new Error(`Status ${res.status}`);
            return await res.json();
        } catch (e) {
            await new Promise(r => setTimeout(r, 500 + Math.random() * 1000));
        }
    }
    return null;
}

async function run() {
    console.log('Fetching Met Data...');
    // using the parameters derived from user links
    const onDList = await fetchObjects('https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&isOnView=true&q=Paintings');
    const hiList = await fetchObjects('https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&isHighlight=true&q=Paintings');

    const finalIds = [...new Set([...onDList, ...hiList])];
    console.log(`Total unique items: ${finalIds.length}`);

    // Fallback if the API blocked us: process local files
    if (finalIds.length === 0) {
        console.log("API blocked. Merging local files met-ny-on-view-paintings.json and met-ny-collection.json...");
        const d1 = JSON.parse(fs.readFileSync('./public/data/met-ny-on-view-paintings.json', 'utf8'));
        const d2 = JSON.parse(fs.readFileSync('./public/data/met-ny-collection.json', 'utf8'));

        const merged = new Map();
        [...d1, ...d2].forEach(item => {
            if (!item.primaryImage && !item.primaryImageSmall && !item.imageUrl && !item.image) return;
            const id = (item.id || item.objectID || item.objectId).toString();
            const existing = merged.get(id);

            const image = item.image || item.primaryImageSmall || item.primaryImage || item.imageUrl;
            const isHighlight = item.isHighlight === true || (existing && existing.isHighlight);
            let isOnView = item.isOnView;
            if (isOnView === undefined) isOnView = !!item.gallery || (item.repository && item.repository.includes('Gallery'));
            const isPublicDomain = item.isPublicDomain !== undefined ? item.isPublicDomain : (existing ? existing.isPublicDomain : false);

            merged.set(id, {
                ...existing,
                ...item,
                id,
                image,
                isHighlight,
                isOnView,
                isPublicDomain
            });
        });

        const finalArr = Array.from(merged.values());
        console.log(`Writing ${finalArr.length} local merged items`);
        fs.writeFileSync('./public/data/met-ny-collection.json', JSON.stringify(finalArr, null, 2));
        return;
    }

    const results = [];
    const BATCH_SIZE = 25;

    for (let i = 0; i < finalIds.length; i += BATCH_SIZE) {
        const batch = finalIds.slice(i, i + BATCH_SIZE);
        console.log(`Fetching batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(finalIds.length / BATCH_SIZE)}`);

        try {
            const batchResults = await Promise.all(batch.map(id => fetchObjectDetails(id)));
            await new Promise(r => setTimeout(r, 400));

            for (const item of batchResults) {
                if (!item) continue;

                if (item.objectName !== 'Painting' && !item.medium?.toLowerCase().includes('painting') && !item.classification?.toLowerCase().includes('painting')) {
                    if (!item.title) continue;
                }

                results.push({
                    id: item.objectID.toString(),
                    title: item.title,
                    artist: item.artistDisplayName,
                    date: item.objectDate,
                    image: item.primaryImageSmall || item.primaryImage,
                    medium: item.medium,
                    dimension: item.dimensions,
                    url: item.objectURL,
                    isPublicDomain: item.isPublicDomain,
                    isHighlight: item.isHighlight,
                    isOnView: item.repository && item.repository.includes('Gallery') ? true : !!item.GalleryNumber,
                    galleryNumber: item.GalleryNumber,
                    repository: item.repository,
                    objectName: item.objectName,
                    classification: item.classification,
                    department: item.department
                });
            }
        } catch (e) { }
    }

    const filtered = results.filter(r => r.image);
    console.log(`Writing ${filtered.length} valid results to met-ny-collection.json`);
    fs.writeFileSync('./public/data/met-ny-collection.json', JSON.stringify(filtered, null, 2));
}

run();
