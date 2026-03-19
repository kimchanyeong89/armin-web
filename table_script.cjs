const fs = require('fs');
const path = require('path');

// Extract exhibitions list
const content = fs.readFileSync('src/data/exhibitions.js', 'utf8');
const exhibitionsMatch = content.match(/export const exhibitions = (\[[\s\S]*?\n\]);/);
let museums = [];
if (exhibitionsMatch) {
    museums = eval(exhibitionsMatch[1]);
} else {
    console.error("Could not parse exhibitions.js");
    process.exit(1);
}

let rows = [];
museums.forEach(museum => {
    (museum.permanentExhibitions || []).forEach(ex => {
        let totalCount = 0;
        let r2Count = 0;
        let hasError = false;

        const p = path.join('public', 'data', ex.collectionFile || 'none.json');
        if (fs.existsSync(p)) {
            try {
                let items = JSON.parse(fs.readFileSync(p, 'utf8'));
                if (ex.id === 'wallace-collection') {
                    items = items.rooms ? items.rooms.flatMap(r => r.artworks || []) : (items.artworks || items);
                }
                if (!Array.isArray(items) && items.artworks) {
                    items = items.artworks;
                }
                if (Array.isArray(items)) {
                    totalCount = items.length;
                    r2Count = items.filter(i => {
                        const img = i.image || i.imageUrl || i.Image || i.image_url || i.url;
                        if (typeof img === 'string' && img.includes('r2.dev')) return true;
                        
                        // Check if r2.dev in stringified item
                        const str = JSON.stringify(i);
                        return str.includes('r2.dev');
                    }).length;
                }
            } catch (e) {
                hasError = true;
            }
        } else {
            hasError = true;
        }

        rows.push({
            country: museum.country || 'Unknown',
            museumName: museum.name,
            exhibitionName: ex.title,
            exhibitionId: ex.id,
            filename: ex.collectionFile || 'none.json',
            totalCount,
            r2Count,
            hasError
        });
    });
});

// Sort alphabetical by country, then museum name
rows.sort((a, b) => a.country.localeCompare(b.country) || a.museumName.localeCompare(b.museumName));

let md = `| 순번 | 국가 | 미술관 | 영구전시명 | exhibitionId | 파일명 | 데이터 수 | R2 업로드 수 |\n`;
md += `|---|---|---|---|---|---|---:|---:|\n`;

rows.forEach((r, i) => {
    md += `| ${i + 1} | ${r.country} | ${r.museumName} | ${r.exhibitionName} | ${r.exhibitionId} | ${r.filename} | ${r.totalCount.toLocaleString()} | ${r.r2Count.toLocaleString()} |\n`;
});

fs.writeFileSync('perm_table_final.md', md, 'utf-8');
console.log(`Generated ${rows.length} rows to perm_table_final.md.`);
