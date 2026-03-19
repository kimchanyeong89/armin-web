const fs = require('fs');
const path = require('path');

function merge(official, subsets) {
    const dataPath = path.join(__dirname, '../public/data', official);
    let mainData = { items: [] };
    if (fs.existsSync(dataPath)) {
        try { mainData = JSON.parse(fs.readFileSync(dataPath)); } catch (e) {}
        if (Array.isArray(mainData)) mainData = { items: mainData };
        if (!mainData.items) mainData.items = [];
    }

    const seenUrls = new Set(mainData.items.map(i => i.image || i.id || (i.title+i.artist)));
    let addedCount = 0;

    for (const sub of subsets) {
        const subPath = path.join(__dirname, '../public/data', sub);
        if (!fs.existsSync(subPath)) continue;
        const subData = JSON.parse(fs.readFileSync(subPath));
        let arr = Array.isArray(subData) ? subData : (subData.items || []);
        
        for (const item of arr) {
            const id = item.image || item.id || (item.title+item.artist);
            if (!seenUrls.has(id)) {
                seenUrls.add(id);
                mainData.items.push(item);
                addedCount++;
            }
        }
        fs.unlinkSync(subPath);
        console.log(`Merged and deleted: ${sub}`);
    }
    
    if (addedCount > 0) {
        fs.writeFileSync(dataPath, JSON.stringify(mainData, null, 2));
        console.log(`Updated ${official} with ${addedCount} new items. Total: ${mainData.items.length}`);
    }
}

merge('lacma-classification-22.json', [
    'lacma-drawings-51.json', 'lacma-japanese-prints.json', 'lacma-list-drawings-51.json',
    'lacma-list-japanese-prints.json', 'lacma-list.json', 'lacma-combined-onview.json'
]);
merge('picasso-paris-collection.json', [
    'picasso-drawings-collection.json', 'picasso-paintings-collection.json',
    'picasso-prints-collection.json', 'picasso-sculptures-collection.json'
]);
merge('vam-permanent-exhibitions.json', [
    'vam-paintings.json', 'vam-photographs.json', 'vam-portraits.json', 'vam-posters.json'
]);
