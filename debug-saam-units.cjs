const https = require('node:https');
const readline = require('node:readline');

const INDEX_URL = 'https://smithsonian-open-access.s3-us-west-2.amazonaws.com/metadata/edan/saam/index.txt';
// Check 10 files
const FILES_TO_CHECK = 10;

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
    const stats = {
        unitCodes: {},
        saamPaintings: 0,
        otherPaintings: 0
    };
    
    return new Promise((resolve) => {
        https.get(url, (res) => {
            const rl = readline.createInterface({ input: res, crlfDelay: Infinity });
            rl.on('line', (line) => {
                if(!line.trim()) return;
                try {
                    const doc = JSON.parse(line);
                    if(doc.type !== 'edanmdm') return;
                    
                    const uc = doc.unitCode || 'MISSING';
                    stats.unitCodes[uc] = (stats.unitCodes[uc] || 0) + 1;

                    const content = doc.content || {};
                    const objTypes = content.indexedStructured?.object_type || [];
                    const isPainting = objTypes.some(t => /painting/i.test(t));
                    
                    if (isPainting) {
                        if (uc === 'SAAM') stats.saamPaintings++;
                        else stats.otherPaintings++;
                    }
                } catch(e) {}
            });
            rl.on('close', () => resolve(stats));
        });
    });
}

async function main() {
    console.log('Fetching index...');
    const index = await fetchText(INDEX_URL);
    const urls = index.split(/\s+/).filter(s => s.endsWith('.txt')).slice(0, FILES_TO_CHECK);

    const agg = { unitCodes: {}, saamPaintings: 0, otherPaintings: 0 };
    console.log(`Scanning ${urls.length} files...`);

    for (const u of urls) {
        const s = await processFile(u);
        agg.saamPaintings += s.saamPaintings;
        agg.otherPaintings += s.otherPaintings;
        for (const [k,v] of Object.entries(s.unitCodes)) {
            agg.unitCodes[k] = (agg.unitCodes[k] || 0) + v;
        }
    }
    
    console.log('Unit Codes:');
    console.log(JSON.stringify(agg.unitCodes, null, 2));
    console.log('Paintings (SAAM):', agg.saamPaintings);
    console.log('Paintings (Other):', agg.otherPaintings);
}

main();
