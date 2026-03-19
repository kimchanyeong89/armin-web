const fs = require('fs');
const FILES = ['smb-bode-museum-collection.json', 'hamburger-kunsthalle-paintings.json', 'hamburger-kunsthalle-drawings.json', 'hamburger-kunsthalle-video.json', 'pinakothek-moderne-collection.json'];
const dataDir = './public/data';
for (let f of FILES) {
    if(!fs.existsSync(`${dataDir}/${f}`)) continue;
    let data = JSON.parse(fs.readFileSync(`${dataDir}/${f}`));
    let items = Array.isArray(data) ? data : (data.objects || data.items || data.artworks || []);
    let total = items.length, r2 = 0, source = 0, none = 0;
    for(let i of items) {
       let img = i.image || i.imageUrl || i.thumb || i.imageURL || i.thumbnail;
       if (!img) none++;
       else if(img.includes('armin-r2') || img.includes('.r2.dev')) r2++;
       else source++;
    }
    console.log(`\n--- ${f} ---`);
    console.log(`Total: ${total} | R2: ${r2} (${(r2/total*100).toFixed(1)}%) | Source: ${source} | None: ${none}`);
}
