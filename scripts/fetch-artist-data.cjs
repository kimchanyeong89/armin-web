const fs = require('fs');
const path = require('path');

const IN_FILE = path.join(__dirname, '../public/data/valid-artists.json');
const OUT_FILE = path.join(__dirname, '../public/data/artists-dates.json');

async function fetchWithRetry(url) {
    for (let i = 0; i < 3; i++) {
        try {
            const res = await fetch(url + (url.includes('?') ? '&' : '?') + 'origin=*', {
                headers: { 'User-Agent': 'ArminWebBot/1.0 (armin@example.com)' }
            });
            if (res.ok) return await res.json();
        } catch (e) {
            await new Promise(r => setTimeout(r, 1000));
        }
    }
    return null;
}

async function searchWikiData(query) {
    const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=en&limit=1&format=json`;
    return fetchWithRetry(url);
}

async function getEntityDetails(ids) {
    // metadata: labels, claims
    // ids can be single or pipe-separated
    const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids}&props=claims&format=json`;
    return fetchWithRetry(url);
}

// Parse WikiDate string "+1853-03-30T00:00:00Z" -> "1853.03.30"
function parseWikiDate(str) {
    if (!str) return null;
    try {
        // Handle +1853-03-30...
        const clean = str.replace(/^\+/, '').split('T')[0];
        const [y, m, d] = clean.split('-');
        if (!y || !m || !d) return null;
        // Check if date is 00
        if (m === '00' || d === '00') return null;
        return `${y}.${m}.${d}`;
    } catch (e) { return null; }
}

async function run() {
    let artists = [];
    if (fs.existsSync(IN_FILE)) {
        const raw = JSON.parse(fs.readFileSync(IN_FILE, 'utf-8'));
        // valid-artists.json is [ { name: "X", count: 10 }, ... ]
        // We handle both simple strings or objects
        if (Array.isArray(raw)) {
            artists = raw.map(x => (typeof x === 'string' ? x : x.name));
        }
    } else {
        console.error("Input file not found:", IN_FILE);
        return;
    }

    const results = {};

    // Load existing
    if (fs.existsSync(OUT_FILE)) {
        try {
            Object.assign(results, JSON.parse(fs.readFileSync(OUT_FILE, 'utf-8')));
        } catch (e) { }
    }

    // --- STEP 0: Pre-index LOCAL artworks ---
    console.log("Indexing local collection files...");
    const localArtworksMap = {}; // { "normalized_name": [ "url1", "url2" ] }

    // Helper: Unicode-safe normalize (same as generate-valid-artists)
    const normalizeLocal = (n) => n.toLowerCase().replace(/\s+/g, '').normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    const dataFiles = fs.readdirSync(path.join(__dirname, '../public/data')).filter(f => f.endsWith('.json') && !f.startsWith('artists-') && !f.startsWith('valid-') && !f.includes('test'));

    dataFiles.forEach(file => {
        try {
            const raw = fs.readFileSync(path.join(__dirname, '../public/data', file), 'utf-8');
            const json = JSON.parse(raw);
            let items = [];
            if (Array.isArray(json)) items = json;
            else if (json.items && Array.isArray(json.items)) items = json.items;

            items.forEach(item => {
                const name = item.artist || item.artistName;
                const img = item.imageUrl || item.image;
                if (!name || !img) return;

                const key = normalizeLocal(name);
                if (!key) return;

                if (!localArtworksMap[key]) localArtworksMap[key] = [];
                localArtworksMap[key].push(img);
            });
        } catch (e) { }
    });
    console.log(`Indexed local artworks for ${Object.keys(localArtworksMap).length} artists.`);

    // Update existing results with local data immediately (in case we don't re-process)
    Object.keys(results).forEach(name => {
        const key = normalizeLocal(name);
        if (localArtworksMap[key]) {
            const existing = new Set(results[name].artworks || []);
            localArtworksMap[key].forEach(url => existing.add(url));
            results[name].artworks = Array.from(existing);
        }
    });

    // Filter artists to process:
    // 1. New artists 
    // 2. Artists with < 10 artworks TOTAL (Wiki + Local) -> Try to fetch more if possible, OR just update the file.
    // Actually, we should just ensure everyone in 'artists' list gets their local artworks merged.

    // We will re-save results at the end, so local-only updates are persisted.

    let toProcess = artists.filter(a => {
        const existing = results[a];

        // If we have local artworks for this artist, we might not need to fetch Wiki if we already have 10+?
        // But we still want birth/death dates from Wiki.

        if (!existing) return true; // New

        // If it has artworks (e.g. from local index) but is marked notFound (missing dates), RETRY!
        if (existing.notFound && existing.artworks && existing.artworks.length > 0) return true;

        if (existing.notFound) return false;

        // If missing dates but has artworks, retry
        if ((!existing.birthDate || !existing.deathDate) && existing.artworks && existing.artworks.length > 0) return true;

        // If no artworks, retry? Maybe.
        if (!existing.artworks || existing.artworks.length === 0) return true;

        if (existing.deathDate && existing.deathDate.endsWith('.01.01')) return true; // Suspicious default
        if (existing.birthDate && existing.birthDate.endsWith('.01.01')) return true; // Suspicious default

        return false;
    });

    // --- PRIORITIZATION FOR USER REQUEST ---
    // Move user-requested artists to the FRONT of the queue to verify logic immediately.
    toProcess.sort((a, b) => {
        const isTargetA = (a.includes("Soutine") || a.includes("이중섭") || a.includes("Lee Jung"));
        const isTargetB = (b.includes("Soutine") || b.includes("이중섭") || b.includes("Lee Jung"));
        if (isTargetA && !isTargetB) return -1;
        if (!isTargetA && isTargetB) return 1;
        return 0;
    });

    console.log(`Input artists: ${artists.length}`);
    console.log(`Needs processing: ${toProcess.length}`);

    // Concurrency control
    const CONCURRENCY = 8;
    let completed = 0;
    const total = toProcess.length;

    const processArtist = async (artist) => {
        try {
            // 1. Search
            const searchRes = await searchWikiData(artist);
            if (!searchRes || !searchRes.search || searchRes.search.length === 0) {
                // Keep minimal record if failed
                results[artist] = { notFound: true, name: artist };
                completed++;
                process.stdout.write(`\r[${completed}/${total}] Not found: ${artist}           `);
                return;
            }

            const hit = searchRes.search[0];
            const qid = hit.id;

            // 2. Get Details (Artist)
            const entitiesRes = await getEntityDetails(qid);
            const entity = entitiesRes.entities[qid];
            const claims = entity.claims || {};

            // Dates P569 (birth), P570 (death)
            // Images P18
            const birthVal = claims.P569?.[0]?.mainsnak?.datavalue?.value;
            const deathVal = claims.P570?.[0]?.mainsnak?.datavalue?.value;

            // Precision 11 = Day, 10 = Month, 9 = Year. 
            // If < 11, we don't know the exact day, so don't treat it as a birthday match.
            const birthDate = (birthVal && birthVal.precision >= 11) ? parseWikiDate(birthVal.time) : null;
            const deathDate = (deathVal && deathVal.precision >= 11) ? parseWikiDate(deathVal.time) : null;

            // Images
            const p18Claims = claims.P18 || [];
            const artworks = [];

            // Helper to build Commons URL
            const getCommonsUrl = (filename) => {
                if (!filename) return null;
                const safeName = filename.replace(/ /g, '_');
                const md5 = require('crypto').createHash('md5').update(safeName).digest('hex');
                // Standard Wikimedia Commons mapping
                // https://upload.wikimedia.org/wikipedia/commons/a/a2/Filename.jpg
                // Logic: 
                // md5("Filename.jpg") -> "a2..."
                // URL: .../commons/a/a2/Filename.jpg
                // But simpler: use Special:FilePath
                return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}`;
            };

            p18Claims.forEach(c => {
                const val = c.mainsnak?.datavalue?.value;
                if (val) artworks.push(getCommonsUrl(val));
            });

            // Notable Work (P800) -> Fetch images
            const p800Claims = claims.P800 || [];
            if (p800Claims.length > 0) {
                const workIds = p800Claims.map(c => c.mainsnak?.datavalue?.value?.id).filter(Boolean).slice(0, 15);
                if (workIds.length > 0) {
                    const workDetails = await getEntityDetails(workIds.join('|'));
                    if (workDetails && workDetails.entities) {
                        Object.values(workDetails.entities).forEach(w => {
                            const wClaims = w.claims || {};
                            const wP18 = wClaims.P18 || [];
                            wP18.forEach(wc => {
                                const val = wc.mainsnak?.datavalue?.value;
                                if (val) artworks.push(getCommonsUrl(val));
                            });
                        });
                    }
                }
            }

            // Dedupe artworks
            const uniqueArtworks = Array.from(new Set(artworks));

            results[artist] = {
                name: artist,
                wikiId: qid,
                birthDate,
                deathDate,
                imageUrl: uniqueArtworks.length > 0 ? uniqueArtworks[0] : null,
                artworks: uniqueArtworks,
                notFound: false
            };

            completed++;
            process.stdout.write(`\r[${completed}/${total}] Processed: ${artist} (${uniqueArtworks.length} arts)`);

        } catch (e) {
            console.error(`Error processing ${artist}:`, e.message);
            completed++;
        }
    };

    // Main Loop
    // Chunking for simple concurrency
    for (let i = 0; i < toProcess.length; i += CONCURRENCY) {
        const chunk = toProcess.slice(i, i + CONCURRENCY);
        await Promise.all(chunk.map(processArtist));
        // Save periodically
        if (i % 50 === 0) {
            fs.writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
        }
    }

    fs.writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
    console.log("\nDone.");
}

run();
