const fs = require('fs');
const path = require('path');
const { exhibitions } = require('../src/data/exhibitions.js');

const DATA_DIR = path.join(__dirname, '../public/data');
const report = [];

let totalItemsOverall = 0;
let totalR2Overall = 0;
const untouchedFiles = [];

for (const ex of exhibitions) {
    const filesInExh = new Set();
    for (const key of ['permanentExhibitions', 'temporaryExhibitions', 'pastExhibitions']) {
        if (!ex[key]) continue;
        for (const show of ex[key]) {
            const filename = show.collectionFile || `${show.id}.json`;
            const filePath = path.join(DATA_DIR, filename);
            if (fs.existsSync(filePath)) {
                filesInExh.add(filename);
            }
        }
    }

    if (filesInExh.size === 0) continue;

    for (const filename of filesInExh) {
        // Skip the ones currently running manually in Australia process
        if (['agnsw-collection.json', 'mca-collection.json', 'ngv-collection.json', 'qagoma-collection.json'].includes(filename)) continue;

        const filePath = path.join(DATA_DIR, filename);
        let itemsCount = 0;
        let r2Count = 0;

        try {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            let dataArr = [];
            if (Array.isArray(data)) dataArr = data;
            else if (data.items) dataArr = data.items;
            else if (data.objects) dataArr = data.objects;
            else if (data.artworks) dataArr = data.artworks;
            else if (data.rooms) dataArr = data.rooms.flatMap(room => room.artworks || room.items || []);

            itemsCount = dataArr.length;

            const hasR2 = (obj) => {
                if (!obj) return false;
                if (typeof obj === 'string' && (obj.includes('r2.dev') || obj.includes('r2.cloudflarestorage'))) return true;
                return false;
            };

            for (const item of dataArr) {
                let isR2 = hasR2(item.image) || hasR2(item.imageUrl) || hasR2(item.thumbnail) || hasR2(item.representativeImage);
                if (!isR2 && item.primaryImage && typeof item.primaryImage === 'object') {
                    isR2 = hasR2(item.primaryImage.iiifFull) || hasR2(item.primaryImage.iiifThumbUrl);
                }
                if (!isR2 && item.images && Array.isArray(item.images) && item.images.length > 0) {
                    let checkImg = item.images[0];
                    isR2 = hasR2(checkImg.url) || hasR2(checkImg.iiifurl) || hasR2(checkImg.iiifthumburl) || hasR2(checkImg.image);
                }
                if (isR2) r2Count++;
            }

        } catch (e) { }

        // Condition for untouched
        if (itemsCount > 0 && r2Count === 0) {
            untouchedFiles.push(filename);
        }
    }
}

const outFile = path.join(__dirname, '../public/data/v3-untouched-targets.json');
fs.writeFileSync(outFile, JSON.stringify(untouchedFiles, null, 2));

console.log(`Found ${untouchedFiles.length} untouched files.`);
