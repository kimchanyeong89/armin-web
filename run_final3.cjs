const fs = require('fs');
const path = require('path');
const { exhibitions } = require('./src/data/exhibitions.js');

const dataDir = path.join(__dirname, 'public/data');

const museumData = {};

let totalItems = 0;
let totalR2 = 0;

for (const ex of exhibitions) {
    if (!ex.permanentExhibitions || ex.permanentExhibitions.length === 0) continue;
    
    let country = ex.country || 'Unknown';
    if (country === 'United States') country = 'USA';
    if (country === 'United Kingdom') country = 'UK';

    let mItems = 0;
    let mR2 = 0;

    for (const p of ex.permanentExhibitions) {
        if (!p.id) continue;
        const filename = p.collectionFile || `${p.id}.json`;
        const filePath = path.join(dataDir, filename);
        
        if (fs.existsSync(filePath)) {
            try {
                const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                let dataArr = [];
                if (Array.isArray(data)) dataArr = data;
                else if (data.items) dataArr = data.items;
                else if (data.objects) dataArr = data.objects;
                else if (data.artworks) dataArr = data.artworks;
                else if (data.rooms) dataArr = data.rooms.flatMap(room => room.artworks || room.items || []);

                let pItems = dataArr.length;
                let pR2 = dataArr.filter(d => {
                    const str = JSON.stringify(d);
                    return str.includes('r2.dev') || str.includes('r2.cloudflarestorage') || str.includes('pub-08d4dcbf45444caebd2ce34f248bb0ec.r2.build');
                }).length;
                
                mItems += pItems;
                mR2 += pR2;
            } catch (e) {
                // ignore
            }
        }
    }
    
    if (mItems > 0 || mR2 > 0) {
        if (!museumData[country]) museumData[country] = [];
        museumData[country].push({ museum: ex.name, t: mItems, r: mR2 });
        totalItems += mItems;
        totalR2 += mR2;
    }
}

let out = [];
out.push('| 국가 | 미술관 (Museum) | 수집된 전시작품 수 | R2 저장 완료 | 진행률 |');
out.push('|:---|:---|---:|---:|---:|');

Object.keys(museumData).sort((a, b) => a.localeCompare(b)).forEach(c => {
    let mDict = {};
    museumData[c].forEach(item => {
        if (!mDict[item.museum]) mDict[item.museum] = {t:0, r:0};
        mDict[item.museum].t += item.t;
        mDict[item.museum].r += item.r;
    });
    
    let isFirst = true;
    Object.keys(mDict).sort((a,b) => a.localeCompare(b, 'en', {sensitivity: 'base'})).forEach(m => {
        let t = mDict[m].t;
        let r = mDict[m].r;
        let pct = t > 0 ? (r / t * 100) : 0;
        
        let cLabel = isFirst ? '**' + c + '**' : '';
        let pctStr = pct > 0 ? pct.toFixed(1) + '%' : '-';
        let status = pct >= 99.9 ? '✅' : (pct >= 50 ? '🟠' : (pct > 0 ? '🟡' : '⚪️'));
        
        out.push('| ' + cLabel + ' | ' + m.replace(/\|/g, '\\|') + ' | **' + t.toLocaleString() + '** | **' + r.toLocaleString() + '** | ' + status + ' ' + pctStr + ' |');
        isFirst = false;
    });
});

let glPct = totalItems > 0 ? (totalR2 / totalItems * 100).toFixed(1) : 0;
let header = '### 🌍 글로벌 미술관 영구전시 R2 스토리지 연동 현황 (전체)\n\n- **전체 수집 작품 수:** ' + totalItems.toLocaleString() + '\n- **R2 변환 완료 수:** ' + totalR2.toLocaleString() + ' (' + glPct + '%)\n\n';

fs.writeFileSync('final_table.md', header + out.join('\n'));
console.log("Done");