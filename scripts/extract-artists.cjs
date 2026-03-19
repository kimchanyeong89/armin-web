
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../public/data');
const OUT_FILE = path.join(__dirname, 'top-artists.json');

function getTopArtists() {
    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
    const artistCounts = {};

    console.log(`Scanning ${files.length} files...`);

    files.forEach(file => {
        try {
            const content = fs.readFileSync(path.join(DATA_DIR, file), 'utf-8');
            const data = JSON.parse(content);
            const items = Array.isArray(data) ? data : (data.items || []);

            items.forEach(item => {
                let artist = item.artist || item.author;
                if (!artist) return;

                // cleanup
                // Remove (Year-Year) or (born Year)
                artist = artist.replace(/\([^)]*\)/g, '').trim();
                // Remove numeric years if loose in string
                artist = artist.replace(/[0-9]{4}/g, '').trim();
                // Remove trailing punctuation
                artist = artist.replace(/[,;]+$/, '').trim();

                if (artist.length < 3) return;
                if (artist.toLowerCase().includes('unknown') || artist.toLowerCase().includes('anonymous')) return;

                artistCounts[artist] = (artistCounts[artist] || 0) + 1;
            });
        } catch (e) {
            // ignore bad files
        }
    });

    const sorted = Object.entries(artistCounts)
        .filter(([name, count]) => count >= 10) // Only >= 10 artworks
        .sort((a, b) => b[1] - a[1]);

    console.log(`Found ${Object.keys(artistCounts).length} unique artists total.`);
    console.log(`Artists with >= 10 artworks: ${sorted.length}`);
    console.log(`Top 10:`, sorted.slice(0, 10));

    fs.writeFileSync(OUT_FILE, JSON.stringify(sorted.map(x => x[0]), null, 2));
    console.log(`Saved ${sorted.length} qualifying artists to ${OUT_FILE}`);
}

getTopArtists();
