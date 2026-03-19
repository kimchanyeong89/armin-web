const fs = require('fs');
const path = require('path');

// Read exhibitions.js. It exports an array.
let code = fs.readFileSync('src/data/exhibitions.js', 'utf8');
// remove export default
code = code.replace(/export\s+default\s+/, 'module.exports = ');
code = code.replace(/import .*? from .*/g, ''); // strip imports
fs.writeFileSync('temp_exh.cjs', code);

try {
    const museums = require('./temp_exh.cjs');

    let allCollectionsMap = [];
    museums.forEach(m => {
        let list = [];
        if (m.permanentExhibitions) list.push(...m.permanentExhibitions);
        if (m.temporaryExhibitions) list.push(...m.temporaryExhibitions);
        if (m.pastExhibitions) list.push(...m.pastExhibitions);
        if (m.exhibitions) list.push(...m.exhibitions);
        
        list.forEach(col => {
            allCollectionsMap.push({
                museum: m.name,
                country: m.country || 'Unknown',
                collection: col.name || col.title,
                id: col.id
            });
        });
    });

    console.log(`Found ${allCollectionsMap.length} collections linked to the UI.`);

    // Write a new gen_schema script that uses this structure!
    let newGen = `const fs = require('fs');
const path = require('path');

const museumsMeta = ${JSON.stringify(allCollectionsMap)};
const dataDir = path.join(__dirname, '..', 'public', 'data');

let finalReport = [];

museumsMeta.forEach(meta => {
    let filePath = path.join(dataDir, meta.id + '.json');
    if (!fs.existsSync(filePath)) {
        // Fallback for .json missing
        return;
    }
    
    let content = fs.readFileSync(filePath, 'utf8');
    let data;
    try {
        data = JSON.parse(content);
    } catch(e) { return; }
    
    let items = [];
    if (Array.isArray(data)) items = data;
    else if (data && data.objects && Array.isArray(data.objects)) items = data.objects;
    else if (data && data.artworks && Array.isArray(data.artworks)) items = data.artworks;
    else if (data && data.items && Array.isArray(data.items)) items = data.items;
    
    if (items.length === 0) return;
    
    let safeCount = 0;
    items.forEach(item => {
        const url = item.imageUrl || item.image || item.image_url || item.thumbnail || (item.images && item.images[0]) || '';
        const uStr = String(url);
        // r2 domain or our proxy wsrv.nl
        if (uStr.includes('r2.dev') || uStr.includes('armin-r2') || uStr.includes('wsrv.nl') || uStr.includes('Cloudflare')) {
            safeCount++;
        }
    });
    
    finalReport.push({
        country: meta.country,
        museum: meta.museum,
        collection: meta.collection,
        count: items.length,
        safe: safeCount,
        pct: (safeCount / items.length) * 100
    });
});

finalReport.sort((a,b) => {
    if (a.country !== b.country) return a.country.localeCompare(b.country);
    if (a.museum !== b.museum) return a.museum.localeCompare(b.museum);
    return b.count - a.count;
});

let md = [];
md.push('| Country | Museum | Collection Group | Total Items | Uploaded/Proxied | Progress |');
md.push('| --- | --- | --- | ---: | ---: | ---: |');

let tCount = 0, tSafe = 0;
finalReport.forEach(r => {
    let status = r.pct >= 99.9 ? '🟢 100.0%' : (r.pct > 0 ? \`🟡 \${r.pct.toFixed(1)}%\` : '🔴 0.0%');
    let mName = r.museum;
    if (r.museum === 'The Art Institute of Chicago (AIC)') mName = 'AIC';
    md.push(\`| \${r.country} | **\${mName}** | \${r.collection} | \${r.count.toLocaleString()} | \${r.safe.toLocaleString()} | \${status} |\`);
    tCount += r.count;
    tSafe += r.safe;
});

let totalPct = (tSafe / tCount) * 100;
md.push(\`| **TOTAL** | | **All UI Collections** | **\${tCount.toLocaleString()}** | **\${tSafe.toLocaleString()}** | **\${totalPct.toFixed(1)}%** |\`);

fs.writeFileSync(path.join(__dirname, '..', 'perfect_dashboard.md'), md.join('\\n'));
console.log('perfect_dashboard.md written.');
`;
    fs.writeFileSync('scripts/gen_perfect_dashboard.cjs', newGen);
} catch(e) {
    console.error(e);
}
