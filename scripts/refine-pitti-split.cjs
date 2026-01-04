const fs = require('fs');

// Load current uffizi-gallery-collection.json
const uffizi = JSON.parse(fs.readFileSync('public/data/uffizi-gallery-collection.json', 'utf8'));
console.log('Current Uffizi Gallery:', uffizi.objects.length, 'artworks');

// Pitti Palace location patterns
const PITTI_PATTERNS = [
    'pitti', 'palatine', 'saturn room', 'jupiter room', 'mars room', 'apollo room',
    'venus room', 'prometheus room', 'ulysses room', 'iliad room', 'hercules room',
    'bona room', 'royal apartment', 'king', 'queen', 'throne room', 'boboli',
    'limonaia', 'cavaliere', 'stove room', 'allegories room', 'castagnoli',
    'costume gallery', 'porcelain museum', 'silver museum', 'modern art',
    'education of jupiter', 'room of saturn', 'room of jupiter', 'room of mars',
    'room of apollo', 'room of venus', 'room of prometheus', 'room of ulysses',
    'room of iliad', 'room of hercules', 'lemon house', 'giardino', 'garden',
    'chapel', 'blue room', 'green room', 'red salon', 'oval room', 'round room',
    'parrot', 'niches', 'flora room', 'pocetti', 'volterrano', 'putti'
];

// Check each artwork
const pittiFound = [];
const uffiziRemaining = [];

uffizi.objects.forEach(obj => {
    const location = (obj.location || '').toLowerCase();
    const title = (obj.title || '').toLowerCase();
    const description = (obj.description || '').toLowerCase();

    let isPitti = false;

    // Check location
    for (const pattern of PITTI_PATTERNS) {
        if (location.includes(pattern)) {
            isPitti = true;
            obj._matchReason = 'location: ' + pattern;
            break;
        }
    }

    // Check title for Pitti rooms
    if (!isPitti) {
        for (const pattern of PITTI_PATTERNS) {
            if (title.includes(pattern)) {
                isPitti = true;
                obj._matchReason = 'title: ' + pattern;
                break;
            }
        }
    }

    // Check description for Pitti/Palatine mentions
    if (!isPitti) {
        if (description.includes('pitti palace') || description.includes('palatine gallery') ||
            description.includes('pitti') && description.includes('palace')) {
            isPitti = true;
            obj._matchReason = 'description mentions Pitti';
        }
    }

    if (isPitti) {
        pittiFound.push(obj);
    } else {
        uffiziRemaining.push(obj);
    }
});

console.log('Additional Pitti found:', pittiFound.length);
console.log('Uffizi remaining:', uffiziRemaining.length);

if (pittiFound.length > 0) {
    console.log('\nAdditional Pitti artworks found:');
    pittiFound.slice(0, 20).forEach(obj => {
        console.log('  -', obj.title, '|', obj.location, '|', obj._matchReason);
    });
}

// Load existing Pitti and merge
const pitti = JSON.parse(fs.readFileSync('public/data/pitti-palace-collection.json', 'utf8'));
console.log('\nExisting Pitti:', pitti.objects.length);

// Add newly found Pitti artworks
const existingSlugs = new Set(pitti.objects.map(o => o.slug || o.id));
let addedCount = 0;
pittiFound.forEach(obj => {
    const slug = obj.slug || obj.id;
    if (!existingSlugs.has(slug)) {
        pitti.objects.push(obj);
        existingSlugs.add(slug);
        addedCount++;
    }
});

console.log('Added to Pitti:', addedCount);
console.log('New Pitti total:', pitti.objects.length);

// Save updated files
pitti.totalArtworks = pitti.objects.length;
fs.writeFileSync('public/data/pitti-palace-collection.json', JSON.stringify(pitti, null, 2));

const uffiziOut = {
    museum: 'Uffizi Gallery',
    museumId: 'uffizi-gallery',
    location: 'Florence, Italy',
    type: 'permanent',
    totalArtworks: uffiziRemaining.length,
    objects: uffiziRemaining.map(o => { delete o._matchReason; return o; })
};
fs.writeFileSync('public/data/uffizi-gallery-collection.json', JSON.stringify(uffiziOut, null, 2));

console.log('\n✅ Updated files:');
console.log('  - Pitti Palace:', pitti.objects.length, 'artworks');
console.log('  - Uffizi Gallery:', uffiziRemaining.length, 'artworks');
