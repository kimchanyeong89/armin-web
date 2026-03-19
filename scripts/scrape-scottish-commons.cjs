const https = require('https');
const fs = require('fs');
const path = require('path');

// Usage: node scripts/scrape-scottish-commons.cjs <Category> <OutputFilename> [MuseumId]

const BASE_URL = 'https://commons.wikimedia.org/w/api.php';
const DEPTH_LIMIT = 2;
const MAX_ITEMS = 3000;

const args = process.argv.slice(2);
const ROOT_CATEGORY = args[0] || 'Paintings_in_the_Scottish_National_Gallery';
const OUTPUT_FILENAME = args[1] || 'scottish-national-gallery-collection.json';
const MUSEUM_ID = args[2] || 'sng-collection';

const OUTPUT_PATH = path.join(__dirname, '../public/data', OUTPUT_FILENAME);

let processedCats = new Set();
let allFiles = new Map();
let totalItems = 0;

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const options = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'GET',
            headers: { 'User-Agent': 'ScottishGalleryScraper/1.1 (contact@example.com)' }
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve({});
                }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

async function getCategoryMembers(category, depth) {
    if (depth > DEPTH_LIMIT || processedCats.has(category)) return;
    processedCats.add(category);
    console.log(`Scanning Category:${category} (Depth ${depth})...`);

    let continueToken = '';

    do {
        const params = new URLSearchParams({
            action: 'query',
            list: 'categorymembers',
            cmtitle: `Category:${category}`,
            cmlimit: '500',
            cmtype: 'page|subcat|file',
            format: 'json',
            origin: '*'
        });
        if (continueToken) params.append('cmcontinue', continueToken);

        const data = await fetchJson(`${BASE_URL}?${params}`);
        const members = data.query?.categorymembers || [];

        for (const member of members) {
            if (member.ns === 14) {
                const subCat = member.title.replace(/^Category:/, '');
                await getCategoryMembers(subCat, depth + 1);
            } else if (member.ns === 6) {
                if (!allFiles.has(member.pageid)) {
                    allFiles.set(member.pageid, member.title);
                    totalItems++;
                }
            }
        }

        continueToken = data.continue?.cmcontinue;

        if (totalItems >= MAX_ITEMS) {
            console.log('Max items reached');
            return;
        }

        await new Promise(r => setTimeout(r, 200));

    } while (continueToken && totalItems < MAX_ITEMS);
}

function cleanTitle(raw) {
    if (!raw) return 'Untitled';

    // 1. Try extracting explicit English label: label QS:Len,"Title"
    let match = raw.match(/label QS:Len,"([^"]+)"/);
    if (match) return match[1];

    // 2. Try simple title QS extraction: title QS:P1476,en:"Title"
    match = raw.match(/title QS:P1476,\w+:"([^"]+)"/);
    if (match) return match[1];

    // 3. Fallback: Clean up raw string by removing QS markup
    let cleaned = raw.replace(/label QS:L\w+,"[^"]+"/g, '') // Remove label QS groups
        .replace(/title QS:[^"]+"/g, '') // Remove title QS garbage
        .replace(/German:\s*/g, '')
        .replace(/French:\s*/g, '')
        .replace(/Spanish:\s*/g, '')
        .trim();

    // If it still contains "label QS:", cut it off
    const splitCheck = cleaned.split('label QS:');
    if (splitCheck.length > 1 && splitCheck[0].trim().length > 0) {
        cleaned = splitCheck[0];
    }

    // Explicit check for stray quotes or commas
    cleaned = cleaned.replace(/^"|"$/g, '').replace(/,$/, '').trim();

    // If empty after cleaning, return raw (better than nothing) or Untitled
    return cleaned || raw;
}

function cleanYear(raw) {
    if (!raw) return '';
    // Look for 4 digits
    const match = raw.match(/\b(1\d{3}|20\d{2})\b/);
    if (match) return match[1];
    return raw.replace(/date QS:.*$/, '').trim();
}

async function getImageDetails(pageIds) {
    const batches = [];
    const ids = Array.from(pageIds);
    while (ids.length > 0) batches.push(ids.splice(0, 50));

    const results = [];

    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        console.log(`Fetching details for batch ${i + 1}/${batches.length}...`);

        const params = new URLSearchParams({
            action: 'query',
            pageids: batch.join('|'),
            prop: 'imageinfo',
            iiprop: 'url|extmetadata|size',
            format: 'json',
            origin: '*'
        });

        const data = await fetchJson(`${BASE_URL}?${params}`);
        const pages = data.query?.pages || {};

        for (const pid in pages) {
            const page = pages[pid];
            const info = page.imageinfo?.[0];
            if (!info) continue;

            const meta = info.extmetadata || {};
            const convertVal = (field) => field?.value ? field.value.replace(/<[^>]*>?/gm, '').trim() : '';

            // Use file name as fallback title
            const fileNameTitle = page.title.replace(/^File:/, '').replace(/\.(jpg|jpeg|png|tif|tiff)$/i, '').replace(/_/g, ' ');

            const rawTitle = convertVal(meta.ObjectName) || convertVal(meta.Title) || fileNameTitle;
            const rawYear = convertVal(meta.DateTimeOriginal) || convertVal(meta.DateTime);

            results.push({
                startYear: null,
                itemTitle: cleanTitle(rawTitle),
                year: cleanYear(rawYear),
                institution: MUSEUM_ID, // Force museum ID as institution
                artist: convertVal(meta.Artist) || 'Unknown',
                image: info.url,
                thumb: info.thumburl,
                source: page.title,
                dimensions: convertVal(meta.Dimensions) || (info.width && info.height ? `${info.width} x ${info.height}` : ''),
                medium: convertVal(meta.Medium),
                id: String(page.pageid),
                museumId: MUSEUM_ID
            });
        }

        await new Promise(r => setTimeout(r, 200));
    }
    return results;
}

(async () => {
    try {
        console.log(`Starting scrape for ${ROOT_CATEGORY} -> ${OUTPUT_FILENAME}`);
        await getCategoryMembers(ROOT_CATEGORY, 0);
        console.log(`Found ${allFiles.size} files. Fetching metadata...`);

        const details = await getImageDetails(allFiles.keys());

        const output = {
            museumId: MUSEUM_ID,
            scrapedAt: new Date().toISOString(),
            totalObjects: details.length,
            objects: details
        };

        fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
        console.log(`Saved ${details.length} items to ${OUTPUT_PATH}`);

    } catch (e) {
        console.error('Fatal error:', e);
    }
})();
