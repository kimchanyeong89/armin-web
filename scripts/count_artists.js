const fs = require('fs');
const path = require('path');

const validArtistsPath = path.join(__dirname, '../public/data/valid-artists.json');

try {
    const raw = fs.readFileSync(validArtistsPath, 'utf-8');
    const artists = JSON.parse(raw);

    // Check if artists has count property
    if (artists.length > 0 && typeof artists[0] === 'string') {
        // If string array, we can't count artworks per artist easily here without the full logic.
        // But generate-valid-artists SAVES objects { name, count }.
        console.log("Error: Expected objects with count property.");
        process.exit(1);
    }

    const total = artists.length;
    const gte10 = artists.filter(a => a.count >= 10).length;
    const gte5 = artists.filter(a => a.count >= 5).length;

    console.log(`Total valid artists in file: ${total}`);
    console.log(`Artists with >= 10 artworks: ${gte10}`);
    console.log(`Artists with >= 5 artworks: ${gte5}`);

} catch (e) {
    console.error(e);
}
