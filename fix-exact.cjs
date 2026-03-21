const fs = require('fs');

const mappings = [
    {
        regex: /(id:\s*"orangerie-collection"[^]*?endDate:\s*"Permanent")\s*\}/,
        repl: '$1, collectionFile: "orangerie-collection.json" }'
    },
    {
        regex: /(id:\s*"guggenheim-ny-collection"[^]*?endDate:\s*"Permanent")\s*\}/,
        repl: '$1, collectionFile: "guggenheim-ny-collection.json" }'
    },
    {
        regex: /(id:\s*"met-ny-on-view-paintings"[^]*?endDate:\s*"Permanent")\s*\}/,
        repl: '$1, collectionFile: "met-ny-on-view-paintings.json" }'
    },
    {
        regex: /(id:\s*"tate-modern-collection"[^]*?endDate:\s*"Permanent")\s*\}/,
        repl: '$1, collectionFile: "tate-modern.json" }'
    },
    {
        regex: /(id:\s*"tate-britain-collection"[^]*?endDate:\s*"Permanent")\s*\}/,
        repl: '$1, collectionFile: "tate-britain.json" }'
    },
    {
        regex: /(id:\s*"tate-liverpool-collection"[^]*?endDate:\s*"Permanent")\s*\}/,
        repl: '$1, collectionFile: "tate-liverpool.json" }'
    },
    {
        regex: /(id:\s*"national-museum-wales-art"[^]*?endDate:\s*"Permanent")\s*\}/,
        repl: '$1, collectionFile: "museum-wales-art.json" }'
    },
    {
        regex: /(id:\s*"musee-carnavalet-collection"[^]*?endDate:\s*"Permanent")\s*\}/,
        repl: '$1, collectionFile: "carnavalet-collection.json" }'
    },
    {
        regex: /(id:\s*"nmec-collection"[^]*?endDate:\s*"Permanent")\s*\}/,
        repl: '$1, collectionFile: "nmec-collection.json" }'
    },
    {
        regex: /(id:\s*"zeitz-mocaa-collection"[^]*?endDate:\s*"Permanent")\s*\}/,
        repl: '$1, collectionFile: "zeitz-mocaa-collection.json" }'
    },
    {
        regex: /(id:\s*"national-gallery-london-collection"[^]*?endDate:\s*"Permanent")\s*\}/,        
        repl: '$1, collectionFile: "national-gallery-exhibitions.json" }'
    },
    {
        regex: /(id:\s*"serpentine-gallery-collection"[^]*?endDate:\s*"Permanent")\s*\}/,
        repl: '$1, collectionFile: "serpentine-gallery-collection.json" }'
    },
    {
        regex: /(id:\s*"palais-de-tokyo-collection"[^]*?endDate:\s*"Permanent")\s*\}/,
        repl: '$1, collectionFile: "palais-de-tokyo-collection.json" }'
    }
];

let text = fs.readFileSync('src/data/exhibitions.js', 'utf8');

for (const m of mappings) {
    if (m.regex.test(text)) {
        text = text.replace(m.regex, m.repl);
        console.log("Matched and replaced:", m.regex);
    } else {
        console.log("Failed to match:", m.regex);
    }
}

// Special case for Egyptian Museum Cairo, which might just need an entry
if (!text.includes('egyptian-museum-cairo-collection.json')) {
    text = text.replace(/(id:\s*"egyptian-museum-cairo"[^]*?permanentExhibitions:\s*\[)\s*\]/, '$1\n      { id: "egyptian-museum-cairo-collection", name: "Permanent Collection", title: "Permanent Collection", startDate: "Permanent", endDate: "Permanent", collectionFile: "egyptian-museum-cairo-collection.json" }\n    ]');
}

// Ensure uffizi points to the real file, not gallery-collection
if (text.includes('"uffizi-gallery-collection.json"')) {
    text = text.replace(/"uffizi-gallery-collection\.json"/g, '"uffizi-collection.json"');
}

fs.writeFileSync('src/data/exhibitions.js', text, 'utf8');

// Now let's blindly add EVERYTHING that is still missing into an `INJECTED MISSING FILES` array directly to `export const exhibitions = [` array.
