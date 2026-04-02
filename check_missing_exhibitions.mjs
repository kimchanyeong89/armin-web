import fs from 'fs';
import path from 'path';

async function run() {
    const { exhibitions } = await import('./src/data/exhibitions.js');
    const searchIndex = JSON.parse(fs.readFileSync('public/data/search-index.json', 'utf8'));
    const embeddedExhibitions = new Set(searchIndex.a.map(art => art.e));

    const missing = [];
    const expectedExhibits = new Set();
    const allExhs = [];

    for (const m of exhibitions) {
        if (m.permanentExhibitions) allExhs.push(...m.permanentExhibitions);
        if (m.temporaryExhibitions) allExhs.push(...m.temporaryExhibitions);
        if (m.pastExhibitions) allExhs.push(...m.pastExhibitions);
    }

    for (const exh of allExhs) {
        if (exh.collectionFile) {
            expectedExhibits.add(exh.id);
            if (!embeddedExhibitions.has(exh.id)) {
                missing.push({ id: exh.id, file: exh.collectionFile, name: exh.name || exh.title });
            }
        }
    }

    console.log(`Missing exhibitions out of ${expectedExhibits.size}:`);
    console.log(JSON.stringify(missing, null, 2));

    // Also check for total items inside those missed JSON files
    for (const miss of missing) {
        const p = path.join('public/data', miss.file);
        if (fs.existsSync(p)) {
            try {
                const data = JSON.parse(fs.readFileSync(p, 'utf8'));
                let count = 0;
                if (Array.isArray(data)) count = data.length;
                else if (data.items) count = data.items.length;
                else if (data.objects) count = data.objects.length;
                else if (data.artworks) count = data.artworks.length;
                else count = Object.keys(data).length;
                console.log(`File ${miss.file} has ${count} items inside it.`);
                if (count > 0) {
                    const sample = Array.isArray(data) ? data[0] : (data.items || data.objects || data.artworks)[0];
                    console.log(`Sample item from ${miss.file}:`, Object.keys(sample));
                    console.log(`Sample image keys from ${miss.file}:`, sample.image, sample.primaryImage, sample.images, sample.thumb);
                }
            } catch (e) {
                console.log(`Failed to parse ${miss.file}`);
            }
        } else {
            console.log(`File ${miss.file} is missing on disk.`);
        }
    }
}
run();
