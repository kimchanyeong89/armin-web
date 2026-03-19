const fs = require('fs');
const exhibitions = require('./temp_exhibitions.cjs');

const rows = [];
let totalItems = 0;

for (const museum of exhibitions) {
    const perms = museum.permanentExhibitions || [];
    if (perms.length === 0) {
        rows.push({
            country: museum.country,
            museum: museum.name,
            exhibition: '-',
            items: 0,
            file: '-'
        });
    } else {
        for (const p of perms) {
            let itemCount = 0;
            if (p.collectionFile) {
                const fpath = 'public/data/' + p.collectionFile;
                if (fs.existsSync(fpath)) {
                    try {
                        const data = JSON.parse(fs.readFileSync(fpath, 'utf8'));
                        itemCount = data.length || (data.items ? data.items.length : 0);
                        totalItems += itemCount;
                    } catch(e) {}
                }
            }
            rows.push({
                country: museum.country,
                museum: museum.name,
                exhibition: p.title,
                items: itemCount,
                file: p.collectionFile || '-'
            });
        }
    }
}

rows.sort((a, b) => a.country.localeCompare(b.country) || a.museum.localeCompare(b.museum));

let out = '| 순번 | 국가 | 미술관 | 영구전시명 | 파일명 | 데이터 수 |\n';
out += '|---|---|---|---|---|---|\n';
let i = 1;
for (const r of rows) {
    out += `| ${i++} | ${r.country} | ${r.museum} | ${r.exhibition} | ${r.file} | ${r.items.toLocaleString()} |\n`;
}
out += `\n**총합**: ${totalItems.toLocaleString()} 건\n`;
fs.writeFileSync('perm_table2.md', out);
