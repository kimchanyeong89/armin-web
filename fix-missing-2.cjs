const fs = require('fs');

let content = fs.readFileSync('src/data/exhibitions.js', 'utf8');

const regexMap = [
    { museumRegex: /(id:\s*"guggenheim-ny"[^]*?permanentExhibitions:\s*\[\s*\{[^]*?)collectionFile:\s*"[^"]*"/, replace: '$1collectionFile: "guggenheim-ny-collection.json"' },
    { museumRegex: /(id:\s*"palais-de-tokyo"[^]*?permanentExhibitions:\s*\[\s*\{[^]*?)"Permanent"\s*\}/, replace: '$1"Permanent", collectionFile: "palais-de-tokyo-collection.json" }' },
    { museumRegex: /(id:\s*"musee-carnavalet"[^]*?permanentExhibitions:\s*\[\s*\{[^]*?)"Permanent"\s*\}/, replace: '$1"Permanent", collectionFile: "carnavalet-collection.json" }' },
    { museumRegex: /(id:\s*"nmec"[^]*?permanentExhibitions:\s*\[\s*\{[^]*?)"Permanent"\s*\}/, replace: '$1"Permanent", collectionFile: "nmec-collection.json" }' },
    { museumRegex: /(id:\s*"egyptian-museum-cairo"[^]*?permanentExhibitions:\s*\[)\s*\]/, replace: '$1\n      { id: "egyptian-museum-cairo-collection", name: "Egyptian Museum Collection", title: "Egyptian Museum Collection", startDate: "Permanent", endDate: "Permanent", collectionFile: "egyptian-museum-cairo-collection.json" }\n    ]' },
    { museumRegex: /(id:\s*"zeitz-mocaa"[^]*?permanentExhibitions:\s*\[\s*\{[^]*?)"Permanent"\s*\}/, replace: '$1"Permanent", collectionFile: "zeitz-mocaa-collection.json" }' },
    { museumRegex: /(id:\s*"national-museum-wales"[^]*?permanentExhibitions:\s*\[\s*\{[^]*?)collectionFile:\s*"[^"]*"/, replace: '$1collectionFile: "museum-wales-art.json"' },
    { museumRegex: /(id:\s*"met-ny"[^]*?permanentExhibitions:\s*\[\s*\{[^]*?)"Permanent"\s*\}/, replace: '$1"Permanent", collectionFile: "met-ny-on-view-paintings.json" }' },
    { museumRegex: /(id:\s*"national-gallery-london"[^]*?permanentExhibitions:\s*\[\s*\{[^]*?)"Permanent"\s*\}/, replace: '$1"Permanent", collectionFile: "national-gallery-exhibitions.json" }' },
];

regexMap.forEach(r => {
    content = content.replace(r.museumRegex, r.replace);
});

// For Tates, just replace tate-xx-collection.json with tate-xx.json if they exist
content = content.replace(/collectionFile:\s*"tate-modern-collection\.json"/g, 'collectionFile: "tate-modern.json"');
content = content.replace(/collectionFile:\s*"tate-britain-artworks\.json"/g, 'collectionFile: "tate-britain.json"');
content = content.replace(/collectionFile:\s*"tate-liverpool-artworks\.json"/g, 'collectionFile: "tate-liverpool.json"');
content = content.replace(/collectionFile:\s*"tate-st-ives-artworks\.json"/g, 'collectionFile: "tate-st-ives.json"');

fs.writeFileSync('src/data/exhibitions.js', content, 'utf8');
