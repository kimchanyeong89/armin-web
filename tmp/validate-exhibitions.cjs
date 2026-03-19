const fs = require('fs');
const path = require('path');
const { exhibitions } = require('/Users/kietzsche/armin-web-main/src/data/exhibitions.js');

const dataDir = '/Users/kietzsche/armin-web-main/public/data';
const allFiles = fs.readdirSync(dataDir);
const missingFiles = [];
const emptyFiles = [];

for (const ex of exhibitions) {
    for (const perm of (ex.permanentExhibitions || [])) {
        if (perm.collectionFile) {
            const filePath = path.join(dataDir, perm.collectionFile);
            if (!fs.existsSync(filePath)) {
                missingFiles.push({ museum: ex.name, file: perm.collectionFile });
            } else {
                try {
                    const content = fs.readFileSync(filePath, 'utf8');
                    const data = JSON.parse(content);
                    const items = Array.isArray(data) ? data : (data.items || data.objects || data.artworks || []);
                    if (items.length === 0) {
                        emptyFiles.push({ museum: ex.name, file: perm.collectionFile });
                    }
                } catch (e) {
                    emptyFiles.push({ museum: ex.name, file: perm.collectionFile });
                }
            }
        }
    }
}

console.log('Missing collection files:');
console.log(missingFiles);
console.log('\nEmpty or invalid collection files:');
console.log(emptyFiles);
