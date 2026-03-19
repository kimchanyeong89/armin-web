const fs = require('fs');

const lines = fs.readFileSync('perm_table_final.md', 'utf8').split('\n').filter(l => l.trim().startsWith('|'));
const data = lines.map(l => l.split('|').map(c => c.trim()).slice(1, -1));

const colWidths = [];
for (let c = 0; c < 8; c++) {
    colWidths[c] = Math.max(...data.map(row => (row[c] || '').length));
}

function getDisplayWidth(str) {
    let w = 0;
    for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        // Naive width check for Korean/CJK
        if (c > 0x1100 && c !== 0x2022) {
            w += 2;
        } else {
            w += 1;
        }
    }
    return w;
}

for (let c = 0; c < 8; c++) {
    colWidths[c] = Math.max(...data.map(row => getDisplayWidth(row[c] || '')));
}

function padRight(str, len) {
    const w = getDisplayWidth(str);
    return str + ' '.repeat(Math.max(0, len - w));
}

function padLeft(str, len) {
    const w = getDisplayWidth(str);
    return ' '.repeat(Math.max(0, len - w)) + str;
}

let out = '';
data.forEach((row, i) => {
    // Header sep
    if (i === 1) {
        out += '|' + colWidths.map((w, c) => {
            if (c === 0 || c >= 6) return ':' + '-'.repeat(w) + ':'; // centered/right
            return '-' + '-'.repeat(w) + '-';
        }).join('|') + '|\n';
        return;
    }
    out += '| ' + row.map((c, idx) => {
        if (idx === 0 || idx >= 6) return padLeft(c, colWidths[idx]);
        return padRight(c, colWidths[idx]);
    }).join(' | ') + ' |\n';
});

fs.writeFileSync('perm_table_final.md', out, 'utf8');
console.log("Formatted perm_table_final.md");
