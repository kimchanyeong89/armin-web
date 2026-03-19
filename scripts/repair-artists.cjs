const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../public/data/artists-dates.json');

try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    let fixedCount = 0;
    let removedCount = 0;

    const newData = {};

    Object.entries(data).forEach(([key, val]) => {
        if (!val) {
            removedCount++;
            return;
        }

        if (!val.name) {
            // Repair using key
            if (key && key.trim().length > 0) {
                val.name = key;
                fixedCount++;
            } else {
                removedCount++;
                return;
            }
        }
        newData[key] = val;
    });

    console.log(`Fixed ${fixedCount} entries (missing name).`);
    console.log(`Removed ${removedCount} bad entries.`);

    fs.writeFileSync(filePath, JSON.stringify(newData, null, 2));
    console.log("Saved fixed file.");

} catch (e) {
    console.error(e);
}
