const fs = require('fs');

const FILE = 'public/data/nasjonal-collection.json';

function fixCategories() {
    const data = JSON.parse(fs.readFileSync(FILE));
    console.log(`Loaded ${data.length} items.`);

    const seenIds = new Set();
    const cleanItems = [];

    // Prioritize items with 'Painting' if duplicates exist? No, prioritize better metadata.
    // Actually, just simple dedupe first.

    // Logic for mapping
    const getMetadata = (item) => {
        let rawType = item._raw?.data?.Type || '';
        if (!rawType && item._raw?.media?.type) rawType = item._raw.media.type;

        let cat = 'Artwork';
        let type = '2D';

        // Normalize
        const t = rawType.toLowerCase();

        if (t.includes('drawing') || t.includes('tegning')) {
            cat = 'Drawing';
        } else if (t.includes('photo') || t.includes('foto') || t.includes('daguerreotype')) {
            cat = 'Photography';
        } else if (t.includes('chair') || t.includes('stol') || t.includes('furniture') || t.includes('møbel')) {
            cat = 'Furniture';
            type = '3D';
        } else if (t.includes('painting') || t.includes('maleri')) {
            cat = 'Painting';
        } else if (t.includes('sculpture') || t.includes('skulptur') || t.includes('bust')) {
            cat = 'Sculpture';
            type = '3D';
        } else if (t.includes('textile') || t.includes('tekstil')) {
            cat = 'Textile';
        } else if (t.includes('ceramic') || t.includes('keramikk')) {
            cat = 'Ceramic';
            type = '3D';
        } else if (t.includes('glass')) {
            cat = 'Glass';
            type = '3D';
        }

        // Fallback: preserve existing if valid
        if (cat === 'Artwork' && item.category && item.category !== 'Artwork') {
            // If we manually set it to Drawing/Photo/Chair in previous script, trust it?
            // Actually, the previous script indiscriminately labeled everything as "Drawing" in loop 1.
            // So we CANNOT trust item.category from that run.
            // We MUST rely on _raw.
        }

        return { category: cat, type: type };
    };

    let fixedCount = 0;

    for (const item of data) {
        if (!item.id || seenIds.has(item.id)) continue;
        seenIds.add(item.id);

        const meta = getMetadata(item);

        // Update item
        item.category = meta.category;
        item.type = meta.type;

        // Ensure image is 800px (fix from 1200 or whatever)
        if (item.image && item.image.includes('/full/1200,')) {
            item.image = item.image.replace('/full/1200,', '/full/800,');
        }

        cleanItems.push(item);
        fixedCount++;
    }

    console.log(`Deduplicated to ${cleanItems.length} items.`);

    // Stats
    const stats = {};
    cleanItems.forEach(i => { stats[i.category] = (stats[i.category] || 0) + 1; });
    console.log('Category Distribution:', stats);

    fs.writeFileSync(FILE, JSON.stringify(cleanItems, null, 2));
    console.log('Saved updated file.');
}

fixCategories();
