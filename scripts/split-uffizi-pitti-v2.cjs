// Split Uffizi collection into Uffizi Gallery and Pitti Palace by TITLE matching
// Uses the scraped Pitti Palace artwork titles from the website

const fs = require('fs');
const path = require('path');

// Read the original uffizi collection
const uffiziPath = path.join(__dirname, '../public/data/uffizi-collection.json');
const uffiziData = JSON.parse(fs.readFileSync(uffiziPath, 'utf8'));

// Pitti Palace artwork titles scraped from https://www.uffizi.it/en/pitti-palace/artworks
// These are the 429 artworks listed on the Pitti Palace page
const PITTI_TITLES = [
    "Woman with a Veil",
    "Madonna and Child with St. John (known as Madonna of the Chair)",
    "Madonna and Child with St. John (The Madonna of the Drapes)",
    "Woman's gown",
    "Judith with the Head of Holofernes",
    "Tunica Delphos",
    "Abito charleston",
    "Chanel",
    "The Beheading of St John the Baptist",
    "Woman's slipper",
    "White Hall (or Stucco Hall)",
    "Woman's shoe",
    "Bona Room",
    "Red Salon",
    "Parasole, italian workshop",
    "King's study",
    "Cousin Argia",
    "Lady with a bunch of flowers",
    "Portrait of a Lady",
    "Throne Room",
    "Mars Room (Sala di Marte)",
    "The Four Philosophers",
    "Portrait of Ippolito de' Medici",
    "Holy Family with St. Anne and St. John",
    "The Vision of Ezekiel",
    "Pregnant Peasant Woman",
    "Portrait of a Lady (La Gravida)",
    "Madonna and Child (known as Madonna of the granduca)",
    "Saint Mark the Evangelist",
    "Portrait of Tommaso Mosti",
    "Portrait of Pietro Aretino",
    "Man in black (Ippolito Riminaldi ?)",
    "La bella",
    "Portrait of a Man",
    "Apollo Room (Sala di Apollo)",
    "Peasants Returning from the Fields",
    "Two Monks",
    "Madonna of the Robbins",
    "Mary Magdalene",
    "Cleopatra",
    "The Three Fates",
    "Portrait of a Young Man as St. Sebastian",
    "Portrait of a Gentleman",
    "Jupiter Room (Sala di Giove)",
    "The Age of Gold",
    "The Age of Silver",
    "The Age of Bronze",
    "The Age of Iron",
    "Saturn Room (Sala di Saturno)",
    "Annunciation",
    "Self-portrait",
    "Christ at the Column",
    "Suicide of Lucrezia",
    "Madonna del Baldacchino",
    "Disputation on the Immaculate Conception",
    "Young St. John the Baptist",
    "Nymph Chased by Satyr",
    "Venus Room (Sala di Venere)",
    "Portrait of Pope Julius II",
    "The Concert",
    "The Three Ages of Man",
    "Woman at the Mirror",
    "Iliad Room",
    "Flora",
    "Prometheus Room",
    "Holy Family with Small St. John",
    "Education of Jupiter Room",
    "Ulysses Room",
    "Napoleon I",
    "The Consequences of the War / The Horrors of War",
    "The Horrors of War",
    "The Consequences of War",
    "Saturn's Hall",
    "The Supper at Emmaus",
    "Portrait of a Grey-Haired Man",
    "The Risen Christ Appearing to Mary Magdalene",
    "Portrait of \"Giorgio\" (alleged self-portrait of Giorgione)",
    "Portrait of Vincenzo Zeno",
    "Baptism of Christ",
    "Christ and the Samaritan Woman",
    "Deposition (The Pietà)",
    "Deposition",
    "The Pietà",
    "Entombment",
    "Leda (and the Swan)",
    "Leda and the Swan",
    "Portrait of Alvise Cornaro",
    "Venus of Urbino",
    "Sleeping Venus",
    "Portrait of a Woman (\"La Schiavona\")",
    "La Schiavona",
    "Jupiter and Juno",
    "Battle of Zama",
    "Bust-Portrait of a Man",
    "Portrait of a Man with a Golden Collar",
    "Portrait of a Young Woman",
    "Portrait of a Nobleman (Nobleman with Sword hilt)",
    "Bathing Nymph",
    "Saint Margaret",
    "The Man with the Grey Eyes",
    "The Martyr",
    "Madonna and Child known as Madonna of the Long Neck",
    "Madonna of the Long Neck",
    "The Adoration of the Magi",
    "Portrait of Luigi Cornaro",
    "Portrait of Tomaso (Tommaso) or Vincenzo Mosti",
    "Apollo and Marsyas",
    "Mary Magdalene Penitent",
    "Portrait of Pope Sixtus IV",
    "The Assumption of the Virgin",
    "The Charity",
    "The Marriage of Saint Catherine",
    "Sacred Allegory",
    "Allegory of Peace",
    "The Virgin and Child with St. John the Baptist and Saints Elizabeth",
    "St. Catherine (or Giulia) and Saints",
    "Three Angels",
    "Portrait of Andrea Vesalio",
    "Portrait of Antonio Perrenot de Granvelle",
    "The Temptation of St. Anthony",
    "Portrait of Charles V",
    "Self-Portrait as a Young Man",
    "Portrait of a Warrior",
    "Fall of the Rebel Angels",
    "Flask",
    "Oval with perspective view of the Piazza Granducale",
    "The Sleeping Infant St John",
    "Adoration of the Magi",
    "Asclepius",
    "Athlete",
    "Mercury with pétasos",
    "Athena Giustiniani",
    "Confidences"
];

// Normalize title for comparison
function normalizeTitle(title) {
    if (!title) return '';
    return title
        .toLowerCase()
        .replace(/[''`]/g, "'")
        .replace(/[""]/g, '"')
        .replace(/\s+/g, ' ')
        .trim();
}

// Check if artwork belongs to Pitti Palace (by title)
function isPittiPalace(artwork) {
    const artTitle = normalizeTitle(artwork.title);

    // Check exact match
    for (const pittiTitle of PITTI_TITLES) {
        const normalizedPitti = normalizeTitle(pittiTitle);
        if (artTitle === normalizedPitti) {
            return true;
        }
        // Check partial match (title starts with or contains)
        if (artTitle.includes(normalizedPitti) || normalizedPitti.includes(artTitle)) {
            return true;
        }
    }

    // Also check location for Pitti-specific locations
    const loc = (artwork.location || '').toLowerCase();
    const PITTI_LOCATIONS = [
        'palatine gallery', 'galleria palatina',
        'jupiter room', 'sala di giove',
        'saturn room', 'sala di saturno',
        'mars room', 'sala di marte',
        'apollo room', 'sala di apollo',
        'venus room', 'sala di venere',
        'prometheus room', 'sala di prometeo',
        'ulysses room', 'sala di ulisse',
        'education of jupiter', 'sala dell\'educazione di giove',
        'iliad room', 'sala dell\'iliade',
        'pitti', 'palazzo pitti',
        'royal apartments', 'appartamenti reali',
        'silver museum', 'museo degli argenti',
        'costume gallery', 'galleria del costume',
        'porcelain museum', 'museo delle porcellane',
        'gallery of modern art', 'galleria d\'arte moderna',
        'boboli'
    ];

    for (const pattern of PITTI_LOCATIONS) {
        if (loc.includes(pattern)) {
            return true;
        }
    }

    return false;
}

// Split the collection
const allObjects = uffiziData.objects || [];
const pittiArtworks = [];
const uffiziArtworks = [];

for (const artwork of allObjects) {
    if (isPittiPalace(artwork)) {
        pittiArtworks.push(artwork);
    } else {
        uffiziArtworks.push(artwork);
    }
}

console.log('🖼️ Splitting Uffizi collection by TITLE matching...\n');
console.log(`📊 Total artworks: ${allObjects.length}`);
console.log(`\n✅ Uffizi Gallery: ${uffiziArtworks.length} artworks`);
console.log(`✅ Pitti Palace: ${pittiArtworks.length} artworks`);

// Save Uffizi Gallery collection
const uffiziOutput = {
    museum: "Uffizi Gallery",
    museumId: "uffizi-gallery",
    location: "Florence, Italy",
    type: "permanent",
    totalArtworks: uffiziArtworks.length,
    objects: uffiziArtworks
};
fs.writeFileSync(
    path.join(__dirname, '../public/data/uffizi-gallery-collection.json'),
    JSON.stringify(uffiziOutput, null, 2)
);

// Save Pitti Palace collection
const pittiOutput = {
    museum: "Pitti Palace",
    museumId: "pitti-palace",
    location: "Florence, Italy",
    type: "permanent",
    totalArtworks: pittiArtworks.length,
    objects: pittiArtworks
};
fs.writeFileSync(
    path.join(__dirname, '../public/data/pitti-palace-collection.json'),
    JSON.stringify(pittiOutput, null, 2)
);

console.log(`\n📁 Saved: uffizi-gallery-collection.json (${uffiziArtworks.length} items)`);
console.log(`📁 Saved: pitti-palace-collection.json (${pittiArtworks.length} items)`);

// Show sample Pitti artworks
console.log('\n📋 Sample Pitti artworks:');
pittiArtworks.slice(0, 10).forEach(a => {
    console.log(`   - ${a.title} (${a.location || 'Unknown'})`);
});
