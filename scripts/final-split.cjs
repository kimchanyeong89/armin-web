const fs = require('fs');

const orig = JSON.parse(fs.readFileSync('public/data/uffizi-collection.json', 'utf8'));
const pitti = JSON.parse(fs.readFileSync('public/data/pitti-palace-collection.json', 'utf8'));

const pittiSlugs = new Set(pitti.objects.map(o => o.slug || (o.sourceUrl ? o.sourceUrl.split('/').pop() : o.id)));

const uffiziOnly = orig.objects.filter(o => {
    const slug = o.slug || (o.sourceUrl ? o.sourceUrl.split('/').pop() : o.id);
    return !pittiSlugs.has(slug);
});

fs.writeFileSync('public/data/uffizi-gallery-collection.json', JSON.stringify({
    museum: 'Uffizi Gallery',
    museumId: 'uffizi-gallery',
    location: 'Florence, Italy',
    type: 'permanent',
    totalArtworks: uffiziOnly.length,
    objects: uffiziOnly
}, null, 2));

console.log('Original:', orig.objects.length);
console.log('Pitti:', pitti.objects.length);
console.log('Uffizi:', uffiziOnly.length);
