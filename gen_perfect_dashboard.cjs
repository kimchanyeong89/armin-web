const fs = require('fs');
const path = require('path');

let code = fs.readFileSync('src/data/exhibitions.js', 'utf8');
code = code.replace(/export const exhibitions = /, 'module.exports = ');
code = code.replace(/export default .*?;?/, '');
let imports = code.match(/import .*?;?/g);
if (imports) {
    imports.forEach(imp => { code = code.replace(imp, ''); });
}
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
                id: col.id.replace('.json', '')
            });
        });
    });

    const dataDir = path.join(__dirname, 'public', 'data');
    let finalReport = [];

    allCollectionsMap.forEach(meta => {
        let filePath = path.join(dataDir, meta.id + '.json');
        if (!fs.existsSync(filePath)) {
            return;
        }
        
        let content = fs.readFileSync(filePath, 'utf8');
        let data;
        try {
            data = JSON.parse(content);
        } catch(e) { return; }
        
        let items = [];
        if (Array.isArray(data)) items = data;
        else if (data && typeof data === 'object') {
            if (data.objects && Array.isArray(data.objects)) items = data.objects;
            else if (data.artworks && Array.isArray(data.artworks)) items = data.artworks;
            else if (data.items && Array.isArray(data.items)) items = data.items;
            else if (data.data && Array.isArray(data.data)) items = data.data;
        }
        
        if (items.length === 0) return;
        
        let safeCount = 0;
        items.forEach(item => {
            const url = item.imageUrl || item.image || item.image_url || item.thumbnail || (item.images && item.images[0]) || '';
            const uStr = String(url);
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
        let status = r.pct >= 99.9 ? '🟢 100.0%' : (r.pct > 0 ? `🟡 ${r.pct.toFixed(1)}%` : '🔴 0.0%');
        let mName = r.museum;
        if (r.museum === 'The Art Institute of Chicago (AIC)') mName = 'AIC';
        md.push(`| ${r.country} | **${mName}** | ${r.collection} | ${r.count.toLocaleString()} | ${r.safe.toLocaleString()} | ${status} |`);
        tCount += r.count;
        tSafe += r.safe;
    });

    let totalPct = (tSafe / tCount) * 100;
    md.push(`| **TOTAL** | | **All UI Collections** | **${tCount.toLocaleString()}** | **${tSafe.toLocaleString()}** | **${totalPct.toFixed(1)}%** |`);

    fs.writeFileSync('perfect_dashboard.md', md.join('\n'));
    console.log('Generated perfect_dashboard.md');

} catch(e) {
    console.error(e);
}