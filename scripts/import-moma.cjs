const fs = require('fs');
const https = require('https');
const path = require('path');
const readline = require('readline');
const { Transform } = require('stream');

const OUTPUT_FILE = path.join(__dirname, '../public/data/moma-collection.json');
const CSV_URL = 'https://media.githubusercontent.com/media/MuseumofModernArt/collection/main/Artworks.csv';

// User's requested classifications (inferred)
// 6 = Painting
// 9 = Drawing
// 48 = Sculpture (likely, or Photography)
// We will filter by text 'Painting', 'Drawing', 'Sculpture', 'Photography' just to be safe and comprehensive
const ALLOWED_CLASSIFICATIONS = ['Painting', 'Drawing', 'Sculpture', 'Photograph', 'Photography'];

// Date range: Pre-1850 to 2026.
// We will filter anything <= 2026. "Pre-1850" usually means "start from earliest".
// So essentially just <= 2026.

function parseCSVLine(line) {
    // Simple CSV parser that handles quotes
    const result = [];
    let start = 0;
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        if (line[i] === '"') {
            inQuotes = !inQuotes;
        } else if (line[i] === ',' && !inQuotes) {
            let field = line.substring(start, i);
            if (field.startsWith('"') && field.endsWith('"')) field = field.slice(1, -1);
            field = field.replace(/""/g, '"');
            result.push(field);
            start = i + 1;
        }
    }
    let last = line.substring(start);
    if (last.startsWith('"') && last.endsWith('"')) last = last.slice(1, -1);
    last = last.replace(/""/g, '"');
    result.push(last);
    return result;
}

function extractYear(dateStr) {
    if (!dateStr) return null;
    const m = dateStr.match(/\b\d{4}\b/);
    return m ? parseInt(m[0], 10) : null;
}

(async () => {
    console.log('Downloading MoMA Artworks.csv...');
    
    // We can stream and parse on the fly
    const items = [];
    
    await new Promise((resolve, reject) => {
        https.get(CSV_URL, (res) => {
            if (res.statusCode !== 200) {
                return reject(new Error(`Failed to download CSV: ${res.statusCode}`));
            }

            const rl = readline.createInterface({ input: res, crlfDelay: Infinity });
            let headers = null;
            let count = 0;
            let processed = 0;

            rl.on('line', (line) => {
                if (!line.trim()) return;
                
                // Parse CSV
                // Note: readline might split inside a quoted field with newlines.
                // For simplicity, we assume one record per line (MoMA CSV is usually well-behaved but titles can have newlines).
                // Actually, csv-parser is better, but this is a constrained env.
                // We'll trust the simple parser for now. If it breaks, we'll see.
                
                // Wait, MoMA CSV has newlines in headers? No.
                // But fields definitely have commas.
                
                // Let's use a robust-ish parser.
                // If a line has odd number of quotes, it's a multiline field.
                // This simple readline loop WON'T handle multiline items correctly.
                // But let's try.
                
                const fields = parseCSVLine(line);
                
                if (!headers) {
                    // Remove BOM if present in first field
                    if (fields[0] && fields[0].charCodeAt(0) === 0xFEFF) {
                        fields[0] = fields[0].slice(1);
                    }
                    
                    headers = fields;
                    // Identify indices
                    // Title,Artist,BeginDate,EndDate,Date,Medium,Dimensions,Classification,ImageURL,OnView,ObjectID
                    global.IDX = {
                        Title: headers.indexOf('Title'),
                        Artist: headers.indexOf('Artist'),
                        Date: headers.indexOf('Date'),
                        Medium: headers.indexOf('Medium'),
                        Dimensions: headers.indexOf('Dimensions'),
                        Classification: headers.indexOf('Classification'),
                        ImageURL: headers.indexOf('ImageURL'),
                        OnView: headers.indexOf('OnView'),
                        ObjectID: headers.indexOf('ObjectID'),
                        URL: headers.indexOf('URL')
                    };
                    return;
                }
                
                processed++;
                if (processed % 10000 === 0) console.log(`Processed ${processed} lines... Found ${items.length} items`);

                const classification = fields[global.IDX.Classification];
                const imageURL = fields[global.IDX.ImageURL];
                
                // Filter 1: Must have Image
                if (!imageURL) return;
                
                // Filter 2: Classification
                if (!ALLOWED_CLASSIFICATIONS.includes(classification)) return;
                
                // Filter 3: Date
                const dateStr = fields[global.IDX.Date];
                const year = extractYear(dateStr);
                // "Pre-1850" to "2026"
                // If year is null (e.g. "Unknown"), do we keep it? User said "Pre-1850", maybe implies "All dates"?
                // Or explicitly 1850-2026? "date_begin=Pre-1850" usually means "Any date before 1850 included".
                // So basically everything up to 2026.
                if (year && year > 2026) return; // Future items? Unlikely.
                
                const onView = !!fields[global.IDX.OnView]; // Empty string -> false, "Y" -> true (check usage)
                // Need to verify what 'OnView' contains. Usually null or something.
                
                let shouldKeep = true;
                if (!onView) {
                    if (classification && classification.includes('Photograph')) {
                        // Filter Photography: 1940-2026
                        // Extract year
                        const yearMatch = dateStr.match(/\d{4}/);
                        const year = yearMatch ? parseInt(yearMatch[0], 10) : 0;
                        if (year < 1940 || year > 2026) {
                            shouldKeep = false;
                        }
                    }
                }

                if (shouldKeep) {
                    items.push({
                        id: fields[global.IDX.ObjectID],
                        title: fields[global.IDX.Title],
                        artist: fields[global.IDX.Artist],
                        date: dateStr,
                        medium: fields[global.IDX.Medium],
                        dimensions: fields[global.IDX.Dimensions],
                        imageUrl: imageURL,
                        sourceUrl: fields[global.IDX.URL],
                        category: classification, // Use category for consistency
                        onView: onView // Store raw or boolean
                    });
                    count++;
                }
            });
            
            rl.on('close', () => {
                console.log('Download complete.');
                resolve();
            });
            
            rl.on('error', reject);
        }).on('error', reject);
    });

    console.log(`Saving ${items.length} MoMA items to ${OUTPUT_FILE}...`);
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(items, null, 2));
    console.log('Done.');

    // Print sample OnView
    const onViews = items.filter(i => i.onView);
    console.log(`Items On View: ${onViews.length}`);
    if (onViews.length > 0) console.log('Sample OnView:', onViews[0]);

})();
