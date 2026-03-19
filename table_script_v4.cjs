const fs = require('fs');
const path = require('path');

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

        const filename = ex.collectionFile || `${ex.id}.json`;
        const p = path.join('public', 'data', filename);

        if (fs.existsSync(p)) {
            try {
                let items = JSON.parse(fs.readFileSync(p, 'utf8'));
                if (ex.id === 'wallace-collection') {
                    items = items.rooms ? items.rooms.flatMap(r => r.artworks || []) : (items.artworks || items);
                }
                
                if (items && !Array.isArray(items)) {
                    let foundArray = null;
                    const findArray = (obj) => {
                        if (Array.isArray(obj)) return obj;
                        if (!obj || typeof obj !== 'object') return null;
                        for (const key of ['artworks', 'objects', 'data', 'items', 'results']) {
                            if (Array.isArray(obj[key])) return obj[key];
                        }
                        for (const val of Object.values(obj)) {
                            if (Array.isArray(val)) return val;
                        }
                        return null;
                    };
                    items = findArray(items) || items;
                }

                if (Array.isArray(items)) {
                    totalCount = items.length;
                    r2Count = items.filter(i => {
                        const keys = ['image', 'imageUrl', 'Image', 'image_url', 'url', 'r2_url', 'img', 'src', 'file'];
                        for (const k of keys) {
                            if (typeof i[k] === 'string' && (i[k].includes('r2.dev') || i[k].includes('r2.cloudflarestorage'))) return true;
                        }
                        if (i.images && Array.isArray(i.images) && JSON.stringify(i.images).includes('r2.dev')) return true;
                        return false;
                    }).length;
                } else {
                    console.log(`Could not find array in ${filename}`);
                }
            } catch (e) {
                console.log(`Parse error in ${filename}`);
                hasError = true;
            }
        } else {
            console.log(`Missing file: ${filename}`);
            hasError = true;
        }

        rows.push({
            country: museum.country || 'Unknown',
            museumName: museum.name,
            exhibitionName: ex.title || ex.name,
            exhibitionId: ex.id,
            filename: filename,
            totalCount,
            r2Count,
            hasError
        });
    });
});

rows.sort((a, b) => a.country.localeCompare(b.country) || a.museumName.localeCompare(b.museumName));

let md = `| 순번 | 국가 | 미술관 | 영구전시명 | exhibitionId | 파일명 | 데이터 수 | R2 업로드 수 |\n`;
md += `|:---:|:---|:---|:---|:---|:---|---:|---:|\n`;

rows.forEach((r, i) => {
    md += `| ${i + 1} | ${r.country || ''} | ${(r.museumName || '').replace(/\|/g, ",")} | ${(r.exhibitionName || '').replace(/\|/g, ",")} | ${r.exhibitionId || ''} | ${r.filename || ''} | ${r.totalCount.toLocaleString()} | ${r.r2Count.toLocaleString()} |\n`;
});

fs.writeFileSync('perm_table_final.md', md, 'utf-8');
console.log(`Generated ${rows.length} rows to perm_table_final.md.`);
const zeroes = rows.filter(r => r.totalCount === 0);
if (zeroes.length) {
    console.log("ZEROES FOUND:", zeroes.map(z => z.filename));
} else {
    console.log("No zeros found! All good.");
}
