/**
 * Split Uffizi collection into Uffizi Gallery and Pitti Palace
 * 
 * Pitti Palace rooms: Jupiter, Saturn, Apollo, Mars, Venus, Iliad, Prometheus,
 * Ulysses, Flora, Putti, Berenice, Aurora, Education of Jupiter, Castagnoli,
 * Allegories, Music, Hercules, Fine Arts, Green, Blue, Chapel, Palatine, etc.
 * 
 * Uffizi: A*, B*, C*, D* room codes, Boboli Gardens, Contini Bonacossi
 */

const fs = require('fs');
const path = require('path');

const INPUT_FILE = path.join(__dirname, '../public/data/uffizi-collection.json');
const UFFIZI_OUTPUT = path.join(__dirname, '../public/data/uffizi-gallery-collection.json');
const PITTI_OUTPUT = path.join(__dirname, '../public/data/pitti-palace-collection.json');

// Pitti Palace room patterns (case-insensitive)
const PITTI_PATTERNS = [
    /jupiter room/i,
    /room of jupiter/i,
    /saturn room/i,
    /room of saturn/i,
    /apollo room/i,
    /room of apollo/i,
    /mars room/i,
    /room of mars/i,
    /venus room/i,
    /room of venus/i,
    /iliad room/i,
    /room of iliad/i,
    /prometheus room/i,
    /room of prometheus/i,
    /ulysses room/i,
    /ulisse room/i,
    /room of ulysses/i,
    /room of fame/i,
    /flora room/i,
    /putti room/i,
    /berenice room/i,
    /aurora room/i,
    /education of jupiter/i,
    /castagnoli room/i,
    /allegories room/i,
    /music room/i,
    /hercules room/i,
    /fine arts room/i,
    /green room/i,
    /blue room/i,
    /ivory room/i,
    /ivories room/i,
    /parrot room/i,
    /stove room/i,
    /hearing room/i,
    /white room/i,
    /white hall/i,
    /palatine/i,   // Palatine Gallery, Palatine Chapel
    /pitti palace/i,
    /pitti,/i,     // Pitti, courtyard
    /hall of jupiter/i,
    /hall of saturn/i,
    /^room \d+$/i,  // Room 1, Room 2, etc. (numbered rooms in Pitti)
    /^rooms \d+-\d+$/i,  // Rooms 36-37
    /quartiere/i,   // Tapestry Quarters, etc.
    /loggetta/i,
    /volterrano/i,
    /royal apartments/i,
    /royal and imperial/i,
    /galleria d'arte moderna/i,
    /gallery of modern art/i,
    /poccetti gallery/i,
    /tapestry apartments/i,
    /meridiana/i,
    /porcelain museum/i,
    /museum of porcelain/i,
    /^sala \d+$/i,   // Sala 11, etc.
];

// Uffizi patterns (rooms starting with A, B, C, D + number)
const UFFIZI_PATTERNS = [
    /^A\d/i,        // A1, A2, A12, etc.
    /^B\d/i,        // B1, B2, etc.
    /^C\d/i,        // C1, C10, etc.
    /^D\.?\d/i,     // D1, D.13, etc.
    /boboli/i,      // Boboli Gardens is part of Uffizi Galleries
    /contini bonacossi/i,
    /^corridor/i,
    /^tribune/i,
    /western corridor/i,
    /eastern corridor/i,
    /southern corridor/i,
    /buontalenti grotto/i,
    /courtyard of the ajax/i,
    /antiquarium/i,
];

function isPitti(location) {
    if (!location) return false;
    const loc = location.trim();

    // Check Pitti patterns first
    for (const pattern of PITTI_PATTERNS) {
        if (pattern.test(loc)) return true;
    }

    return false;
}

function isUffizi(location) {
    if (!location) return true; // Default to Uffizi if no location
    const loc = location.trim();

    // Check Uffizi patterns
    for (const pattern of UFFIZI_PATTERNS) {
        if (pattern.test(loc)) return true;
    }

    return false;
}

function main() {
    console.log('🖼️ Splitting Uffizi collection...\n');

    const data = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
    const allObjects = data.objects || [];

    console.log(`📊 Total artworks: ${allObjects.length}`);

    const uffiziArtworks = [];
    const pittiArtworks = [];
    const unknownLocations = new Set();

    for (const artwork of allObjects) {
        const location = artwork.location || '';

        if (isPitti(location)) {
            pittiArtworks.push(artwork);
        } else if (isUffizi(location) || !location) {
            uffiziArtworks.push(artwork);
        } else {
            // Unknown - check if it looks more like Pitti or Uffizi
            unknownLocations.add(location);
            // Default to Uffizi for now
            uffiziArtworks.push(artwork);
        }
    }

    console.log(`\n✅ Uffizi Gallery: ${uffiziArtworks.length} artworks`);
    console.log(`✅ Pitti Palace: ${pittiArtworks.length} artworks`);

    if (unknownLocations.size > 0) {
        console.log(`\n⚠️ Unknown locations (defaulted to Uffizi):`);
        unknownLocations.forEach(loc => console.log(`   - "${loc}"`));
    }

    // Create Uffizi output
    const uffiziData = {
        museum: "Uffizi Gallery",
        museumId: "uffizi-gallery",
        location: "Florence, Italy",
        type: "permanent",
        scrapedAt: new Date().toISOString(),
        totalArtworks: uffiziArtworks.length,
        artworksWithImage: uffiziArtworks.filter(a => a.image).length,
        artworksWithArtist: uffiziArtworks.filter(a => a.artist).length,
        objects: uffiziArtworks
    };

    // Create Pitti output
    const pittiData = {
        museum: "Pitti Palace",
        museumId: "pitti-palace",
        location: "Florence, Italy",
        type: "permanent",
        scrapedAt: new Date().toISOString(),
        totalArtworks: pittiArtworks.length,
        artworksWithImage: pittiArtworks.filter(a => a.image).length,
        artworksWithArtist: pittiArtworks.filter(a => a.artist).length,
        objects: pittiArtworks
    };

    fs.writeFileSync(UFFIZI_OUTPUT, JSON.stringify(uffiziData, null, 2));
    fs.writeFileSync(PITTI_OUTPUT, JSON.stringify(pittiData, null, 2));

    console.log(`\n📁 Saved: uffizi-gallery-collection.json (${uffiziArtworks.length} items)`);
    console.log(`📁 Saved: pitti-palace-collection.json (${pittiArtworks.length} items)`);

    // Sample from each
    console.log('\n📋 Sample Uffizi artworks:');
    uffiziArtworks.slice(0, 3).forEach(a =>
        console.log(`   - ${a.title} (${a.location})`)
    );

    console.log('\n📋 Sample Pitti artworks:');
    pittiArtworks.slice(0, 3).forEach(a =>
        console.log(`   - ${a.title} (${a.location})`)
    );
}

main();
