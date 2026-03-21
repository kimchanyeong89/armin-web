const fs = require('fs');

let content = fs.readFileSync('src/data/exhibitions.js', 'utf8');

const regexMap = [
    { museumRegex: /(id:\s*"met-ny"[^]*?permanentExhibitions:\s*\[\s*\{[^]*?)"Permanent"\s*\}/, replace: '$1"Permanent", collectionFile: "met-ny-on-view-paintings.json" }' },
    { museumRegex: /(id:\s*"national-gallery-london"[^]*?permanentExhibitions:\s*\[\s*\{[^]*?)"Permanent"\s*\}/, replace: '$1"Permanent", collectionFile: "national-gallery-exhibitions.json" }' },
];

regexMap.forEach(r => {
    content = content.replace(r.museumRegex, r.replace);
});

fs.writeFileSync('src/data/exhibitions.js', content, 'utf8');

