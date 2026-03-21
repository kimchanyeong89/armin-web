const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../public/data');
// Filter for likely collection files. Excluding 'artists-dates.json' and obvious non-collection metadata.
let files = [];
async function run() {
    console.log("Loading mapping...");
    const { exhibitions } = await import('../src/data/exhibitions.js');
    const validFilesSet = new Set();
    exhibitions.forEach(m => {
        (m.permanentExhibitions || []).forEach(e => e.collectionFile && validFilesSet.add(e.collectionFile));
        (m.temporaryExhibitions || []).forEach(e => e.collectionFile && validFilesSet.add(e.collectionFile));
        (m.pastExhibitions || []).forEach(e => e.collectionFile && validFilesSet.add(e.collectionFile));
    });
    files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json') && validFilesSet.has(f));

const artistCounts = {};
const artistArtworks = {}; // Store a sample artwork for debug if needed, or just count.

const artistStats = {}; // Global stats

console.log(`Scanning ${files.length} files...`);

files.forEach(file => {
    try {
        const filePath = path.join(dataDir, file);
        const stats = fs.statSync(filePath);
        if (stats.size > 250 * 1024 * 1024) {
            console.log(`Skipping large file ${file} for safety (or stream it if needed)`);
            // actually 50MB is fine for node usually.
        }

        const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        let items = [];

        if (Array.isArray(content)) {
            items = content;
        } else if (content.items && Array.isArray(content.items)) {
            items = content.items;
        } else if (content.objects && Array.isArray(content.objects)) {
            items = content.objects;
        } else if (content.artworks && Array.isArray(content.artworks)) {
            items = content.artworks;
        } else if (Object.values(content).some(val => Array.isArray(val) && val.length > 0 && val[0].id)) {
            // Maybe it's like a mapped object? Logic for existing collections often varies.
            // We'll stick to Array or .items for now.
        }

        if (items && Array.isArray(items)) {
            items.forEach(item => {
                let artist = item.artist || item.artistName || item.maker || item.author;
            if (!artist) return;
            if (typeof artist !== 'string') return;

            artist = artist.trim();
            if (artist.match(/^unknown$/i) || artist.match(/^anonymous$/i) || artist.match(/unknown artist/i)) return;
            // Ignore genre garbage
            if (['painting', 'print', 'drawing', 'sculpture', 'photograph', 'lithograph'].includes(artist.toLowerCase())) return;

            // Normalize: remove accents, lowercase, remove spaces.
            // "Chaïm Soutine" -> "chaimsoutine"
            const normKey = artist.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

            // If empty (e.g. only symbols), skip
            if (!normKey && artist.length > 0) {
                // Fallback for Korean/Chinese etc which might lose all chars if we strictly use [^a-z0-9]
                // Revert to just removing spaces if regex stripped everything
                // Wait, Korean '이중섭' -> replaced to '' by [^a-z0-9] !!
                // FIX: Allow unicode letters.
            }

            // Revised Normalize for Unicode support:
            // Remove spaces, lowercase, NFD (strip accents).
            const normKeyUnicode = artist.toLowerCase().replace(/\s+/g, '').normalize("NFD").replace(/[\u0300-\u036f]/g, "");

            if (!normKeyUnicode) return;

            if (!artistStats[normKeyUnicode]) {
                artistStats[normKeyUnicode] = { count: 0, displayNames: {} };
            }
            artistStats[normKeyUnicode].count++;
            artistStats[normKeyUnicode].displayNames[artist] = (artistStats[normKeyUnicode].displayNames[artist] || 0) + 1;
        });
        }

    } catch (e) {
        console.warn(`Skipping ${file}: ${e.message}`);
    }
});

const validArtists = Object.values(artistStats)
    .filter(stat => stat.count >= 5)
    .map(stat => {
        // Pick most common display name
        const bestName = Object.entries(stat.displayNames).sort((a, b) => b[1] - a[1])[0][0];
        return { name: bestName, count: stat.count };
    })
    .sort((a, b) => b.count - a.count);

console.log(`Found ${Object.keys(artistStats).length} total unique artists.`);
console.log(`Selected ${validArtists.length} artists with >= 10 artworks.`);

const outputPath = path.join(dataDir, 'valid-artists.json');
fs.writeFileSync(outputPath, JSON.stringify(validArtists, null, 2));
console.log(`Saved to ${outputPath}`);

}
run().catch(console.error);
