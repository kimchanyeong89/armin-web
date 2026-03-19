const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, '../public/data/ngprague-collection.json');

function patchMedium() {
    if (!fs.existsSync(FILE_PATH)) {
        console.error('File not found:', FILE_PATH);
        return;
    }

    const data = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
    let updatedCount = 0;

    const updatedData = data.map(item => {
        if (item.metadata && item.metadata.technique) {
            // User requested to use 'technique' for medium
            // Current might be 'oil on canvas', we change to 'oil'
            if (item.medium !== item.metadata.technique) {
                item.medium = item.metadata.technique;
                updatedCount++;
            }
        }
        return item;
    });

    fs.writeFileSync(FILE_PATH, JSON.stringify(updatedData, null, 2));
    console.log(`Updated medium to technique for ${updatedCount} items.`);
}

patchMedium();
