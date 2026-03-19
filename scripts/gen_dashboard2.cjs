const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'public', 'data');
const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));

let totalItems = 0;
let totalR2 = 0;

let itemsToReport = [];

// Museums we know/care about (excluding misc files)
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
        } else if (data && data.artworks && Array.isArray(data.artworks)) {
            items = data.artworks;
            museumName = data.museum || '';
            collectionName = data.collection || '';
        } else {
            return;
        }
        
        const count = items.length;
        if (count === 0) return;
        
        const filename = file.replace('.json', '');
        
        // Ensure accurate labeling per user request
        if (!museumName) {
            if (filename.startsWith('hamburger-kunsthalle-')) {
                museumName = 'Hamburger Kunsthalle';
                collectionName = filename.replace('hamburger-kunsthalle-', '');
            } else if (filename.startsWith('albertina-')) {
                museumName = 'Albertina';
                collectionName = filename.replace('albertina-', '');
            } else {
                let parts = filename.split('-');
                museumName = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
                collectionName = parts.slice(1).join(' ');
            }
        }
        
        if (!collectionName) {
            collectionName = 'Permanent Collection'; // Default naming
        }
        
        let r2Count = 0;
        items.forEach(item => {
            if (item.imageUrl && (item.imageUrl.includes('r2.dev') || item.imageUrl.includes('armin-r2'))) {
                r2Count++;
            }
        });
        
        itemsToReport.push({
            museum: museumName,
            collection: collectionName,
            file,
            count,
            r2Count,
            pct: r2Count / count * 100
        });
        
        totalItems += count;
        totalR2 += r2Count;
    } catch(e) {}
});

// Group visually
itemsToReport.sort((a,b) => {
    let m_a = String(a.museum || '');
    let m_b = String(b.museum || '');
    if (m_a !== m_b) return m_a.localeCompare(m_b);
    return b.count - a.count;
});

// Create Markdown
let md = [];
md.push('| Museum | Collection Group | Total Items | Uploaded to R2 | Progress |');
md.push('| --- | --- | ---: | ---: | ---: |');
itemsToReport.forEach(r => {
    let status = r.pct >= 99.9 ? '🟢 100.0%' : (r.pct > 0 ? `🟡 ${r.pct.toFixed(1)}%` : '🔴 0.0%');
    let mName = r.museum;
    // capitalize properly
    if (mName === 'Moma') mName = 'MoMA';
    if (mName === 'Aic') mName = 'AIC (Art Institute of Chicago)';
    md.push(`| **${mName}** | ${r.collection} | ${r.count.toLocaleString()} | ${r.r2Count.toLocaleString()} | ${status} |`);
});
md.push(`| **TOTAL** | **All Analyzed Data** | **${totalItems.toLocaleString()}** | **${totalR2.toLocaleString()}** | **${(totalR2/totalItems*100).toFixed(1)}%** |`);

fs.writeFileSync('dashboard.md', md.join('\n'));
