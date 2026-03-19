const fs = require('fs');
const content = fs.readFileSync('museum_r2_status_v4.md', 'utf-8');
const lines = content.split('\n');
const table = lines.filter(l => l.startsWith('|') && !l.includes('---|') && !l.includes('미술관 (Museum)'));

const countries = {};

table.forEach(line => {
    const parts = line.split('|').map(p => p.trim());
    if (parts.length >= 7) {
        let museum = parts[1].replace(/\*\*/g, '').trim();
        let country = parts[2].trim();
        if (country === 'United States') country = 'USA';
        if (country === 'United Kingdom') country = 'UK';
        if (!country || country === '국가 (Country)' || country === 'Unknown') return;
        
        let t = parseInt(parts[4].replace(/\*\*/g, '').replace(/,/g, '')) || 0;
        let r = parseInt(parts[5].replace(/\*\*/g, '').replace(/,/g, '')) || 0;
        
        if (!countries[country]) countries[country] = [];
        countries[country].push({ museum, t, r });
    }
});

let out = [];
out.push('| 국가 | 미술관 (Museum) | 수집된 전시작품 수 | R2 저장 완료 | 진행률 |');
out.push('|:---|:---|---:|---:|---:|');

let gT = 0; let gR = 0;

Object.keys(countries).sort((a, b) => a.localeCompare(b)).forEach(c => {
    let mDict = {};
    countries[c].forEach(item => {
        if (!mDict[item.museum]) mDict[item.museum] = {t:0, r:0};
        mDict[item.museum].t += item.t;
        mDict[item.museum].r += item.r;
    });
    
    let isFirst = true;
    Object.keys(mDict).sort((a,b) => a.localeCompare(b, 'en', {sensitivity: 'base'})).forEach(m => {
        let t = mDict[m].t;
        let r = mDict[m].r;
        let pct = t > 0 ? (r / t * 100) : 0;
        gT += t; gR += r;
        
        let cLabel = isFirst ? '**' + c + '**' : '';
        let pctStr = pct > 0 ? pct.toFixed(1) + '%' : '-';
        let status = pct >= 99 ? '✅' : (pct > 0 ? '🟠' : '⚪️');
        
        out.push('| ' + cLabel + ' | ' + m + ' | **' + t.toLocaleString() + '** | **' + r.toLocaleString() + '** | ' + status + ' ' + pctStr + ' |');
        isFirst = false;
    });
});

let glPct = gT > 0 ? (gR / gT * 100).toFixed(1) : 0;
let header = '### 🌍 글로벌 미술관 영구전시 R2 스토리지 연동 현황\n\n- **전체 수집 작품 수:** ' + gT.toLocaleString() + '\n- **R2 변환 완료 수:** ' + gR.toLocaleString() + ' (' + glPct + '%)\n\n';

fs.writeFileSync('final_table.md', header + out.join('\n'));
