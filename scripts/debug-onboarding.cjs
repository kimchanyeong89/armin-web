const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../public/data');

const normalize = (n) => n.toLowerCase().replace(/\s+/g, '').normalize("NFD").replace(/[\u0300-\u036f]/g, "");

async function debugOnboarding() {
    try {
        console.log("Starting debug...");

        // 1. Load Local Artworks
        const localArtworksByArtist = {};
        const collectionFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('.json') && !f.startsWith('artists-') && !f.startsWith('valid-') && !f.includes('test'));

        console.log(`Loading ${collectionFiles.length} collection files...`);

        for (const file of collectionFiles) {
            try {
                const content = fs.readFileSync(path.join(dataDir, file), 'utf-8');
                const data = JSON.parse(content);
                let items = [];
                if (Array.isArray(data)) items = data;
                else if (data.items && Array.isArray(data.items)) items = data.items;
                else if (data.objects && Array.isArray(data.objects)) items = data.objects;

                items.forEach(art => {
                    const artistName = art.artist || art.artistName || art.a;
                    const imageUrl = art.image || art.imageUrl || art.i;
                    if (artistName && imageUrl) {
                        const key = normalize(artistName);
                        if (!localArtworksByArtist[key]) localArtworksByArtist[key] = [];
                        localArtworksByArtist[key].push(imageUrl);
                    }
                });
            } catch (e) {
                // ignore
            }
        }
        console.log(`Indexed local artworks for ${Object.keys(localArtworksByArtist).length} artists.`);

        // 2. Load Artists Dates
        const datesPath = path.join(dataDir, 'artists-dates.json');
        if (!fs.existsSync(datesPath)) {
            console.error("artists-dates.json NOT FOUND!");
            return;
        }

        const datesContent = fs.readFileSync(datesPath, 'utf-8');
        const artistsData = JSON.parse(datesContent);

        const lookup = {};
        const flatArtists = [];

        let processedCount = 0;
        let passedFilterCount = 0;
        let hasDeathDateCount = 0;

        Object.values(artistsData).forEach(artist => {
            processedCount++;
            let arts = [];

            // Local
            const localMatches = localArtworksByArtist[normalize(artist.name)];
            if (localMatches) {
                arts.push(...localMatches);
            }

            // Remote
            if (artist.artworks && Array.isArray(artist.artworks)) {
                const normalizeUrl = (u) => u ? u.trim().replace(/^https?:\/\//, '').replace(/\/$/, '') : '';
                const profileUrlNorm = normalizeUrl(artist.imageUrl);

                const remote = artist.artworks.filter((url) => {
                    if (!url) return false;
                    if (!profileUrlNorm) return true;
                    return normalizeUrl(url) !== profileUrlNorm;
                });
                arts.push(...remote);
            }

            // Fallback
            if (arts.length === 0 && artist.imageUrl) {
                arts.push(artist.imageUrl);
            }

            // Unique
            arts = Array.from(new Set(arts.filter(Boolean)));

            // Filter
            if (arts.length < 5) return;

            passedFilterCount++;

            // Birthday Lookup
            if (artist.deathDate) {
                hasDeathDateCount++;
                const parts = artist.deathDate.split('.');
                if (parts.length === 3) {
                    const key = `${parts[1]}-${parts[2]}`;
                    if (!lookup[key]) lookup[key] = [];
                    lookup[key].push(artist);
                }
            }
        });

        console.log(`Processed: ${processedCount}`);
        console.log(`Passed Filter (>4 arts): ${passedFilterCount}`);
        console.log(`Have Death Date (in lookup): ${hasDeathDateCount}`);
        console.log(`Lookup Keys: ${Object.keys(lookup).length}`);

        // Check 08-08 specifically
        if (lookup['08-08']) {
            console.log(`Artists for 08-08: ${lookup['08-08'].length}`);
        } else {
            console.log(`Artists for 08-08: NONE`);
        }

    } catch (e) {
        console.error("Crash:", e);
    }
}

debugOnboarding();
