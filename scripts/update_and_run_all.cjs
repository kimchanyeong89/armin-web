const fs = require('fs');

const MD_PATH = 'perm_table_final.md';
let lines = fs.readFileSync(MD_PATH, 'utf-8').split('\n');
const targetsToRun = [];

let inTable = false;
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('| No.') || line.includes('| 순번')) {
        inTable = true;
        continue;
    }
    if (line.includes('---')) continue;
    if (inTable && line.startsWith('| ')) {
        const parts = line.split('|').map(x => x.trim());
        if (parts.length > 8) {
            const id = parseInt(parts[1], 10);
            if (isNaN(id)) continue;
            
            const rawFileName = parts[6];
            if (!rawFileName) continue;
            let fileMatch = rawFileName.match(/href="([^"]+)"/) || rawFileName.match(/\[(.*?)\]/) || rawFileName;
            let fileRelPath = Array.isArray(fileMatch) ? fileMatch[1] : fileMatch;
            if (fileRelPath.includes(' ')) fileRelPath = fileRelPath.split(' ')[0];
            if (fileRelPath.includes('<')) fileRelPath = fileRelPath.split('<')[0];
            fileRelPath = fileRelPath.trim();
            
            let jsonFile = fileRelPath;
            const basename = fileRelPath.split('/').pop();
            
            if (!fs.existsSync(jsonFile)) {
                if (fs.existsSync(basename)) jsonFile = basename;
                else if (fs.existsSync('data/' + basename)) jsonFile = 'data/' + basename;
                else if (fs.existsSync('public/data/' + basename)) jsonFile = 'public/data/' + basename;
            }
            
            const prefix = parts[5].replace(/<[^>]*>?/gm, '').trim();
            
            if (fs.existsSync(jsonFile)) {
                try {
                    const content = fs.readFileSync(jsonFile, 'utf-8');
                    let data = null;
                    try {
                        data = JSON.parse(content);
                    } catch(e) { }
                    
                    let totalCount = parseInt(parts[7].replace(/,/g, ''), 10) || 0;
                    
                    let actualR2 = 0;
                    if (Array.isArray(data)) {
                        totalCount = data.length;
                        for (const item of data) {
                            let ok = JSON.stringify(item).includes('r2.dev');
                            if (ok) actualR2++;
                        }
                    } else if (data && data.items) {
                        totalCount = data.items.length;
                        for (const item of data.items) {
                            let ok = JSON.stringify(item).includes('r2.dev');
                            if (ok) actualR2++;
                        }
                    } else if (data && data.data) {
                        totalCount = data.data.length;
                        for (const item of data.data) {
                            let ok = JSON.stringify(item).includes('r2.dev');
                            if (ok) actualR2++;
                        }
                    } else {
                        actualR2 = (content.match(/r2\.dev/g) || []).length;
                    }

                    parts[7] = totalCount.toString();
                    parts[8] = actualR2.toString();

                    lines[i] = `| ${parts.slice(1, -1).join(' | ')} |`;
                    
                    if (actualR2 < totalCount && totalCount > 0) {
                         targetsToRun.push(`${jsonFile}|${prefix}`);
                    }
                } catch(e) {
                     console.error("Error read/parse", jsonFile);
                }
            } else {
                 // console.log("Missing entirely:", jsonFile, "or", basename);
            }
        }
    }
}

fs.writeFileSync(MD_PATH, lines.join('\n'));
console.log(`Updated ${MD_PATH}. Need to run ${targetsToRun.length} collections.`);
fs.writeFileSync('missing_targets.txt', targetsToRun.join('\n'));
