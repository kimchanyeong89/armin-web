const https = require('node:https');
const readline = require('node:readline');

const INDEX_URL = 'https://smithsonian-open-access.s3-us-west-2.amazonaws.com/metadata/edan/saam/index.txt';
// Check more files to get a better distribution
const FILES_TO_CHECK = 15;

async function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function processFile(url) {
    const types = {};
    let count = 0;
    
    return new Promise((resolve) => {
        https.get(url, (res) => {
            const rl = readline.createInterface({ input: res, crlfDelay: Infinity });
            rl.on('line', (line) => {
                if(!line.trim()) return;
                try {
                    const doc = JSON.parse(line);
                    if(doc.type !== 'edanmdm') return;
                    if(doc.unitCode !== 'SAAM') return;
                    
                    const content = doc.content || {};
                    const objTypes = content.indexedStructured?.object_type || [];
                    
                    if (objTypes.length === 0) {
                        types['(empty)'] = (types['(empty)'] || 0) + 1;
                    }

                    objTypes.forEach(t => {
                        types[t] = (types[t] || 0) + 1;
                    });
                    
                    count++;
                } catch(e) {}
            });
            rl.on('close', () => resolve(types));
        });
    });
}

async function main() {
    console.log('Fetching index...');
    const index = await fetchText(INDEX_URL);
    const urls = index.split(/\s+/).filter(s => s.endsWith('.txt')).slice(0, FILES_TO_CHECK);

    const aggTypes = {};
    console.log(`Scanning ${urls.length} files for object_type distribution...`);

    for (const u of urls) {
        const t = await processFile(u);
        for (const [k, v] of Object.entries(t)) {
            aggTypes[k] = (aggTypes[k] || 0) + v;
        }
    }

    console.log('Top Object Types:');
    Object.entries(aggTypes)
        .sort((a,b) => b[1] - a[1])
        .slice(0, 30) // Show top 30
        .forEach(([k,v]) => console.log(`${k}: ${v}`));
}

main();
