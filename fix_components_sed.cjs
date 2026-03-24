const fs = require('fs');
let content = fs.readFileSync('src/components/ExhibitionModal.tsx', 'utf8');

// Undo all the messed up repeated insertions of cairo and mad-collection stuff to keep it clean.
content = content.replace(/('egyptian-museum-cairo-collection': '\/data\/egyptian-museum-cairo-collection\.json',)/g, '');
content = content.replace(/('fine-arts-be-complete': '\/data\/fine-arts-be-complete\.json',)/g, '');

const extraMappings = `
        'egyptian-museum-cairo-collection': '/data/egyptian-museum-cairo-collection.json',
        'fine-arts-be-complete': '/data/fine-arts-be-complete.json',
`;
content = content.replace(
    /('mad-collection': '\/data\/mad-paris-collection.json',)/g,
    `$1${extraMappings}`
);

fs.writeFileSync('src/components/ExhibitionModal.tsx', content);
console.log('Fixed duplications.');
