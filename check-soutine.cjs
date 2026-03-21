const fs = require('fs');

(async () => {
    const { exhibitions } = await import('./src/data/exhibitions.js');
    const validFilesSet = new Set();
    exhibitions.forEach(m => {
        (m.permanentExhibitions || []).forEach(e => e.collectionFile && validFilesSet.add(e.collectionFile));
        (m.temporaryExhibitions || []).forEach(e => e.collectionFile && validFilesSet.add(e.collectionFile));
        (m.pastExhibitions || []).forEach(e => e.collectionFile && validFilesSet.add(e.collectionFile));
    });

    const checkFiles = [
        "carnavalet-collection.json",
        "egyptian-museum-cairo-collection.json",
        "guggenheim-ny-collection.json",
        "marmottan-collection.json",
        "met-ny-on-view-paintings.json",
        "met-ny-on-view-paintings-enriched.json",
        "museum-wales-art.json",
        "national-gallery-exhibitions.json",
        "nmec-collection.json",
        "orangerie-collection.json",
        "orsay-collection.json",
        "palais-de-tokyo-collection.json",
        "petit-palais-collection.json",
        "pinault-collection.json",
        "serpentine-gallery-collection.json",
        "si-nasm.json",
        "tate-britain.json",
        "tate-liverpool.json",
        "tate-modern.json",
        "tate-st-ives.json",
        "uffizi-collection.json",
        "zeitz-mocaa-collection.json"
    ];

    let missing = [];
    checkFiles.forEach(f => {
        if(!validFilesSet.has(f)) {
            missing.push(f);
        }
    });

    console.log("These are NOT included in exhibitions.js but were PREVIOUSLY being indexed before my change:");
    console.log(missing);
})();