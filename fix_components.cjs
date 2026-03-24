const fs = require('fs');
const content = fs.readFileSync('src/components/ExhibitionModal.tsx', 'utf8');
let modified = content;

// Add mapped properties into the large array
const extraMappings = `
        'egyptian-museum-cairo-collection': '/data/egyptian-museum-cairo-collection.json',
        'fine-arts-be-complete': '/data/fine-arts-be-complete.json',
`;
modified = modified.replace(
    /('mad-collection': '\/data\/mad-paris-collection.json',)/g,
    `$1${extraMappings}`
);

fs.writeFileSync('src/components/ExhibitionModal.tsx', modified);
console.log('Fixed ExhibitionModal mapped properties.');
