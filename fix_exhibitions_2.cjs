const fs = require('fs');

let content = fs.readFileSync('src/data/exhibitions.js', 'utf8');

// For safely adding collectionFile without duplicates
const addCollectionFile = (id, file) => {
    const regex = new RegExp(`(id:\\s*"${id}"[^}]*?)}`, 'g');
    content = content.replace(regex, (match, p1) => {
        if (p1.includes('collectionFile:')) {
            return match; // already has it
        }
        return `${p1}, collectionFile: "${file}" }`;
    });
};

addCollectionFile("lyon-collection", "mba-lyon-collection.json");
addCollectionFile("granet-collection", "musee-granet-collection.json");
addCollectionFile("jacquemart-collection", "jacquemart-andre-collection.json");
addCollectionFile("dpg-1", "dulwich-collection.json");
addCollectionFile("ng-1", "national-gallery-permanent.json");

fs.writeFileSync('src/data/exhibitions.js', content);
