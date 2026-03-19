const fs = require('fs');
const exhibitions = require('./temp_exhibitions.cjs');

const rows = [];
let overallTotalItems = 0;
let overallR2Items = 0;

for (const museum of exhibitions) {
    const perms = museum.permanentExhibitions || [];
    if (perms.length === 0) {
        rows.push({
            country: museum.country,
            museum: museum.name,
            exhibition: '-',
            file: '-',
            total: 0,
            r2: 0
        });
    } else {
        for (const p of perms) {
            let total = 0;
            let r2 = 0;
            if (p.collectionFile) {
                const fpath = 'public/data/' + p.collectionFile;
                if (fs.existsSync(fpath)) {
                    try {
                        const data = JSON.parse(fs.readFileSync(fpath, 'utf8'));
                        
                        let itemsArray = null;
                        if (Array.isArray(data)) {
                            itemsArray = data;
                        } else if (data.items && Array.isArray(data.items)) {
                            itemsArray = data.items;
                        } else if (data.objects && Array.isArray(data.objects)) {
                            itemsArray = data.objects;
                        } else if (data.data && Array.isArray(data.data)) {
                            itemsArray = data.data;
                        } else if (data.results && Array.isArray(data.results)) {
                            itemsArray = data.results;
                        } else {
                            // Find any root level array
                            for (let key in data) {
                                if (Array.isArray(data[key]) && data[key].length > 0) {
                                    itemsArray = data[key];
                                    break;
                                }
                            }
                        }
                        
                        if (itemsArray) {
                            total = itemsArray.length;
                            for (const item of itemsArray) {
                                let imgStr = "";
                                if (typeof item.image === 'string') imgStr = item.image;
                                else if (typeof item.imageUrl === 'string') imgStr = item.imageUrl;
                                else if (typeof item.image_url === 'string') imgStr = item.image_url;
                                else if (item.image && typeof item.image.url === 'string') imgStr = item.image.url;
                                else if (item.images && Array.isArray(item.images) && typeof item.images[0] === 'string') imgStr = item.images[0];
                                
                                if (imgStr.includes('r2.dev') || imgStr.includes('cloudflare')) {
                                    r2++;
                                }
                            }
                        }
                    } catch(e) {}
                }
            }
            overallTotalItems += total;
            overallR2Items += r2;
            rows.push({
                country: museum.country,
                museum: museum.name,
                exhibition: p.title,
                file: p.collectionFile || '-',
                total: total,
                r2: r2
            });
        }
    }
}

rows.sort((a, b) => a.country.localeCompare(b.country) || a.museum.localeCompare(b.museum));

let out = '| 순번 | 국가 | 미술관 | 영구전시명 | 파일명 | 데이터 수 | R2 저장수 | R2 비율 |\n';
out += '|---|---|---|---|---|---|---|---|\n';
let i = 1;
for (const r of rows) {
    const pct = r.total > 0 ? ((r.r2 / r.total) * 100).toFixed(1) + '%' : '-';
    out += `| ${i++} | ${r.country} | ${r.museum} | ${r.exhibition} | ${r.file} | ${r.total.toLocaleString()} | ${r.r2.toLocaleString()} | ${pct} |\n`;
}
out += `\n**총 데이터 수 (영구전시 기준)**: ${overallTotalItems.toLocaleString()} 건\n`;
out += `**R2 저장 총 건수**: ${overallR2Items.toLocaleString()} 건 (${((overallR2Items/Math.max(1,overallTotalItems))*100).toFixed(1)}%)\n`;
fs.writeFileSync('r2_table.md', out);
