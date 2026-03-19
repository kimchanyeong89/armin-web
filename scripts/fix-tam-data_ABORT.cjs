const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '../public/data/today-art-museum.json');

function clean() {
    if (!fs.existsSync(FILE)) {
        console.error("File not found:", FILE);
        return;
    }

    const raw = fs.readFileSync(FILE, 'utf8');
    let data;
    try {
        data = JSON.parse(raw);
    } catch (e) {
        console.error("Invalid JSON:", e.message);
        return;
    }

    console.log(`Processing ${data.length} items...`);

    const cleanedData = data.map((item, idx) => {
        // Recover the "original raw text". 
        // If we ran the previous script, 'title' is now clean, 'artist' is clean. 
        // We might need to look at 'dimensions' or reconstruct if we lost data.
        // Wait, if the previous script RAN, it overwrote the file. Data might be lost?
        // Fortunately, the previous script outputted key fields.
        // The *original* mess was in `item.title` and `item.artist` in the source JSON.
        // But `item.dimensions` in the current file contains "50x40... Creation: ...".
        // So we can still recover some info from specific fields.
        // However, `item.originalImage` was saved.
        // To do a FULL re-parse, we ideally need the ORIGINAL scrape output.
        // But we don't have it unless we re-scrape or use what's left.
        // The most "rich" field remaining is probably `dimensions` (contains Size, Creation, Collection)
        // and probably `title` / `artist` are relatively clean? No, `artist` was "Hong Lei".
        // `medium` was "Creation" (bad).

        // Let's assume we are fixing the CURRENT `public/data/today-art-museum.json`.

        let title = item.title;
        let artist = item.artist;
        let dimensions = item.dimensions || ''; // "50x40cm\nCreation: 2005..."
        let medium = item.medium; // "Creation" -> garbage.

        // 1. Fix Dimensions & Year
        let year = item.year;
        let creationFull = '';

        if (dimensions.includes('Creation:')) {
            const parts = dimensions.split(/Creation[:：]/i);
            dimensions = parts[0].trim(); // "50x40cm"
            creationFull = parts[1] || ''; // "2005\nCollection: 2007"

            // Extract year from creation part
            const m = creationFull.match(/(\d{4})/);
            if (m) year = m[1];
        } else if (dimensions.includes('Collection:')) {
            const parts = dimensions.split(/Collection[:：]/i);
            dimensions = parts[0].trim();
        }

        // 2. Fix Medium / Category
        // The previous script failed to capture Form correctly because regex `[^Size]+` failed.
        // We can't recover "Form" from the currently saved file if it wasn't saved!
        // `medium` is "Creation".
        // Is "Form" present anywhere?
        // In the log of Step 385:
        // "title": "Autumn ...\nArtist:...\nForm: Photography..."
        // BUT the previous script `fix-tam-data.cjs` OVERWROTE the file.
        // Did it preserve the original title/artist string? NO. It split it.
        // "title" became "Autumn...".
        // "artist" became "Hong Lei".
        // "medium" became matching `Form:...` but it failed and got "Creation" (probably from `item.medium` being undefined and regex matching wrong).
        // WE LOST DATA!
        // We must RE-SCRAPE or try to recover from `item.title` if it wasn't trimmed?
        // The previous script did `item.title = newTitle` (trimmed).
        // SO THE DATA IS GONE from the JSON file.

        // ACTION: WE MUST RE-RUN SCRAPER or restore from backup if possible.
        // We don't have backup.
        // We should run the scraper again.
        // Scraper is `scripts/scrape-todayartmuseum.cjs`.
        // It takes ~1 minute.
        // BUT user is waiting.
        // I will re-run scraper. Only 112 items.

        // Wait, I can't just run scraper and then this script.
        // I should update the scraper to produce CLEAN data directly!
        // That is much better.

        return item; // Placeholder, this script will be replaced by scraper update.
    });
}
// Abort this file write. I will update the scraper instead.
