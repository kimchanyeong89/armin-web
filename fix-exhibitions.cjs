const fs = require('fs');

let content = fs.readFileSync('src/data/exhibitions.js', 'utf8');

const replacements = [
    { id: "orangerie-collection", file: "orangerie-collection.json" },
    { id: "orsay-collection", file: "orsay-collection.json" },
    { id: "petit-palais-collection", file: "petit-palais-collection.json" },
    { id: "marmottan-collection", file: "marmottan-collection.json" },
    { id: "guggenheim-ny-collection", file: "guggenheim-ny-collection.json" },
    { id: "palais-de-tokyo-collection", file: "palais-de-tokyo-collection.json" },
    { id: "pinault-collection", file: "pinault-collection.json" },
    { id: "carnavalet-collection", file: "carnavalet-collection.json" },
    { id: "egyptian-museum-cairo-collection", file: "egyptian-museum-cairo-collection.json" },
    { id: "nmec-collection", file: "nmec-collection.json" },
    { id: "zeitz-mocaa-collection", file: "zeitz-mocaa-collection.json" }
];

replacements.forEach(rep => {
    const regex = new RegExp(`(id:\\s*"${rep.id}"[^\}]+?startDate:\\s*"Permanent",\\s*endDate:\\s*"Permanent")\\s*\\}`, 'gi');
    content = content.replace(regex, `$1, collectionFile: "${rep.file}" }`);
});

fs.writeFileSync('src/data/exhibitions.js', content, 'utf8');
console.log("Updated exhibitions.js!");