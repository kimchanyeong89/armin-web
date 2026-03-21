const fs = require('fs');
async function run() {
    const { exhibitions } = await import('./src/data/exhibitions.js');
    const mapped = new Set();
    exhibitions.forEach(m => {
        (m.permanentExhibitions || []).forEach(e => e.collectionFile && mapped.add(e.collectionFile));
        (m.temporaryExhibitions || []).forEach(e => e.collectionFile && mapped.add(e.collectionFile));
        (m.pastExhibitions || []).forEach(e => e.collectionFile && mapped.add(e.collectionFile));
    });
    
    const filesWithSoutine = [
'aic-collection.json', 'albertina-permanent-collection.json', 'basel-collection.json',
'bordeaux-collection.json', 'cma-collection.json', 'courtauld-gallery-collection.json',
'dia-collection.json', 'famsf-collections.json', 'high-collection.json', 'kunsthaus-collection.json',
'lacma-classification-22.json', 'mah-collection.json', 'mam-collection.json', 'masp-collection.json',
'moma-collection.json', 'musee-grenoble-paintings-collection.json', 'nmwa-collection.json',
'orangerie-collection.json', 'philadelphia-collection.json', 'pompidou-painting-collection.json',
'qagoma-collection.json', 'smb-neue-nationalgalerie-collection.json', 'smk-collection.json',
'stedelijk-collection.json'
    ];
    for (const f of filesWithSoutine) {
        if (!mapped.has(f)) {
            console.log('NOT MAPPED IN EXHIBITIONS:', f);
        }
    }
}
run();
