const fs = require('fs');
const files = [
    'albertina-paintings-100.json',
    'albertina-sculptures-100.json',
    'albertina-objects-installations-media-art-100.json',
    'albertina-paintings-sculpture-100.json',
    'albertina-drawings-prints-100.json',
    'albertina-permanent-collection.json',
    'albertina-photography-100.json',
    'albertina-poster-100.json'
];

files.forEach(f => {
    let p = './public/data/' + f;
    if (!fs.existsSync(p)) return;
    let raw = fs.readFileSync(p, 'utf8');
    let data = JSON.parse(raw);
    let items = data.objects || data.artworks || data;
    if (!Array.isArray(items)) items = data.items || data.data;
    if (!Array.isArray(items)) return;

    let modified = 0;
    items.forEach(item => {
        let url = item.imageUrl || item.image || item.image_url;
        if (url && typeof url === 'string' && url.includes('sammlungenonline.albertina.at') && !url.includes('wsrv.nl')) {
            if (item.imageUrl) item.imageUrl = 'https://wsrv.nl/?url=' + encodeURIComponent(item.imageUrl);
            if (item.image) item.image = 'https://wsrv.nl/?url=' + encodeURIComponent(item.image);
            if (item.image_url) item.image_url = 'https://wsrv.nl/?url=' + encodeURIComponent(item.image_url);
            modified++;
        }
    });

    if (modified > 0) {
        fs.writeFileSync(p, JSON.stringify(data, null, 2));
        console.log(`Fixed ${modified} items in ${f}`);
    } else {
        console.log(`No fixes needed for ${f}`);
    }
});