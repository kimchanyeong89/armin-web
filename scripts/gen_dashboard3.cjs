const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'public', 'data');
const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));

let itemsToReport = [];

const exclude = ['exhibitions.json', 'system', 'search-index', 'highlights', 'featured', '-temp', '-backup', 'backup', 'fixed', 'clean', 'nav', 'index', 'links', 'debug', '1771', 'test'];

files.forEach(file => {
    if (exclude.some(ex => file.includes(ex))) return;
    
    try {
        const content = fs.readFileSync(path.join(dataDir, file), 'utf8');
        const data = JSON.parse(content);
        
        let items = [];
        let museumName = '';
        let collectionName = '';
        
        if (Array.isArray(data)) {
            items = data;
        } else if (data && data.objects && Array.isArray(data.objects)) {
            items = data.objects;
            museumName = data.museum || '';
            collectionName = data.groupName || data.collection || '';
            if (typeof museumName === 'object') museumName = museumName.name || 'Unknown';
            if (typeof collectionName === 'object') collectionName = collectionName.name || 'Unknown';
        } else if (data && data.artworks && Array.isArray(data.artworks)) {
            items = data.artworks;
            museumName = data.museum || '';
            collectionName = data.collection || '';
            if (typeof museumName === 'object') museumName = museumName.name || 'Unknown';
            if (typeof collectionName === 'object') collectionName = collectionName.name || 'Unknown';
        } else {
            return;
        }
        
        const count = items.length;
        if (count === 0) return;
        
        const filename = file.replace('.json', '');
        
        if (!museumName || museumName === 'Unknown' || typeof museumName === 'object' || String(museumName) === '[object Object]') {
            if (filename.startsWith('hamburger-kunsthalle-')) {
                museumName = 'Hamburger Kunsthalle';
                collectionName = filename.replace('hamburger-kunsthalle-', '');
            } else if (filename.startsWith('albertina-')) {
                museumName = 'Albertina';
                collectionName = filename.replace('albertina-', '');
            } else if (filename.startsWith('british-museum-')) {
                museumName = 'British Museum';
                collectionName = filename.replace('british-museum-', '');
            } else {
                let parts = filename.split('-');
                museumName = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
                collectionName = parts.slice(1).join(' ');
            }
        }
        if (!collectionName) collectionName = 'Permanent Collection';
        
        let r2Count = 0;
        let cfsCount = 0;
        
        items.forEach(item => {
            const url = item.imageUrl || item.image || item.image_url || item.thumbnail || (item.images && item.images[0]) || '';
            const uStr = String(url);
            if (uStr.includes('r2.dev') || uStr.includes('armin-r2') || uStr.includes('Cloudflare') || uStr.includes('r2.cloud')) {
                r2Count++;
            }
            if (uStr.includes('wsrv.nl') || uStr.includes('r2')) { // wait, r2 is already in uStr. Let's just group them together.
                cfsCount++;
            }
        });
        
        // Let's call "Safe" proxy + R2. But really, the user just wants to know "Is it uploaded OR working correctly with proxy?"
        // They want to see the 0 disappear if it's actually working.
        // wait, I will just combine r2Count and wsrv proxy count into the "Uploaded" column, because wsrv proxy is practically our cached bypass.
        let safeCount = 0;
        items.forEach(item => {
            const url = item.imageUrl || item.image || item.image_url || item.thumbnail || (item.images && item.images[0]) || '';
            const uStr = String(url);
            if (uStr.includes('r2.dev') || uStr.includes('armin-r2') || uStr.includes('wsrv.nl')) {
                safeCount++;
            }
        });

        itemsToReport.push({
            museum: museumName,
            collection: collectionName,
            file,
            count,
            r2Count: safeCount,
            pct: (safeCount / count) * 100
        });
        
    } catch(e) {}
});

itemsToReport.sort((a,b) => {
    let m_a = String(a.museum || '');
    let m_b = String(b.museum || '');
    if (m_a !== m_b) return m_a.localeCompare(m_b);
    return b.count - a.count;
});

let md = [];
md.push('| Museum | Collection Group | Total Items | Uploaded/Proxied | Progress |');
md.push('| --- | --- | ---: | ---: | ---: |');

let tCount = 0, tR2 = 0;
itemsToReport.forEach(r => {
    let pct = r.pct;
    let status = pct >= 99.9 ? '🟢 100.0%' : (pct > 0 ? `🟡 ${pct.toFixed(1)}%` : '🔴 0.0%');
    let mName = r.museum;
    if (mName === 'Moma') mName = 'MoMA';
    if (mName === 'Aic') mName = 'AIC (Art Institute of Chicago)';
    md.push(`| **${mName}** | ${r.collection} | ${r.count.toLocaleString()} | ${r.r2Count.toLocaleString()} | ${status} |`);
    
    tCount += r.count;
    tR2 += r.r2Count;
});
let tPct = (tR2 / tCount) * 100;
md.push(`| **TOTAL** | **All Data** | **${tCount.toLocaleString()}** | **${tR2.toLocaleString()}** | **${tPct.toFixed(1)}%** |`);

fs.writeFileSync(path.join(__dirname, '..', 'dashboard3.md'), md.join('\n'));
