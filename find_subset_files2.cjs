const fs = require('fs');

const allFiles = fs.readdirSync('./public/data').filter(f => f.endsWith('.json') && !f.startsWith('search-warm-prefix') && !f.startsWith('search-index') && f !== 'all_slugs.json' && f !== 'sitemaps.json' && f !== 'artists-dates.json' && f !== 'valid-artists.json' && f !== 'top-museums.json' && f !== 'artists.json' && f !== 'db.json' && f !== 'manifest.json' && f !== 'package.json');

const fileContents = {};
for (const file of allFiles) {
    try {
        const raw = fs.readFileSync('./public/data/' + file, 'utf8');
        const data = JSON.parse(raw);
        let items = [];
        if (Array.isArray(data)) items = data;
        else if (data && data.artworks && Array.isArray(data.artworks)) items = data.artworks;
        else if (data && data.items && Array.isArray(data.items)) items = data.items;
        
        if (items.length > 0) {
            const ids = new Set(items.map(x => String(x.id || x.title || x.i)));
            fileContents[file] = { ids, count: items.length };
        }
    } catch (e) {
        // ignore parsing errors
    }
}

const completelyCoveredFiles = [];

for (const subsetFile of Object.keys(fileContents)) {
    const subsetData = fileContents[subsetFile];
    
    // find a file that completely covers this one, but isn't this one
    let coveringFile = null;
    for (const supersetFile of Object.keys(fileContents)) {
        if (subsetFile === supersetFile) continue;
        
        const supersetData = fileContents[supersetFile];
        // Only consider it a covering file if superset has more items, or if same size, sort alphabetically to pick one to keep
        if (supersetData.count > subsetData.count || (supersetData.count === subsetData.count && supersetFile < subsetFile)) {
            
            // Check if all ids in subset are in superset
            let covered = true;
            for (const id of subsetData.ids) {
                if (!supersetData.ids.has(id)) {
                    covered = false;
                    break;
                }
            }
            if (covered) {
                coveringFile = supersetFile;
                break;
            }
        }
    }
    
    if (coveringFile) {
        completelyCoveredFiles.push({ subsetFile, coveringFile, subsetCount: subsetData.count, supersetCount: fileContents[coveringFile].count });
    }
}

console.log(JSON.stringify(completelyCoveredFiles, null, 2));

