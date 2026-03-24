const fs = require('fs');

let content = fs.readFileSync('table_script_v4.cjs', 'utf-8');

if (!content.includes('let sumTotal = 0;')) {
    content = content.replace(
        'rows.forEach((r, i) => {\n',
        'let sumTotal = 0;\nlet sumR2 = 0;\nrows.forEach((r, i) => {\n    sumTotal += r.totalCount;\n    sumR2 += r.r2Count;\n'
    );
    content = content.replace(
        "fs.writeFileSync('perm_table_final.md', md, 'utf-8');",
        "md += `\\n**전체 데이터 수 총합:** ${sumTotal.toLocaleString()}\\n`;\nmd += `**전체 R2 업로드 수 총합:** ${sumR2.toLocaleString()}\\n`;\n\nfs.writeFileSync('perm_table_final.md', md, 'utf-8');"
    );
    fs.writeFileSync('table_script_v4.cjs', content, 'utf-8');
}
