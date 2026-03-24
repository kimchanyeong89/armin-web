const fs = require('fs');

const MD_PATH = 'perm_table_final.md';
let lines = fs.readFileSync(MD_PATH, 'utf-8').split('\n');

const targetsToRun = [];

let inTable = false;
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('| ID |')) {
        inTable = true;
        continue;
    }
    if (inTable && line.startsWith('| ')) {
        const parts = line.split('|').map(x => x.trim());
        if (parts.length > 5) {
            const id = parseInt(parts[1], 10);
            if (isNaN(id)) continue;
            
            const fileMatch = parts[4].match(/\[(.*?)\]/);
            if (!fileMatch) continue;
            const jsonFile = fileMatch[1];
            
            const prefixMatch = parts[4].match(/\`(.+?)\`/);
            const prefix = prefixMatch ? prefixMatch[1] : jsonFile.replace('.json', '');
            
            let totalCount = 0;
            let totalWithCount = parseInt(parts[2], 10);
            if (isNaN(totalWithCount)) totalWithCount = 0;

            if (fs.existsSync(jsonFile)) {
                try {
                    const data = JSON.parse(fs.readFileSync(jsonFile, 'utf-8'));
                    totalCount = data.length || 0;
                    if (totalCount === 0 && data.items) totalCount = data.items.length;
                    
                    let countR2 = 0;
                    const items = Array.isArray(data) ? data : (data.items || []);
                    for (const item of items) {
                        let ok = false;
                        if (item.image && typeof item.image === 'string' && item.image.includes('r2.dev')) ok = true;
                        if (item.images && Array.isArray(item.images)) {
                            if (item.images.some(img => typeof img === 'string' && img.includes('r2.dev'))) ok = true;
                            else if (item.images.some(img => img.url && typeof img.url === 'string' && img.url.includes('r2.dev'))) ok = true;
                        }
                        if (item.imageObjects && Array.isArray(item.imageObjects)) {
                             if (item.imageObjects.some(img => img.url && typeof img.url === 'string' && img.url.includes('r2.dev'))) ok = true;
                        }
                        if (ok) countR2++;
                    }
                    
                    let pct = Math.floor((countR2 / totalCount) * 100) || 0;
                    if (totalCount === 0) pct = 0;
                    
                    let r2ScoreStr = `${pct}%`;
                    if (countR2 >= totalCount && totalCount > 0) r2ScoreStr = `100% [DONE]`;

                    // Update parts[6]
                    parts[6] = r2ScoreStr;
                    lines[i] = `| ${parts.slice(1, -1).join(' | ')} |`;
                    
                    if (countR2 < totalCount && totalCount > 0) {
                        targetsToRun.push(`"${jsonFile}|${prefix}"`);
                    }
                } catch(e) {
                    console.error("Error parsing " + jsonFile, e.message);
                }
            }
        }
    }
}

fs.writeFileSync(MD_PATH, lines.join('\n'));
console.log(`Updated ${MD_PATH}. Need to run ${targetsToRun.length} collections.`);
fs.writeFileSync('missing_targets.txt', targetsToRun.join(' '));
